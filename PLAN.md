# Claudio 实现计划

## 总体路线

```
Phase 1: 后端核心 ✅  Phase 2: 后端完成 ✅  Phase 3: 前端 ✅  Phase 4: 联调 ✅  Phase 5: 导入 ✅
Phase 6: Desktop UI ✅  Phase 7: Build ✅  Phase 8: UI 重设计 🔄
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
- [x] `scripts/import-netease.js` — 调 API 获取用户歌单
- [x] `scripts/extract-likes-browser.js` — 浏览器控制台脚本
- [x] `--save-state` 参数将 UID 存入 state.db

## Phase 6 — Desktop App (Electron) ✅
- [x] `electron-main.js` — 主进程 + IPC + scheduler 回调
- [x] `electron-preload.js` — 安全 IPC 桥接
- [x] `public/player.html` — 网易云风格播放器 UI
- [x] `public/player.css` — 深色主题样式
- [x] `public/player.js` — 渲染器逻辑
- [x] 窗口控制 (最小化/最大化/关闭)
- [x] 模型切换设置面板

## Phase 7 — Build & Distribution ✅
- [x] `scripts/build-portable.js` — 手动打包 (绕过 electron-builder 文件锁)
- [x] `scripts/fix-defender.bat` — 一次性 Defender 排除
- [x] DB 路径修复 (Electron → AppData)
- [x] `.env` 加载路径修复 (exe 同目录)
- [x] GitHub push

## Phase 8 — UI 重设计: Claudio.fm 风格 🔄
- [ ] `player.html` 重写 — 7 区域赛博朋克布局
- [ ] `player.css` 重写 — 霓虹发光 + 等宽字体 + 紫绿配色
- [ ] `player.js` 更新 — 数字时钟 / 队列列表 / AI 气泡

### UI 布局结构
| 区域 | 内容 |
|------|------|
| Header | Logo "Claudio" + DARK/LIGHT 切换 + 窗口控制 |
| Clock | 像素风大数字时钟 + 日期 + "ON AIR" 绿点 |
| Player | 正在播放信息 + 控制按钮 + 进度条 |
| Queue | "QUEUE N TRACKS" + 歌曲列表 (当前高亮) |
| AI Area | 头像 + 语音气泡 (英文+中文字幕) + 播放状态 |
| Input | 霓虹发光输入框 + 麦克风 + 发送按钮 |
| Footer | "CLAUDIO.FM" + "CONNECTED" 状态 |

### 设计规范
- 背景: `#0a0a0f` → `#12121a`
- 霓虹紫: `#b388ff` (glow: `0 0 10px rgba(179,136,255,0.4)`)
- 霓虹绿: `#69f0ae` (glow: `0 0 10px rgba(105,240,174,0.4)`)
- 字体: `'Courier New', 'Source Code Pro', monospace`
- 圆角: `2px` (锐利数字感)

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

electron-main.js  →  router.js  →  (same chain)
                  →  scheduler.js
                  →  state.js

scripts/import-netease.js  →  NeteaseCloudMusicApi  →  user/playlists.json
scripts/build-portable.js  →  Electron distro + app files  →  release/
```
