/**
 * scripts/build-portable.js
 *
 * 手动打包 Electron 为 portable exe —— 绕过 electron-builder 的 winCodeSign / 文件锁问题
 *
 * 流程:
 *   1. 检查/下载 Electron 发行版
 *   2. 解压到临时目录 (避免 Defender 锁旧 asar 导致 overwrite 失败)
 *   3. 复制 app 文件到 resources/app/
 *   4. 重命名 electron.exe → Claudio.exe
 *   5. 替换目标目录
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ── Config ──
const ELECTRON_VERSION = '33.4.11';
const PRODUCT_NAME = 'Claudio';
const OUT_BASE = path.resolve(__dirname, '..', 'release');
const CACHE_DIR = path.resolve(__dirname, '..', '.electron-cache');
const ZIP_URL = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip`;

const APP_FILES = [
  'electron-main.js',
  'electron-preload.js',
  'package.json',
  '.env',
];

const APP_DIRS = [
  'lib',
  'prompts',
  'public',
  'data',
  'Crt',
  'node_modules',
];

// ── Utils ──
function sh(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  try {
    return execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (e) {
    // robocopy returns 1-7 for success
    if (cmd.startsWith('robocopy') && e.status >= 1 && e.status <= 7) return;
    throw e;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Main ──
(async () => {
  console.log('[build] Claudio Portable Builder\n');

  const t = Date.now();
  const TMP_DIR = path.join(__dirname, '..', '.build-temp', `build-${t}`);
  const OUT_DIR = path.join(OUT_BASE, 'Claudio');

  // 1. Download Electron if not cached
  const zipName = `electron-v${ELECTRON_VERSION}-win32-x64.zip`;
  const zipPath = path.join(CACHE_DIR, zipName);

  ensureDir(CACHE_DIR);

  if (!fs.existsSync(zipPath)) {
    console.log(`[build] Downloading Electron ${ELECTRON_VERSION} ...`);
    const res = await fetch(ZIP_URL, {
      headers: { 'User-Agent': 'Claudio-Builder/1.0' },
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buffer);
    console.log(`[build] Downloaded ${(buffer.length / 1024 / 1024).toFixed(0)} MB`);
  } else {
    console.log(`[build] Using cached Electron ${ELECTRON_VERSION}`);
  }

  // 2. Extract to TEMP directory (avoids Defender-locked old .asar overwrite)
  console.log(`[build] Extracting to temp: ${TMP_DIR}`);
  ensureDir(TMP_DIR);
  sh(`unzip -o "${zipPath}" -d "${TMP_DIR}"`, { timeout: 60000 });

  // 3. Rename electron → Claudio
  const electronExe = path.join(TMP_DIR, 'electron.exe');
  const claudioExe = path.join(TMP_DIR, `${PRODUCT_NAME}.exe`);
  if (fs.existsSync(electronExe)) {
    fs.renameSync(electronExe, claudioExe);
  }

  // 4. Copy app files to resources/app/
  const appDir = path.join(TMP_DIR, 'resources', 'app');
  ensureDir(appDir);

  console.log('[build] Copying app files ...');
  for (const file of APP_FILES) {
    const src = path.resolve(__dirname, '..', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(appDir, file));
    }
  }

  for (const dir of APP_DIRS) {
    const src = path.resolve(__dirname, '..', dir);
    const dst = path.join(appDir, dir);
    if (fs.existsSync(src)) {
      sh(`robocopy "${src}" "${dst}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`, { timeout: 600000 });
    }
  }

  // 5. Move to final output
  ensureDir(OUT_BASE);

  // Determine final directory — use timestamped dir if old one is locked
  let finalDir = OUT_DIR;
  if (fs.existsSync(OUT_DIR)) {
    try {
      fs.rmSync(OUT_DIR, { recursive: true, force: true });
    } catch (e) {
      finalDir = path.join(OUT_BASE, `Claudio-${t}`);
      console.log(`[build] Old dir locked, using: ${finalDir}`);
    }
  }

  // Copy temp to final
  sh(`robocopy "${TMP_DIR}" "${finalDir}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`, { timeout: 600000 });

  // Clean up temp
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}

  // 6. Done
  const finalExe = path.join(finalDir, `${PRODUCT_NAME}.exe`);
  // Set custom icon via resedit
  const iconPath = path.resolve(__dirname, '..', 'icon.ico');
  try {
    console.log(`[build] Setting icon...`);
    sh(`npx resedit-cli --in "${finalExe}" --out "${finalExe}" --set-icon "${iconPath}"`, { timeout: 60000 });
    console.log(`[build] Icon applied`);
  } catch (e) { console.log(`[build] Icon set failed (non-critical): ${e.message}`); }

  console.log(`\n[build] Done — ${finalExe}`);
  console.log(`[build] Size: ${(fs.statSync(finalExe).size / 1024 / 1024).toFixed(0)} MB`);

  // Optional: create zip
  if (process.argv.includes('--zip')) {
    const zipOut = path.join(OUT_BASE, 'Claudio-Portable.zip');
    console.log(`[build] Creating ${zipOut} ...`);
    try {
      // Use Node.js built-in zlib for zip, or fall back to external
      sh(`powershell -Command "Compress-Archive -Path '${OUT_DIR}' -DestinationPath '${zipOut}' -Force"`, { timeout: 600000 });
      console.log(`[build] Zip: ${zipOut}`);
    } catch (err) {
      console.log(`[build] Zip failed (try manual): ${err.message}`);
    }
  }

  console.log(`\n[build] Run: ${finalExe}`);
})().catch(err => {
  console.error(`\n[build] FAILED: ${err.message}`);
  process.exit(1);
});
