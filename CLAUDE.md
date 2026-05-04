# Claudio v1.0 — 开发者规则与避坑指南

## 技术栈
- **Runtime**: Node.js ≥ 18, Electron + CommonJS
- **数据库**: sql.js (SQLite WASM, `data/state.db`)
- **AI**: DeepSeek API (`deepseek-chat`, **禁用 deepseek-v4-flash**)
- **TTS**: Volcengine ICL 声音复刻 (`S_xSgIXKL12`, 火山引擎 SSE)
- **音乐**: NeteaseCloudMusicApi npm 模块直连
- **代理**: @unblockneteasemusic/server (端口 8081, 参数 `-p PORT -e URL`, **禁止加 -a -o**)

## 文件架构

| 文件 | 行数 | 职责 |
|------|------|------|
| `lib/claude.js` | ~250 | DeepSeek API + JSON 强校验 |
| `lib/context.js` | ~180 | System Prompt 组装 |
| `lib/router.js` | ~110 | 意图分流 + TTS + 音源解析 |
| `lib/scheduler.js` | ~80 | cron 定时 + auto-start |
| `lib/ncm.js` | ~280 | 网易云搜索 + 歌手校验 + VIP 过滤 |
| `lib/tts.js` | ~90 | 火山 ICL TTS → base64 |
| `lib/proxy.js` | ~100 | VIP 代理解锁 |
| `public/player.js` | ~380 | 前端全部逻辑 |

## ⚠️ 铁律——每次改代码前必读

### JSON 格式
```json
{"system_log":"状态日志", "dj_speech":"DJ说话", "action_type":"chat_only|change_song", "search_query":"歌手 歌名"}
```
- 这是唯一格式。`claude.js` 的 `isLikelyDJResponse` 和 `validateResponse` 都以此为准
- 后端用 `result.dj_speech`，**不是** `result.speech`
- 旧字段 `say/play/reply/monologue/reason/segue` 已被禁用，仅保留向后兼容 fallback

### 前端路由
- `data.dj_speech` / `data.system_log` / `data.action_type` / `data.tracks`
- `chat_only` → 只说话，**不动音乐**
- `change_song` → 搜歌 + 切歌
- `document.getElementById('ai-chat')` 替代 `$('#ai-chat')`

### 状态锁
- 全局只用 `_busy` 一个布尔锁
- `playAudio()` 首行 `_busy = false`

### 必须保留的功能（重写时不可删）
1. `initSeek()` — 进度条拖拽
2. `initFavs()` — 爱心收藏 + 侧边栏
3. `initLogoTap()` — 7 连点彩蛋
4. `checkEasterEgg()` — 聊天指令彩蛋
5. `fadeVol()` — DJ 说话时音乐渐弱

### 代理参数
```javascript
['-p', String(PROXY_PORT), '-e', 'https://music.163.com']
```
禁止加 `-a` 或 `-o`

## Bug 全记录

| # | 现象 | 根因 | 修复 |
|---|------|------|------|
| 1 | AI 反复推同一艺人 | state.addPlay 没被调用 | 每次推荐后写入 |
| 2 | 切歌按钮失效 | _busy 锁没释放 | playAudio 里 `_busy=false` |
| 3 | 进度条拖不动 | 重写漏了 initSeek | 必须包含 initSeek |
| 4 | 聊天框不显示 | `$('#ai-chat')` 返回 null | `document.getElementById` |
| 5 | DJ 说话音乐消失 | fadeVol 最低 2% | 改最低 15% |
| 6 | 设置面板截断 | 没 max-height | `max-height:90vh;overflow-y:auto` |
| 7 | 代理崩溃 | `-a` `-o` 参数 | 只传 `-p -e` |
| 8 | 端口占用 | 旧进程没关 | 启动前强杀 |
| 9 | API 连不上 | 模型名错误 | 用 `deepseek-chat` |
| 10 | Cannot read 'length' | `result.play.length` | 新格式无 play |
| 11 | 播放卡死 | 无 URL 不触发 refill | `setTimeout(refill,500)` |
| 12 | DeepSeek 返回空 | `deepseek-v4-flash` 不存在 | 用 `deepseek-chat` |
| 13 | Bonobo 反复出现 | filter 只看 20 条 | 扩大到 50 + 永久黑名单 |
| 14 | 国语歌全被跳 | 热门歌手全是翻唱 | 拒了就换下一首 |
| 15 | JSON 解析失败 | isLikelyDJResponse 不认识 dj_speech | 加 dj_speech 检查 |
| 16 | AI 输出空 | 后端用 result.speech 实际是 dj_speech | 全替换 |
| 17 | 闲聊也切歌 | DJ 人格覆盖了 intent | 重写 persona 为 TWO MODES |
| 18 | 台歌不播放 | 路径从 public/ 出发错误 | 用 `../Crt/` |
| 19 | 代理 EADDRINUSE | 旧进程死赖端口 | 启动前 taskkill |

## 快速测试
```bash
# API
node -e "fetch('https://api.deepseek.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer sk-08fbfccc9bbd47d5822a345706e1b418'},body:JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:'hi'}],max_tokens:10})}).then(r=>r.json()).then(console.log)"

# TTS
node -e "const{synthesize}=require('./lib/tts');(async()=>{console.log(await synthesize('测试')?'OK':'FAIL')})()"

# 启动
npm start

# 打包
npm run build
```
