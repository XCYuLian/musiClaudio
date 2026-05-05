# V1.0 避坑守则与绝对禁区

## ⛔ 绝对禁区

### 1. 不可修改原生音频播放状态机

`audio.onended`、`audio.onerror`、`audio.onplay`、`audio.onpause` 这四个事件是**防冷场核心底座**。

- ❌ 不要重写 `autoNext()` 函数
- ❌ 不要在 `ended` 事件里加入智能判断——只做简单的队列推进
- ❌ 不要改变 `_busy` 锁的释放时机
- ✅ `ended` → `autoNext()` → 跳过无 URL → `playAudio()` → `refill()`

### 2. 不可修改 JSON 协议字段

`{system_log, dj_speech, action_type, search_query}` 是唯一格式。

- ❌ 不要加新必填字段
- ❌ 不要改字段名
- ❌ 不要改成数组或嵌套结构
- ✅ 只在 `claude.js` 的 `validateResponse` 中做兼容映射

### 3. 不可引入多个状态锁

- ❌ `_aiLocked` / `isFetchingAI` / `smState` / 状态机枚举——全部禁用
- ✅ 全局只用 `_busy` 一个布尔锁
- ✅ `playAudio()` 首行 `_busy = false`

### 4. 不可重写整个文件修一个 Bug

- ✅ 局部修改，最小改动
- ❌ "全部重写"→ 每次都引入新 Bug + 丢失已有功能
- ❌ V1.0 经历 3 次全重写，每次丢进度条/爱心/彩蛋

## 🐛 V1.0 历史 Bug 速查

| # | 现象 | 根因 | 修复 |
|---|------|------|------|
| 1 | AI 反复推同一艺人 | state.addPlay 没被调用 | 每次推荐后写入 DB |
| 2 | 切歌按钮失效 | _busy 锁没释放 | playAudio 里 `_busy=false` |
| 3 | 进度条拖不动 | 重写漏了 initSeek | 必须包含 initSeek |
| 4 | 聊天框不显示 | `$('#ai-chat')` 返回 null | `document.getElementById` |
| 5 | DJ 说话音乐消失 | fadeVol 最低 2% | 改最低 15% |
| 6 | 设置面板截断 | 没 max-height | `max-height:90vh;overflow-y:auto` |
| 7 | 代理崩溃 | `-a` `-o` 参数 | 只用 `-p -e` |
| 8 | 端口占用 | 旧进程没关 | 启前强杀 |
| 9 | API 连不上 | 模型名错 | 用 `deepseek-chat` |
| 10 | Cannot read 'length' | `result.play.length` | 新格式无 play |
| 11 | 播放卡死 | 无 URL 不触发 refill | `setTimeout(refill,500)` |
| 12 | DeepSeek 返回空 | `deepseek-v4-flash` 不存在 | 用 `deepseek-chat` |
| 13 | Bonobo 反复出现 | filter 只看 20 条 | 扩大到 50 + 永久黑名单 |
| 14 | 闲聊也切歌 | DJ 人格覆盖 intent | 重写 persona TWO MODES |
| 15 | JSON 解析失败 | isLikelyDJResponse 不认识 dj_speech | 加 `dj_speech` 检查 |
| 16 | AI 输出空 | 用 `result.speech` 实为 `result.dj_speech` | 全替换 |

## 🔌 代理问题（V1 已知限制）

@unblockneteasemusic/server 在 Electron spawn 环境下极不稳定：
- 启动后数秒内闪退（exit code null = SIGTERM 信号）
- Socket hang up / ECONNREFUSED
- standalone 命令行也偶发不可用

**V1 对策：** 直连模式——依赖 NeteaseCloudMusicApi 模块 API，放弃部分 VIP 歌曲换取稳定性。代理代码保留在 `lib/proxy.js` 但设 `online = false`，由 ncm.js 自动降级。

**V2 方向：** 寻找更稳定的全网音源方案（如 AlgerMusicPlayer）。

## 🏗️ 打包环境注意

- Git Bash 的 `TEMP=/tmp`（Linux 路径）会导致 electron-builder 跨盘 rename 失败
- 必须在 Windows CMD 中构建：
  ```cmd
  D:
  cd D:\OUTPUT
  set TEMP=C:\Users\xc_yulian\AppData\Local\Temp
  set TMP=C:\Users\xc_yulian\AppData\Local\Temp
  npm run build
  ```
- NSIS 需要 .ico 格式图标，PNG 会导致 makensis 报错
