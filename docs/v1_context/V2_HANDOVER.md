# V1 开发者致 V2 开发者

你好，我是 V1 的最后一个提交者。在你开始写第一行 V2 代码前，这里有几句经验之谈。

## 核心默契——这些代码不要碰

### 1. `_busy` 锁（player.js 全局只有一个布尔）

```js
let _busy = false;
```
看起来简陋，却是整个电台不崩的基石。`fetchAI()` 入口拦、`refill()` 入口拦、`playAudio()` 释放。
**不要**换成状态机枚举。**不要**加 `_aiLocked`。V1 试过——翻车了。

### 2. `playAudio()` 首行必须 `_busy = false`

这不是巧合——切歌按钮、自动下一首、错误恢复**全依赖这一行**。删了它整个链就断。

### 3. setTimeout(refill, 500) 解决的是 Electron 竞态

`ended` 事件 → `autoNext()` → 队列空 → `setTimeout(refill, 500)`。
500ms 不是随便写的——太短会和 `ended` handler 的状态清理冲突，太长用户会感知到"卡住"。

### 4. `fadeVol(a, v, 0.15)` — 最低 15%

试过 2%、4%、10%，全部被用户骂"音乐消失了"。15% 是 V1 反复调参找到的甜点——能听清 DJ、不会觉得音乐断了。

### 5. `document.getElementById('ai-chat')` 不是 `$('#ai-chat')`

Electron 的 DOM 环境下 `document.querySelector` 和 jQuery 行为细微不同。V1 踩过坑——聊天框不显示。现在写死了 `getElementById`。

### 6. JSON 协议不可动

```json
{"system_log":"", "dj_speech":"", "action_type":"chat_only|change_song", "search_query":"歌手 歌名"}
```
这四个字段名改任何一个，`claude.js` 的 `isLikelyDJResponse`、`validateResponse`、`scheduler.js` 的 `speech` 变量、`router.js` 的 action 判断——全链路至少 6 处要同步改。

## 未竟之志——V1 最痛的三件事

1. **`public/player.js` 太胖了（~380 行）**。UI、状态、音频、聊天全在一个文件里。加一个功能要在 380 行里找插入点。这就是 V2 要拆 `api/`、`core/`、`ui/` 的原因。

2. **代理 @unblockneteasemusic/server 就是跑不稳**。`shell: true`、`cleanEnv`、`stdio: pipe`——四种 spawn 方式全试了，Electron 里就是闪退。V2 直接换 AlgerMusicPlayer 或聚合 API，别在同一个死人身上做心肺复苏。

3. **AI 歌曲推荐经常重复**。做了 `state.addPlay` 记录、`filterRepeats` 硬拦截、prompt 强调——还是会偶尔冒出来。根因是 DeepSeek 的上下文窗口有限，V1 只注入最近 50 首。V2 应该做**客户端侧硬过滤**——在 `handleResponse` 里再查一次黑名单。

## 避坑直觉——16 个 Bug 教会我的

- **每次"全量重写"都丢了功能**：V1 被重写了 3 次，每次丢了 `initSeek`、`initFavs`、`initLogoTap` 中的至少一个。V2 必须**逐个文件迁移**。
- **修改 JSON schema 是最高风险操作**：V1 从 `{say, play, reason}` → `{reply, monologue, play}` → `{speech, action_type}` → `{system_log, dj_speech, action_type, search_query}` 经历了 4 次协议变更。每次变更修复了 3 个旧 Bug，又引入 4 个新 Bug。
- **Electron 的 CSP 和 file:// 协议限制**：`new Audio('file:///xxx')` 在 contextIsolation 下不可用，必须用 base64 data URL 传音频。
- **打包环境=Windows CMD，不是 Git Bash**：`TEMP=/tmp` 会让 electron-builder 的 Go 二进制跨盘 rename 失败。必须在 CMD 里设 `set TEMP=C:\Users\...\AppData\Local\Temp`。
- **NSIS 只吃 .ico**：`installerIcon` 给 PNG 会报 "invalid icon file"，makensis 直接崩溃。

## 快速参考

| 文件 | V2 应拆到 |
|------|-----------|
| `lib/claude.js` | `api/deepseek.js` |
| `lib/ncm.js` | `api/netease.js` |
| `lib/tts.js` | `api/tts.js` |
| `lib/router.js` | `core/intent.js` + `core/dispatch.js` |
| `lib/scheduler.js` | `core/scheduler.js` |
| `lib/state.js` | `core/state.js` |
| `public/player.js` | `ui/chat.js` + `ui/player.js` + `ui/favs.js` |

---

祝 V2 少踩坑。— V1
