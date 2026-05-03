/**
 * SERVER.JS — Claudio entry point
 *
 * HTTP  routes: POST /api/chat, GET /api/now, GET /api/next,
 *                GET /api/taste, GET /api/plan/today
 * WS   stream:  /stream
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const { route } = require('./lib/router');
const state = require('./lib/state');
const { start: startScheduler, setWSS, handleCalendarWebhook, triggerNow } = require('./lib/scheduler');
const { synthesize } = require('./lib/tts');
const ncm = require('./lib/ncm');

const PORT = process.env.PORT || 8080;

// ── App setup ──
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Serve cached TTS files
app.use('/tts', express.static(path.resolve(__dirname, 'cache', 'tts')));

// Serve PWA frontend (Phase 3)
app.use(express.static(path.resolve(__dirname, 'public')));

// ── HTTP API ──

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing "message" field' });
    }

    const result = await route(message);

    // Trigger TTS for the "say" field if present
    let ttsUrl = null;
    if (result.say) {
      try {
        ttsUrl = await synthesize(result.say);
      } catch (err) {
        console.error('[tts] Synthesis failed:', err.message);
      }
    }

    res.json({
      type: result.type,
      say: result.say || null,
      play: result.play || [],
      tracks: result.tracks || [],
      reason: result.reason || null,
      segue: result.segue || null,
      tts: ttsUrl,
      data: result.data || null,
    });
  } catch (err) {
    console.error('[chat] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search?q=<keyword>
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing "q" param' });
    const tracks = await ncm.search(q, 20);
    res.json({ query: q, tracks });
  } catch (err) {
    res.status(503).json({ error: err.message, hint: 'Netease API not running?' });
  }
});

// GET /api/now
app.get('/api/now', (req, res) => {
  const recent = state.getRecentPlays(1);
  const plan = state.getTodayPlan();
  res.json({
    nowPlaying: recent[0] || null,
    plan: plan?.content || null,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/next
app.get('/api/next', (req, res) => {
  // Returns the upcoming track from the plan
  const plan = state.getTodayPlan();
  const upcoming = plan?.content?.tracks || [];
  res.json({
    next: upcoming[0] || null,
    queue: upcoming.slice(0, 5),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/taste
app.get('/api/taste', (req, res) => {
  const userDir = path.resolve(__dirname, 'user');
  const files = ['taste.md', 'routines.md', 'mood-rules.md', 'playlists.json'];
  const data = {};

  for (const f of files) {
    const fp = path.join(userDir, f);
    if (fs.existsSync(fp)) {
      data[f] = fs.readFileSync(fp, 'utf-8');
    }
  }

  res.json({ files: data });
});

// GET /api/plan/today
app.get('/api/plan/today', (req, res) => {
  const plan = state.getTodayPlan();
  res.json({
    date: new Date().toISOString().slice(0, 10),
    plan: plan?.content || { message: 'No plan yet. Scheduled tasks run at 07:00 and 09:00.' },
  });
});

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  const ncmAlive = await ncm.ping().catch(() => false);
  res.json({
    model: state.getPref('model') || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    availableModels: [
      { id: 'deepseek-v4-flash',  label: 'V4 Flash (快)' },
      { id: 'deepseek-v4-pro',    label: 'V4 Pro (强)' },
    ],
    services: {
      ncm: ncmAlive,
      scheduler: true,
    },
  });
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  const { model } = req.body;
  if (model) {
    const valid = ['deepseek-v4-flash', 'deepseek-v4-pro'];
    if (!valid.includes(model)) {
      return res.status(400).json({ error: `Invalid model. Choose: ${valid.join(', ')}` });
    }
    state.setPref('model', model);
  }
  res.json({ ok: true, model: state.getPref('model') });
});
app.post('/hook/calendar', async (req, res) => {
  try {
    const result = await handleCalendarWebhook(req.body);
    res.json({ ok: true, result });
  } catch (err) {
    console.error('[hook] Calendar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /trigger/:name (manual trigger for testing)
app.post('/trigger/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await triggerNow(name, req.body?.message);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HTTP + WS server ──
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/stream' });
setWSS(wss);

wss.on('connection', (ws) => {
  console.log('[ws] Client connected');
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Welcome to Claudio Stream',
    timestamp: new Date().toISOString(),
  }));

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
  });
});

// ── Start ──
(async () => {
  await state.init();
  console.log('[state] Database ready');

  server.listen(PORT, () => {
    console.log(`\n  Claudio is live at http://localhost:${PORT}`);
    console.log(`  WebSocket  ws://localhost:${PORT}/stream`);
    console.log(`  TTS cache  /tts/*.mp3\n`);

    // Start the scheduler (cron jobs)
    startScheduler();
  });
})();
