/**
 * PROXY.JS — UnblockNeteaseMusic proxy manager
 *
 * Starts the proxy as a child process, monitors health, handles restart.
 * Provides environment-level proxy config for ncm.js.
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PROXY_HOST = '127.0.0.1';
let PROXY_PORT = parseInt(process.env.UNBLOCK_PORT) || 0; // 0 = auto
let PROXY_URL = '';

let child = null;
let online = false;
let onStatus = null;

// ── Try ports until one works ──
async function findPort(startPort) {
  const net = require('net');
  for (let port = startPort || 8081; port < 8100; port++) {
    const free = await new Promise(resolve => {
      const s = net.createServer();
      s.unref();
      s.on('error', () => resolve(false));
      s.listen(port, PROXY_HOST, () => { s.close(); resolve(true); });
    });
    if (free) return port;
  }
  return 0;
}

// ── Start ──

async function start() {
  if (child && !child.killed) {
    console.log('[proxy] Already running (PID ' + child.pid + ')');
    return;
  }

  PROXY_PORT = await findPort(PROXY_PORT || 8081);
  if (!PROXY_PORT) {
    console.error('[proxy] No available port');
    if (onStatus) onStatus({ online: false, error: 'No port available' });
    return;
  }
  PROXY_URL = `http://${PROXY_HOST}:${PROXY_PORT}`;

  const appPath = path.join(__dirname, '..', 'node_modules', '@unblockneteasemusic', 'server', 'precompiled', 'app.js');
  const args = [
    appPath,
    '-p', String(PROXY_PORT),
    '-a', PROXY_HOST,
    '-e', 'https://music.163.com',
    '-o', 'kugou qq migu kuwo',
  ];

  console.log('[proxy] Starting:', 'node', args.slice(1).join(' '));

  // Clean env: strip Electron-specific vars that may confuse child
  const cleanEnv = {};
  for (const k of Object.keys(process.env)) {
    if (!k.startsWith('ELECTRON_') && k !== 'NODE_OPTIONS') cleanEnv[k] = process.env[k];
  }

  child = spawn('node', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv,
    cwd: path.join(__dirname, '..'),
  });

  child.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log('[proxy:out]', msg);
    if (!online && (msg.includes('running') || msg.includes('listening') || msg.includes('server'))) {
      online = true;
      if (onStatus) onStatus({ online: true, port: PROXY_PORT });
    }
  });

  child.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log('[proxy:err]', msg);
  });

  child.on('exit', (code) => {
    console.log('[proxy] Exited with code', code, '(VIP unlocking unavailable)');
    online = false;
    if (onStatus) onStatus({ online: false });
    child = null;
    // Don't restart — proxy is optional. ncm.js falls back to module API.
  });

  child.on('error', (err) => {
    console.error('[proxy] Failed to start:', err.message);
    online = false;
    child = null;
    if (onStatus) onStatus({ online: false, error: err.message });
  });
}

// ── Stop ──

function stop() {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
    online = false;
  }
}

// ── Health check ──

async function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${PROXY_URL}/`, { timeout: 3000 }, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── Status ──

function isOnline() { return online; }
function getProxyUrl() { return PROXY_URL; }
function getPort() { return PROXY_PORT; }
function setStatusCallback(fn) { onStatus = fn; }

module.exports = { start, stop, ping, isOnline, getProxyUrl, getPort, setStatusCallback };
