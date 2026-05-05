# Claudio V1.0 — 核心架构总结

## 进程模型

- **主进程** (`electron-main.js`): BrowserWindow 创建、IPC 桥接、scheduler 调度、auto-start
- **预加载** (`electron-preload.js`): contextBridge 暴露 `window.claudio` API
- **渲染进程** (`public/player.js`): 全部 UI 逻辑、播放器控制、AI 响应处理

## 文件职责速查

| 文件 | 职责 |
|------|------|
| `electron-main.js` | 窗口创建、IPC 路由、auto-start 3s 延迟 |
| `lib/claude.js` | DeepSeek API 调用 + JSON schema 校验 |
| `lib/context.js` | System Prompt 组装（时间/DNA/歌单/意图指引） |
| `lib/router.js` | 用户消息路由 chat/music/direct + TTS 合成 |
| `lib/scheduler.js` | cron 定时 + auto-start 任务 |
| `lib/ncm.js` | 网易云搜索 + 歌手强校验 + VIP 过滤 |
| `lib/tts.js` | Volcengine ICL TTS → base64 data URL |
| `lib/proxy.js` | UnblockNeteaseMusic 代理（V1 不稳定，仅保留） |
| `lib/state.js` | SQLite 持久化（播放记录/偏好） |
| `lib/paths.js` | 统一路径管理 |
| `public/player.js` | 前端全部（~380 行） |

## JSON 协议（唯一格式）

```json
{
  "system_log": "内部状态/日志 — 前端浅色小字居中显示，绝不给 TTS",
  "dj_speech": "DJ 对用户说的话 — 正常渲染 + 唯一给 TTS 的字段",
  "action_type": "chat_only | change_song",
  "search_query": "歌手名 歌名 — play_specific/change_song 必填，chat_only 为 null"
}
```

### 流转逻辑

**chat_only（用户聊天/提问）：**
1. 前端 `handleResponse` → 渲染 `system_log`（浅色） + `dj_speech`（正常）
2. TTS 只播 `dj_speech`
3. **绝不碰音乐播放器** — 当前歌曲继续播
4. 释放 `_busy` 锁

**change_song（切歌/推荐）：**
1. 后端解析 `search_query` → `ncm.resolvePlaylist()` → 返回 tracks
2. 前端 `handleResponse` → 渲染 + TTS → `fadeVol` 渐弱 → DJ 说话 → `playAudio(nextTrack)`
3. 释放 `_busy` 锁

## 状态锁（`_busy`）

全局唯一锁 `_busy`：
- `fetchAI()` 入口 `if (_busy) return; _busy = true;`
- `refill()` 入口 `if (_busy) return;`
- `playAudio()` 首行 `_busy = false;`
- TTS 结束/超时/出错 → `_busy = false;`

## TTS 发声逻辑

```
scheduler/router 生成 speech
  → tts.js synthesize(speech) 
  → base64 MP3: "data:audio/mp3;base64,..."
  → 前端 handleResponse 收到 data.tts
  → new Audio(data.tts).play()
  → fadeVol(audio, v, 0.15) 渐弱音乐
  → TTS 结束 → fadeVol 恢复 → playAudio(track.url)
```

**红线：** TTS 只读 `dj_speech`，绝不读 `system_log`。

## 开发者彩蛋

**指令彩蛋**（`checkEasterEgg`）：
- 聊天框输入 `/sudo creator`、`你是谁做的` →
- 音乐渐弱 + 屏幕闪烁 + 播报 "你触发了隐藏频段。本电台由台长 Galton欣城 于 2026 年构建..."

**Logo 7 连点**（`initLogoTap`）：
- 2.5s 内连点 Claudio Logo 7 次 →
- 显示 "Created by Galton欣城" + 播放台歌 `Crt/TEMPOREX - Daydream.mp3`

## 核心功能清单

- `initSeek()` — 进度条拖拽
- `initFavs()` — 爱心收藏 + 侧边栏 Drawer
- `initLogoTap()` — 7 连点彩蛋
- `checkEasterEgg()` — 聊天指令彩蛋
- `fadeVol()` — DJ 说话时音乐渐弱（最低 15%）
- `initSeek()` — 进度条拖拽
- 右侧 `#btn-favs` → 毛玻璃侧边栏
