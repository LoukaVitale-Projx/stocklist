// Green Room — Urbanity-26 panel practice app backend.
// Serves the static frontend and proxies chat requests to the Anthropic Messages API.
// The API key stays server-side; it is never sent to the browser or logged.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

// The moderator system prompt is held constant on the backend (never trusted from the client).
const SYSTEM_PROMPT = `You are simulating a live conference panel so Louka Vitale can rehearse.

EVENT: Urbanity-26 (The Urban Developer's flagship conference), The Star, Gold Coast.
SESSION: "The Outperformers: Inside Real Estate's Growth Sectors" — 30-minute panel, Friday 11:30am.
MODERATOR YOU PLAY: Adam Di Marco, CEO & Founder of The Urban Developer. Sharp, energetic, warm, experienced. Keeps things moving, asks tight questions, occasionally pushes back for specifics.
PANELLISTS:
- Rebekah Murphy, Co-CEO, Hub Australia (flexible workspace)
- Hans Pearson, CEO, StoreLocal (self-storage)
- Daniel West, Director - Development & Investment, Jeckra
- Louka Vitale, Managing Director, ProjX (residential project marketing — SEQ & Northern NSW masterplanned communities, house-and-land, expanding into medium-density/townhouses). THE PERSON REHEARSING.

THE SIX OFFICIAL MODERATOR PROMPTS:
1. What structural trends have driven your sector's growth?
2. Why has your asset class outperformed more traditional property sectors?
3. What common characteristics do successful growth sectors share?
4. Where are you seeing the strongest opportunities over the next decade?
5. Which emerging sectors deserve greater attention from investors and developers?
6. What lessons can the broader property industry learn from your experience?

LOUKA'S STRATEGY (coach against this when asked for feedback):
- Roughly 70% property substance / 30% technology differentiator.
- Property story: SEQ interstate migration, housing undersupply, affordability shift to growth corridors (Ripley, Lockyer Valley, Fernvale, Flagstone, Northern NSW), Olympics 2032 infrastructure.
- Apartments: never dismiss them. Use the bifurcation framing — the middle of the market got squeezed by construction costs, but (a) luxury/irreplaceable positions and (b) attainable investment-grade medium-density both perform. ProjX itself is expanding into townhouses/units.
- Tech twist (his one memorable line): ProjX prices entire masterplanned communities in hours, not weeks, using live market data, and AI qualifies leads before a human touches them. Frame as a sector trend, never a company pitch.
- Organiser tone brief: energetic, forward-looking, structural shifts not self-promotion.

HOW TO BEHAVE:
- Speak ONLY as Adam. Occasionally voice a 1-2 sentence interjection from another panellist, labelled like — Rebekah: "..." — then hand back to Louka.
- ONE question or follow-up per turn. Keep turns to 2-4 sentences. Real moderators don't monologue.
- Vary the wording of the official prompts; never read them verbatim twice.
- React to what Louka actually said: pick up a phrase, ask for a number, challenge gently ("some would say that's a cycle, not structural — convince me").
- If he rambles past ~90 seconds of speech or pitches ProjX too hard, cut in politely like a real moderator.
- Australian property-industry register. First names. Light humour occasionally.
- Never break character or mention being an AI — UNLESS the user message begins with [COACH], in which case step fully out of character and respond as a candid speaking coach.`;

const app = express();
app.use(express.json({ limit: '1mb' }));

const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

// Map an Anthropic / network error to a distinct, human-readable string + status.
function describeError(err) {
  // SDK errors expose a numeric `status`.
  const status = err && typeof err.status === 'number' ? err.status : null;

  if (status === 401) {
    return { status: 401, error: 'API key missing or invalid, check .env' };
  }
  if (status === 429) {
    return { status: 429, error: 'Rate limited by Anthropic — wait a moment and try again (429)' };
  }
  if (status === 529 || (err && /overloaded/i.test(err.message || ''))) {
    return { status: 529, error: 'Anthropic is overloaded right now — try again shortly (529)' };
  }
  if (status === 400) {
    return { status: 400, error: `Request rejected by Anthropic (400): ${err.message || 'bad request'}` };
  }
  if (status && status >= 500) {
    return { status, error: `Anthropic server error (${status}) — try again shortly` };
  }
  // Network-level failure (no HTTP status).
  return {
    status: 502,
    error: `Network error reaching Anthropic (${err && err.message ? err.message : 'connection failed'})`,
  };
}

app.post('/api/chat', async (req, res) => {
  if (!apiKey || !anthropic) {
    return res.status(401).json({ error: 'API key missing or invalid, check .env', status: 401 });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages provided (400)', status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });

    // Concatenate every text block from the response.
    const text = (response.content || [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      return res.status(502).json({ error: 'Empty reply from Anthropic (502)', status: 502 });
    }

    return res.json({ text });
  } catch (err) {
    const mapped = describeError(err);
    // Log the class of failure but NEVER the key or full request payload.
    console.error(`[api/chat] ${mapped.status}: ${mapped.error}`);
    return res.status(mapped.status).json(mapped);
  }
});

// Static frontend.
app.use(express.static(path.join(__dirname, 'public')));

// Find the first non-internal IPv4 address so the user can open the app from a phone.
function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = lanIp();
  console.log('\n  🎙  Green Room — Urbanity-26 panel practice');
  console.log('  ─────────────────────────────────────────');
  console.log(`  Local:    http://localhost:${PORT}`);
  if (ip) {
    console.log(`  Network:  http://${ip}:${PORT}   ← open this on your iPhone (same Wi-Fi)`);
  } else {
    console.log('  Network:  (no LAN IP detected — connect to Wi-Fi to open from a phone)');
  }
  if (!apiKey) {
    console.log('\n  ⚠  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
  console.log('');
});
