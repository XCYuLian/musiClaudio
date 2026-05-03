/**
 * 浏览器控制台脚本 — 直接在网易云网页提取"我的喜欢"歌单
 *
 * 使用方法:
 *   1. 浏览器打开 music.163.com 并登录
 *   2. 点击左侧 "我喜欢的音乐"
 *   3. F12 打开开发者工具 → Console
 *   4. 复制本文件全部内容 → 粘贴到控制台 → 回车
 *   5. 等待爬取完成，自动下载 playlist.json 文件
 *
 * 适用于: 网易云音乐网页版 (music.163.com)
 */

(async function extractMyLikes() {
  console.log('🎵 Claudio — 网易云歌单提取器\n');

  // ── 等待歌曲列表加载 ──
  const rows = document.querySelectorAll('.m-table tbody tr');
  if (!rows.length) {
    // 尝试另一种页面结构 (新版本)
    const alt = document.querySelectorAll('[class*="song"]');
    console.log(`[提取] 找到 ${alt.length} 个歌曲元素 (新版本页面)`);
  }

  console.log(`[提取] 当前页面可见 ${rows.length} 首曲目`);

  // ── 翻页爬取 ──
  const allTracks = [];
  let page = 1;

  async function scrapePage() {
    const items = document.querySelectorAll('.m-table tbody tr');
    items.forEach(row => {
      const titleEl = row.querySelector('.txt b') || row.querySelector('[class*="tt"]');
      const artistEl = row.querySelector('.txt span') || row.querySelector('[class*="ar"]');
      if (titleEl && artistEl) {
        const title = titleEl.getAttribute('title') || titleEl.textContent.trim();
        const artist = artistEl.getAttribute('title') || artistEl.textContent.trim();
        if (title && artist && !allTracks.some(t => t === `${artist} ${title}`)) {
          allTracks.push(`${artist} ${title}`);
        }
      }
    });
  }

  await scrapePage();
  console.log(`[提取] 第 ${page} 页: 已收集 ${allTracks.length} 首`);

  // 尝试翻页
  const nextBtn = document.querySelector('.zbtn.znxt:not(.zdis)');
  let maxPages = 20; // safety limit

  while (nextBtn && page < maxPages) {
    nextBtn.click();
    await new Promise(r => setTimeout(r, 1500)); // wait for load
    page++;
    await scrapePage();
    console.log(`[提取] 第 ${page} 页: 已收集 ${allTracks.length} 首`);

    const next = document.querySelector('.zbtn.znxt:not(.zdis)');
    if (!next) break;
  }

  console.log(`\n[提取] ✅ 完成 — 共计 ${allTracks.length} 首曲目`);

  // ── 下载 JSON ──
  const data = { '我的喜欢': allTracks };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'playlists.json';
  a.click();
  URL.revokeObjectURL(url);

  console.log('[提取] 📥 playlists.json 已下载');
  console.log('[提取] 将文件放入 Claudio 的 user/ 目录即可');
})();
