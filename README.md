# Green Room — Urbanity-26 Panel Practice

A mobile-first web app for rehearsing a live conference panel. An AI plays moderator
**Adam Di Marco** (CEO & Founder of The Urban Developer), asks questions aloud via
text-to-speech, listens to your typed/dictated answers, fires realistic follow-ups, and
gives candid coaching feedback. Built for **Louka Vitale** to prep "The Outperformers"
panel at Urbanity-26. Designed for iPhone first.

---

## Quick start

```bash
npm install
cp .env.example .env      # then edit .env and paste your Anthropic API key
npm start
```

Open **http://localhost:3000** in your browser.

On startup the server prints both a local URL and a **Network** URL (your machine's LAN
IP, e.g. `http://192.168.1.42:3000`) — see [Open it on your phone](#open-it-on-your-phone).

---

## Getting an Anthropic API key

1. Go to **https://console.anthropic.com/** and sign in (or create an account).
2. Open **Settings → API Keys**.
3. Click **Create Key**, copy it (starts with `sk-ant-...`).
4. Paste it into your `.env` file:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

The key stays on the server. It is never sent to the browser, never logged, and `.env`
is git-ignored. The app uses the `claude-sonnet-4-6` model.

---

## Open it on your phone

Your phone and computer must be on the **same Wi-Fi network**.

1. Run `npm start` and note the **Network** URL printed on startup
   (e.g. `http://192.168.1.42:3000`).
2. Type that URL into Safari on your iPhone.
3. Add to Home Screen for a full-screen, app-like experience (optional).

> **Speech tip:** iOS respects the phone's silent switch. If you can't hear Adam,
> flick the silent switch **off** and make sure the **Voice on** toggle (top-right) is lit.
> Speech unlocks after your first tap on the screen — this is an iOS requirement.

---

## How to use it

Pick a drill on the **Green Room** screen:

- **Full panel run** — the six official moderator prompts, roughly in order, with natural
  follow-ups and occasional interjections from other panellists.
- **Rapid fire** — random prompts at maximum pace; pushes you for concision.
- **Curveballs** — off-brief probing: interest rates, construction costs, "is the corridor
  boom a bubble", AI-hype scepticism, a simulated audience question, "one prediction".

During a session:

- Adam's questions are read aloud automatically. Tap **▶ Play** on any card to replay.
- The header timer turns **amber at 60s** and **red at 90s** so you can pace answers.
  Each sent answer records its own duration.
- **Get coach feedback** drops Adam out of character for a candid critique — what's
  landing, the three highest-impact fixes, your best line, and whether your
  property/tech balance and apartment story are holding up.
- **End session** clears the transcript. Reloading mid-session restores where you left off.

---

## Architecture

- **Backend** (`server.js`): Node + Express. Serves the static frontend and exposes one
  endpoint, `POST /api/chat`, which proxies to the Anthropic Messages API using the
  official `@anthropic-ai/sdk`. The moderator system prompt lives server-side. API errors
  (401 / 429 / 529 / network) are mapped to distinct, human-readable messages.
- **Frontend** (`public/`): single-page vanilla HTML/CSS/JS. No build step, no framework.
  Web Speech API for text-to-speech; `localStorage` for session persistence.

A backend proxy is required: browser-direct calls to the Anthropic API fail on CORS and
would expose the key.

### Files

| File                | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `server.js`         | Express server + Anthropic proxy                    |
| `package.json`      | Dependencies and `npm start` script                 |
| `.env.example`      | Template for your `.env` (API key)                  |
| `public/index.html` | App markup                                          |
| `public/style.css`  | Dark "backstage" theme                              |
| `public/app.js`     | Chat, timer, text-to-speech, persistence            |

---

## Troubleshooting

- **"API key missing or invalid, check .env"** — your `.env` has no key or a bad one.
  Confirm `ANTHROPIC_API_KEY` is set and restart the server.
- **No sound on iPhone** — silent switch off? **Voice on** lit? Tap the screen once to
  unlock audio.
- **Can't reach it from your phone** — same Wi-Fi? Some networks block device-to-device
  traffic ("client isolation"); try a personal hotspot.
- **Port 3000 in use** — set a different port: `PORT=4000 npm start`.
