/**
 * SCHEDULER.JS — Cron-based scheduling engine
 *
 * Jobs:
 *   07:00 daily  — 日常规划播报
 *   09:00 daily  — 早间音乐问候
 *   0   hourly  — 情绪/环境检查
 *   POST /hook/calendar — 飞书日历 webhook
 */

const cron = require('node-cron');
const { buildContext } = require('./context');
const { askDeepSeek } = require('./claude');
const { synthesize } = require('./tts');
const state = require('./state');

// ── In-memory refs (set by server.js or cli.js) ──
let wss = null;
let onTask = null; // callback for CLI mode

function setWSS(server) { wss = server; }
function setCallback(fn) { onTask = fn; }

// ── Broadcast / notify ──
function broadcast(data) {
  // CLI callback
  if (onTask) onTask(data);
  // WebSocket
  if (wss) {
    const payload = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(payload);
    });
  }
}

// ── Core: run a scheduled check ──

async function runTask({ trigger, userInput, executionTrace }) {
  try {
    console.log(`[scheduler] Running task: ${trigger}`);

    const currentState = state.getState();
    const { systemPrompt, userMessage } = await buildContext({
      userInput,
      state: currentState,
      executionTrace,
    });

    const result = await askDeepSeek(systemPrompt, userMessage);

    // Persist
    state.addMessage('system', `[${trigger}]`);
    state.addMessage('assistant', result.say, {
      play: result.play,
      reason: result.reason,
      segue: result.segue,
    });

    // Synthesize speech
    const ttsUrl = await synthesize(result.say).catch(err => {
      console.error('[scheduler] TTS failed:', err.message);
      return null;
    });

    // Push to clients
    broadcast({
      type: 'scheduled',
      trigger,
      ...result,
      tts: ttsUrl,
      timestamp: new Date().toISOString(),
    });

    console.log(`[scheduler] Task complete: ${trigger} → say="${result.say.slice(0, 50)}…"`);
    return result;
  } catch (err) {
    console.error(`[scheduler] Task failed (${trigger}):`, err.message);
    return null;
  }
}

// ── Scheduled jobs ──

function start() {
  // 07:00 — Daily planning
  cron.schedule('0 7 * * *', () => {
    runTask({
      trigger: 'daily-planning',
      userInput: '早上好！帮我规划今天的音乐日程。',
      executionTrace: 'scheduler-daily-planning',
    });
  });

  // 09:00 — Morning broadcast
  cron.schedule('0 9 * * *', () => {
    runTask({
      trigger: 'morning-broadcast',
      userInput: '开始上午的工作了，来点专注音乐。',
      executionTrace: 'scheduler-morning-broadcast',
    });
  });

  // ─ Hourly mood/environment check (skip 0-6 to avoid interrupting sleep) ─
  cron.schedule('0 7-23 * * *', () => {
    const hour = new Date().getHours();
    runTask({
      trigger: 'hourly-check',
      userInput: getHourlyPrompt(hour),
      executionTrace: 'scheduler-hourly-check',
    });
  });

  console.log('[scheduler] Started — 07:00 planning | 09:00 broadcast | hourly check');
}

function getHourlyPrompt(hour) {
  if (hour < 10) return '现在是早上，检查一下音乐是否需要调整。';
  if (hour < 12) return '上午工作时段，确认音乐氛围是否合适。';
  if (hour < 14) return '午餐时间，看看要不要换点轻松的。';
  if (hour < 17) return '下午时段，需要提振精神吗？';
  if (hour < 19) return '傍晚了，准备切换到放松模式。';
  return '晚间时段，放点舒缓的音乐。';
}

// ── Webhook handler (called from server.js) ──

async function handleCalendarWebhook(payload) {
  const summary = payload?.event?.summary || '有新的日程安排';
  return runTask({
    trigger: 'calendar-webhook',
    userInput: `飞书日历更新：${summary}。根据新日程调整音乐计划。`,
    executionTrace: 'webhook-calendar',
  });
}

// ── Manual trigger (for testing) ──

async function triggerNow(trigger, userInput) {
  return runTask({
    trigger: trigger || 'manual',
    userInput: userInput || '触发一次手动播报。',
    executionTrace: 'manual-trigger',
  });
}

// ── Stop ──

function stop() {
  // node-cron doesn't have a global stop; we'd need to keep task refs.
  // For now, just log — the process exiting will clean up.
  console.log('[scheduler] Stopped');
}

// ──
module.exports = { start, stop, setWSS, setCallback, triggerNow, handleCalendarWebhook };
