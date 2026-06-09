# Heat Pump Lexikon — Fachvokabel-Trainer

Ein Vokabeltrainer für die **Wärmepumpen-Prüftechnik** (EN 14511, EN 14825,
Ökodesign-Verordnung (EU) 2016/2281).
Lernkarten Englisch → Deutsch/Persisch mit Beispielsätzen, Aussprache, Dark Mode
und Spaced Repetition. Läuft komplett im Browser, ohne Server und ohne Konto.

## Version

Die App zeigt ihre Version auf der Übersichtsseite und im Kopf an, z. B.
`App 1.1.0 · Vokabeldaten v2 · 69 Begriffe`. So lässt sich nach einem Update
prüfen, ob im Browser wirklich die neueste Fassung läuft (ggf. die Seite mit
Strg+F5 neu laden). Die App-Version steht in `app.js` (`APP_VERSION`), die
Daten-Version im Feld `meta.version` von `vocabulary.json`.

## Funktionen

- **Lernkarten** mit Fachbegriff (Englisch) auf der Vorderseite; auf der Rückseite
  deutsche und persische Bedeutung sowie ein Beispielsatz in allen drei Sprachen.
- **Spaced Repetition (SM-2):** „Kenne ich" verlängert den Abstand, „Kenne ich nicht"
  legt die Karte zurück in den Lernstapel und fragt sie bald erneut ab. Karten gelten
  ab 21 Tagen Intervall als *gefestigt*.
- **Aussprache** für Englisch und Deutsch über die Sprachausgabe des Browsers.
- **Dauerhafter Fortschritt:** alles wird lokal im Browser gespeichert. Beim erneuten
  Öffnen geht es genau dort weiter, wo du aufgehört hast.
- **Dark Mode** (Standard) und heller Modus, umschaltbar oben rechts.
- **Einfach erweiterbar:** neue Begriffe per JSON ergänzen, ohne den Fortschritt zu verlieren.

## Tastatur (im Lernmodus)

- `Leertaste` / `Enter` — Antwort zeigen
- `1` — Kenne ich nicht · `2` — Kenne ich · `3` — Sehr sicher

## Auf GitHub Pages veröffentlichen

1. Neues Repository auf GitHub anlegen (z. B. `heat-pump-vocab`).
2. Die vier Dateien hochladen: `index.html`, `style.css`, `app.js`, `vocabulary.json`
   (diese README ist optional).
3. Im Repository: **Settings → Pages → Build and deployment**.
4. Bei *Source* **Deploy from a branch** wählen, Branch `main`, Ordner `/root`, speichern.
5. Nach ein bis zwei Minuten ist die App unter
   `https://<dein-name>.github.io/heat-pump-vocab/` erreichbar.

## Lokal testen

Beim direkten Öffnen von `index.html` (Doppelklick) blockiert der Browser das Laden
von `vocabulary.json`. Starte deshalb einen kleinen lokalen Server:

```bash
cd heat-pump-vocab
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```

Alternativ funktioniert das Hinzufügen von Begriffen auch ohne Server über den
Reiter **Hinzufügen** (siehe unten).

## Neue Begriffe hinzufügen

Es gibt zwei Wege — der Fortschritt bleibt in beiden Fällen erhalten. Begriffe werden
über ihre `id` identifiziert: gleiche `id` = aktualisieren, neue `id` = ergänzen.

**Weg A — dauerhaft (empfohlen):** Den neuen Eintrag in `vocabulary.json` in das Array
`cards` einfügen und die Datei auf GitHub aktualisieren.

**Weg B — schnell im Browser:** Reiter **Hinzufügen** öffnen, JSON einfügen, *Hinzufügen*.

### Format einer Karte

```json
{
  "id": "fan",
  "term": "fan",
  "de": "Ventilator",
  "fa": "فن",
  "exampleEn": "The fan moves air across the heat exchanger.",
  "exampleDe": "Der Ventilator bewegt Luft über den Wärmeübertrager.",
  "exampleFa": "فن، هوا را روی مبدل حرارتی جابه‌جا می‌کند.",
  "category": "Komponenten"
}
```

Pflichtfelder sind `id` und `term`; die übrigen Felder sind empfehlenswert.

### Begriffe aus einem Text gewinnen

Den gewünschten Norm- oder Dokumenttext an Claude geben mit der Bitte, die
wichtigsten Fachbegriffe als Karten-JSON im obigen Format auszugeben (mit
deutscher und persischer Bedeutung sowie Beispielsätzen). Das Ergebnis dann über
Weg A oder B einspielen.

## Sicherung

Im Reiter **Hinzufügen** kannst du deinen Lernstand als JSON exportieren und später
wieder importieren — praktisch beim Wechsel des Browsers oder Geräts.

## Hinweise

- Die Sprachausgabe nutzt die im Browser/Betriebssystem installierten Stimmen.
  Englische und deutsche Stimmen sind fast überall vorhanden; eine persische Stimme
  ist seltener installiert — Persisch dient hier vor allem dem Lesen.
- Der Fortschritt liegt im `localStorage` des jeweiligen Browsers. Leerst du die
  Browserdaten dieser Seite, geht der Lernstand verloren — vorher exportieren.
