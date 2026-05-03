/**
 * CLI.JS — Claudio 终端入口
 *
 * 前台: readline 聊天交互 (跟 DJ 打字聊天)
 * 后台: scheduler 定时播报 (自动触发)
 *
 * 用法: node cli.js
 */

require('dotenv').config();

const readline = require('readline');
const { exec } = require('child_process');
const state = require('./lib/state');
const { route } = require('./lib/router');
const { start: startScheduler, setCallback } = require('./lib/scheduler');

// ── Terminal UI ──
function printDJ(say, reason, segue) {
  console.log(`\n  🎧 Claudio:`);
  console.log(`  ${'-'.repeat(40)}`);
  console.log(`  ${say}`);
  if (segue) console.log(`\n  ▶ ${segue}`);
  if (reason) console.log(`  \x1b[90m(${reason})\x1b[0m`);
  console.log('');
}

function printHelp() {
  console.log(`
  ┌────────────────────────────────────────────┐
  │          Claudio — 个人 AI 电台 DJ          │
  ├────────────────────────────────────────────┤
  │  直接打字聊天 — 说说你的心情、天气、想听的  │
  │  /search <关键词>  — 搜索音乐               │
  │  /skip             — 切下一首               │
  │  /now              — 当前播放状态           │
  │  /help             — 显示此帮助             │
  │  /quit             — 退出                   │
  └────────────────────────────────────────────┘
  `);
}

// ── Audio playback (Windows) ──
function playAudio(url) {
  // url is like /tts/hash.mp3 — convert to local path
  const path = require('path');
  const filePath = path.resolve(__dirname, 'cache', 'tts', url.replace('/tts/', ''));
  if (require('fs').existsSync(filePath)) {
    exec(`start "" "${filePath}"`, (err) => {
      if (err) console.error('  [播放失败]', err.message);
    });
  }
}

// ── Main ──
(async () => {
  await state.init();
  console.clear();
  printHelp();

  // Start background scheduler (broadcasts go to CLI via callback)
  setCallback(async (result) => {
    if (result) printDJ(result.say, result.reason, result.segue);
  });
  startScheduler();

  // ── Readline chat loop ──
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n  🎤 你 > ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) { rl.prompt(); return; }
    if (input === '/quit' || input === '/exit') {
      console.log('\n  👋 Claudio 已关闭。下次见！\n');
      process.exit(0);
    }
    if (input === '/help') { printHelp(); rl.prompt(); return; }
    if (input === '/now') {
      const recent = state.getRecentPlays(1);
      console.log(`  当前: ${recent[0]?.track || '暂无播放记录'}`);
      rl.prompt();
      return;
    }

    // Route the message
    try {
      const result = await route(input);
      printDJ(result.say, result.reason, result.segue);

      if (result.tracks?.length) {
        console.log(`  🎵 已解析 ${result.tracks.length} 首可播放曲目`);
      }
    } catch (err) {
      console.error(`  ❌ 出错了: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n  Claudio 后台继续运行… Ctrl+C 完全退出\n');
  });
})();
