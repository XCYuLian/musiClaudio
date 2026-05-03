/**
 * build-exe.js — 构建 Claudio 独立 .exe
 *
 * 使用 Node SEA (Single Executable Application, Node >= 20)
 * 输出: claudio.exe
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONFIG = path.join(ROOT, 'sea-config.json');
const BLOB = path.join(ROOT, 'sea-prep.blob');
const EXE = path.join(ROOT, 'claudio.exe');

console.log('[build] Step 1/3: Creating SEA blob...');
execSync(`node --experimental-sea-config "${CONFIG}"`, { cwd: ROOT, stdio: 'inherit' });

console.log('[build] Step 2/3: Copying node.exe...');
const nodeExe = process.execPath;
fs.copyFileSync(nodeExe, EXE);
console.log(`  ${nodeExe} → ${EXE}`);

console.log('[build] Step 3/3: Injecting blob into exe...');
execSync(
  `npx -y postject "${EXE}" NODE_SEA_BLOB "${BLOB}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { cwd: ROOT, stdio: 'inherit' }
);

// Cleanup blob (not needed in the exe)
fs.unlinkSync(BLOB);

console.log(`\n[build] ✅ Done: ${EXE}`);
console.log('[build] Run it: claudio.exe');
