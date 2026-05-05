# Plan 3: Cookie 注入验证 + 歌词面板替换 QUEUE

**日期**: 2026-05-05  
**状态**: 进行中

## 任务一：Cookie 全链路注入验证

### 问题
扫码登录后 Cookie 已存 SQLite，但 API 请求仍报 `is VIP (fee=1)`，VIP 身份未生效。

### 方案
- 在 `netease.js` 的 `getCookie()` 中加 `console.log` 打印 cookie 前 30 字符
- 验证 `callModule()` 和 `webGet()` 确实传入了 cookie
- 如果 cookie 存在但 VIP 仍被拦 → NeteaseCloudMusicApi 的 `song_url` 可能仍返回 fee=1（服务端判断）
- 兜底：`getSongUrl` 模块 API 返回 VIP 时，增加 web fallback 优先级

### 涉及文件
- `src/api/netease.js` — `getCookie()` 加 log

---

## 任务二：废弃 QUEUE → 动态歌词面板

### 目标
移除右侧 QUEUE 列表，替换为实时歌词滚动面板，保留 AI 电台 "盲盒" 体验。

### 改造计划

#### 1. HTML (`public/player.html`)
- `#queue-area` → `#lyric-area`
- 内部结构：`<div id="lyric-panel"><div id="lyric-lines"></div></div>`
- 保留 `#history-list`（最近播放记录）

#### 2. CSS (`public/player.css`)
- 删除 `.queue-*` 全部样式
- 新增歌词样式：
  - `#lyric-panel` — 固定高度、overflow hidden、渐变遮罩
  - `.lyric-line` — 默认暗色、当前行高亮绿色 + glow
  - `.lyric-line.active` — `color: #69f0ae; text-shadow; font-size 稍大`
  - 平滑 transition

#### 3. 新建 `src/core/lyric.js`
```js
parse(lrcText) → [{time: seconds, text: string}]
currentIndex(lyricLines, currentTime) → number
```
- 解析标准 LRC 格式 `[mm:ss.xx]歌词`
- 偏移量、多时间标签处理
- `currentIndex` 返回当前播放位置对应的歌词行索引

#### 4. `src/api/netease.js`
- `getLyric(trackId)` 已存在 ✅ 无需改动

#### 5. `src/ui/player.js`
- **删除**：`renderQueue()`、`queue` 变量及相关逻辑
- **新增**：
  - `loadLyric(songId)` → 获取 LRC → `lyric.parse()` → 渲染
  - `updateLyricHighlight(currentTime)` → 在 `timeupdate` 中调用
  - `renderLyricLines(lines)` → 构建 DOM
- `updatePlayerInfo()` 触发 `loadLyric()`
- `timeupdate` 中调用 `updateLyricHighlight()`

#### 6. `src/ui/chat.js`
- `handleResponse` 中删除 `queue = ...` / `renderQueue()` / `currentIdx` 操作
- 改为只设 `currentTrack` 单曲播放

#### 7. `src/ui/favs.js`
- `DOMContentLoaded` 中 `renderQueue()` → 初始化歌词区域

### 验证
- [ ] 切歌 → 歌词面板更新为新歌歌词
- [ ] 播放进度 → 当前歌词行高亮滚动
- [ ] 无歌词时 → 显示 "纯音乐，请欣赏"
- [ ] Cookie 注入生效 → VIP 歌曲可播放
