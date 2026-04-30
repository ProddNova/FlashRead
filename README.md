# FlashRead

## Guida rapida: custom theme JSON (con font ed effetti testo)

Puoi importare temi personalizzati dal modal **Import custom themes** con JSON nel formato:

```json
{
  "customThemes": [
    {
      "id": "custom-my-theme",
      "name": "My Theme",
      "grad": "linear-gradient(135deg,#1f2937,#22c55e,#16a34a)",
      "custom": true,
      "vars": {
        "bg": "#111111",
        "card": "#1f1f1f",
        "ink": "#f5f5f5",
        "muted": "#b3b3b3",
        "accent": "#22c55e",
        "accent2": "#16a34a",

        "fontFamily": "Inter,Segoe UI,sans-serif",
        "textGlowColor": "#22c55e",
        "textGlowStrength": 35,
        "textOutlineColor": "#000000",
        "textOutlineWidth": 1
      }
    }
  ]
}
```

### Parametri principali (vars)
- `fontFamily`: font del reader legato al tema.
- `textGlowColor`: colore luminosità testo.
- `textGlowStrength`: intensità glow `0-100`.
- `textOutlineColor`: colore bordo testo.
- `textOutlineWidth`: spessore bordo `0-4` px.

Note:
- `id` dovrebbe iniziare con `custom-`.
- Puoi importare anche direttamente un array di temi (senza wrapper `customThemes`).
- Se alcuni campi mancano, FlashRead applica fallback automatici.
