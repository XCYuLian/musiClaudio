# Claudio 项目规则与避坑指南 (V2)

## 技术栈
- **Runtime**: Node.js ≥ 18, Electron + CommonJS
- **数据库**: sql.js (SQLite WASM, `data/state.db`)
- **AI**: DeepSeek API (`deepseek-chat` 模型，别用 deepseek-v4-flash)
- **TTS**: Volcengine ICL (声音复刻, `S_xSgIXKL12`)
- **音乐**: NeteaseCloudMusicApi npm 模块直连
- **代理**: @unblockneteasemusic/server (端口 8081, VIP 解锁, 只传 `-p PORT -e URL` 两个参数)

## ⚠️ 致命禁忌

### JSON 格式——唯一正确格式
```json
{"system_log":"状态", "dj_speech":"DJ说话", "action_type":"chat_only|change_song", "search_query":"歌手 歌名"}
```
- ❌ 不要用 `speech`，新格式是 `dj_speech`
- ❌ 不要用 `reply`/`monologue`/`say`/`play[]`/`reason`/`segue`
- ❌ 后端用 `result.dj_speech`，不是 `result.speech`
- ❌ `isLikelyDJResponse` 必须检查 `dj_speech` 字段

### 状态锁
- ✅ 全局只用 `_busy` 一个布尔锁
- ❌ 不要引入 `_aiLocked` / `isFetchingAI` / 状态机枚举

### 前端不要引用
- ❌ `data.play` / `data.reply` / `data.monologue`
- ✅ `data.dj_speech` / `data.system_log` / `data.action_type` / `data.search_query` / `data.tracks`
- ✅ `document.getElementById('ai-chat')` 不用 `$('#ai-chat')`

### 播放后必须释放锁
`playAudio()` 第一行 `_busy = false`

### 代理启动参数
只用 `-p PORT -e https://music.163.com`，不要加 `-a` 或 `-o`

### fadeVol 最低值
`Math.max(0.15, cur)` — 至少 15%，DJ 说话时音乐做背景

## 历史 Bug 库

| # | 现象 | 根因 | 修复 |
|---|------|------|------|
| 1 | AI 反复推同一艺人 | state.addPlay 没被调用 | 每次推荐后写入 state.db |
| 2 | 切歌按钮不生效 | `_busy` 锁没释放 | `playAudio()` 里 `_busy = false` |
| 3 | 进度条不能拖 | 重写时漏了 initSeek | 必须有 `initSeek()` |
| 4 | AI 输出不显示 | showChat 没调或容器 ID 错 | 每个分支调 showChat |
| 5 | TTS 时音乐消失 | fadeVol 最低 2% | 改最低 15% |
| 6 | 设置面板截断 | 没 max-height | 加 `max-height: 90vh; overflow-y: auto` |
| 7 | 代理崩溃 | `-a` `-o` 参数 | 只用 `-p PORT -e URL` |
| 8 | 端口占用 | 旧进程没关 | 关所有窗口再启 |
| 9 | API 连不上 | key 过期/模型名错 | 用 `deepseek-chat` |
| 10 | 打包超时 | cp node_modules 慢 | robocopy, 超时 600s, D 盘 |
| 11 | Cannot read 'length' | `result.play.length` | 新格式没有 play |
| 12 | 播放卡死 | 无 URL 时不触发 refill | `setTimeout(refill, 500)` |
| 13 | DeepSeek 返回空 | `deepseek-v4-flash` 不存在 | 用 `deepseek-chat` |
| 14 | 聊天框不显示 | `$('#ai-chat')` 返回 null | `document.getElementById` |
| 15 | 用户消息不显示 | showChat 只处理 assistant | renderChat 区分 m.role |
| 16 | 切歌 refill 不响应 | `_aiLocked` 不存在 | 统一用 `_busy` |
| 17 | Bonobo 反复出现 | filter 只看最近 20 条 | 扩大到 50 条 + 永久黑名单 |
| 18 | 国语歌全被跳 | 热门歌手全是翻唱 | 拒了就换下一首 |
| 19 | 聊天框不显示(v2) | `$` 选择器失败 | `document.getElementById` |
| 20 | 代理 EADDRINUSE | 旧进程不释放端口 | 关窗口再启 |
| 21 | 大量无音源 | 歌手匹配太激进 | 放宽：用最高分候选 |
| 22 | JSON 解析失败(v2) | `isLikelyDJResponse` 不认识 `dj_speech` | 加 `dj_speech` 检查 |
| 23 | AI 输出空 | 后端用 `result.speech` 实际是 `result.dj_speech` | 全替换 |

## 快速测试
```bash
# API 连通性
node -e "fetch('https://api.deepseek.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer sk-08fbfccc9bbd47d5822a345706e1b418'},body:JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:'hi'}],max_tokens:10})}).then(r=>r.json()).then(console.log)"

# TTS
node -e "const{synthesize}=require('./lib/tts');(async()=>{console.log(await synthesize('测试')?'OK':'FAIL')})()"

# 启动
npm start

# 打包
npm run build
```
