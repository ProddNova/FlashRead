const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'flashread';
const jwtSecret = process.env.JWT_SECRET || 'change-me-in-render';

const seedUser = {
  username: 'jack',
  password: 'Giacomo090665'
};

if (!mongoUri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname)));

let db;

function sanitizeLanguage(value) {
  return value === 'it' ? 'it' : 'en';
}

function userResponse(user) {
  return { id: String(user._id), username: user.username, language: sanitizeLanguage(user.language) };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing token.' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.userId = payload.sub;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
}

async function ensureSeedUser() {
  const users = db.collection('users');
  const existing = await users.findOne({ username: seedUser.username });
  if (existing) return;

  const passwordHash = await bcrypt.hash(seedUser.password, 10);
  await users.insertOne({
    username: seedUser.username,
    passwordHash,
    language: 'en',
    createdAt: new Date()
  });
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function issueAuthPayload(user) {
  const token = jwt.sign({ sub: String(user._id), username: user.username }, jwtSecret, { expiresIn: '30d' });
  return { token, user: userResponse(user) };
}


function createDemoBook(userId) {
  const now = Date.now();
  return {
    id: `demo-${userId}`,
    userId,
    title: 'Welcome to FlashRead (Demo)',
    text: 'This is your demo book. Add your own files or paste text to start speed reading right away.',
    index: 0,
    wpm: 320,
    ctxCount: 3,
    settings: {
      fontScale: 72,
      verticalPos: 45,
      wordAlign: 'center',
      adaptiveWpm: true,
      theme: 'light',
      fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      savedAt: now,
      highlightBlocks: false,
      groupShort: 'on'
    },
    savedAt: now,
    updatedAt: now
  };
}

app.post('/api/auth/register', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  const language = sanitizeLanguage(req.body.language);

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    res.status(400).json({ error: 'Invalid username.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password too short (min 8 characters).' });
    return;
  }

  const users = db.collection('users');
  const existing = await users.findOne({ username });

  if (existing) {
    res.status(409).json({ error: 'Username already registered.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await users.insertOne({
    username,
    passwordHash,
    language,
    createdAt: new Date()
  });

  const user = await users.findOne({ _id: result.insertedId });
  res.status(201).json(issueAuthPayload(user));
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');

  const users = db.collection('users');
  const user = await users.findOne({ username });

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  res.json(issueAuthPayload(user));
});

app.get('/api/bootstrap', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const profile = await db.collection('profiles').findOne({ userId });

  const users = db.collection('users');
  let user = null;
  if (ObjectId.isValid(userId)) {
    user = await users.findOne({ _id: new ObjectId(userId) });
  }

  const booksCollection = db.collection('books');
  let books = await booksCollection.find({ userId }).sort({ savedAt: -1 }).toArray();

  if (!books.length) {
    const demoBook = createDemoBook(userId);
    await booksCollection.insertOne(demoBook);
    books = [demoBook];
  }

  res.json({
    user: user ? userResponse(user) : null,
    session: profile?.session || null,
    settings: profile?.settings || null,
    library: {
      books: books.map(({ _id, userId: _, ...book }) => book),
      currentBookId: profile?.currentBookId || null
    }
  });
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  const settings = req.body || {};
  await db.collection('profiles').updateOne(
    { userId: req.userId },
    {
      $set: {
        settings,
        updatedAt: Date.now()
      },
      $setOnInsert: { userId: req.userId }
    },
    { upsert: true }
  );

  res.json({ ok: true });
});

app.put('/api/state', authMiddleware, async (req, res) => {
  const state = req.body || {};
  await db.collection('profiles').updateOne(
    { userId: req.userId },
    {
      $set: {
        session: state,
        currentBookId: state.currentBookId || null,
        updatedAt: Date.now()
      },
      $setOnInsert: { userId: req.userId }
    },
    { upsert: true }
  );

  res.json({ ok: true });
});

app.put('/api/books/:id', authMiddleware, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'Invalid book ID.' });
    return;
  }

  const book = { ...req.body, id, userId: req.userId, updatedAt: Date.now() };
  await db.collection('books').updateOne({ userId: req.userId, id }, { $set: book }, { upsert: true });
  res.json({ ok: true });
});

app.delete('/api/books/:id', authMiddleware, async (req, res) => {
  const id = String(req.params.id || '').trim();
  await db.collection('books').deleteOne({ userId: req.userId, id });
  res.json({ ok: true });
});

app.post('/api/clear', authMiddleware, async (req, res) => {
  await db.collection('books').deleteMany({ userId: req.userId });
  await db.collection('profiles').deleteOne({ userId: req.userId });
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function start() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(dbName);
  await ensureSeedUser();

  app.listen(port, () => {
    console.log(`FlashRead server listening on ${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
