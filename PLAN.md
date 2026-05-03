# Claudio 实现计划

## 总体路线

```
Phase 1: 后端核心 ✅  Phase 2: 后端完成 ✅  Phase 3: 前端 ✅  Phase 4: 集成联调 ✅  Phase 5: 歌单导入 ✅
```

## Phase 1 — 后端核心 ✅
- [x] `lib/context.js` — 6 块上下文拼装
- [x] `lib/claude.js` — DeepSeek 适配器 + JSON 强校验
- [x] `user/` mock 数据 + `prompts/dj-persona.md`
- [x] `package.json` 依赖规划
- [x] `.env.example` 环境变量模板

## Phase 2 — 后端完成 ✅
- [x] `lib/state.js` — SQLite 持久化 (sql.js, 零编译依赖)
- [x] `lib/router.js` — 意图分流
- [x] `lib/tts.js` — Fish Audio 语音管线
- [x] `lib/scheduler.js` — 定时调度
- [x] `server.js` — Express + WebSocket 入口

## Phase 3 — PWA 前端 ✅
- [x] `public/index.html` — 单页应用壳 + 三视图
- [x] `public/app.js` — WebSocket + REST 通信
- [x] `public/styles.css` — 深色电台风格
- [x] `public/sw.js` — Service Worker 离线缓存
- [x] `public/manifest.json` — PWA 清单

## Phase 4 — 集成联调 ✅
- [x] DeepSeek API 全链路验证 (一次通过)
- [x] JSON 提取 + schema 校验一次过
- [x] 模型切换端点 + 设置页 UI
- [x] 纯聊天场景允许空歌单

## Phase 5 — 歌单自动导入 ✅
- [x] `scripts/import-netease.js` — 调 NeteaseCloudMusicApi 获取用户歌单
  - 读取用户所有创建/收藏的歌单
  - 提取每首歌的 `artist + track`
  - 按歌单名归类写入 `user/playlists.json`
  - 用法: `node scripts/import-netease.js --uid <网易云用户ID>`
  - `--save-state` 参数将 UID 存入 state.db

## 模块依赖关系

```
server.js
  ├── router.js  →  context.js  →  claude.js
  │                              →  state.js
  ├── tts.js
  ├── scheduler.js  →  context.js  →  claude.js
  │                  →  state.js
  │                  →  tts.js
  └── state.js

scripts/import-netease.js  →  NeteaseCloudMusicApi  →  user/playlists.json
                           →  state.db (with --save-state)
```
