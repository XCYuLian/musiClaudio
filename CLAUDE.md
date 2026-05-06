# Claudio — 开发者规则与避坑指南 (V2 Ready)


Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 技术栈
- **Runtime**: Node.js ≥ 18, Electron + CommonJS
- **数据库**: sql.js (SQLite WASM, `data/state.db`)
- **AI**: DeepSeek API (`deepseek-v4-flash`，备选 `deepseek-v4-pro`)
- **TTS**: Volcengine ICL (`S_xSgIXKL12`)
- **音乐**: NeteaseCloudMusicApi npm 模块直连
- **代理**: 已废弃（@unblockneteasemusic/server 不稳定，V1 已降级）

## 📂 项目结构规范 (V2)

### 强制目录
```
├── electron-main.js
├── electron-preload.js
├── lib/
│   ├── api/               # 外部 API 封装（V2 新增）
│   │   ├── deepseek.js    # DeepSeek API
│   │   ├── netease.js     # 网易云搜索 + URL
│   │   └── tts.js         # TTS 合成
│   ├── core/              # 核心业务逻辑（V2 新增）
│   │   ├── intent.js      # 意图分类
│   │   ├── scheduler.js   # 定时任务
│   │   └── state.js       # SQLite 持久化
│   ├── context.js         # System Prompt 组装
│   ├── router.js          # 消息路由（V2 迁移至 core/）
│   └── paths.js           # 统一路径
├── public/
│   ├── player.html
│   ├── player.css
│   └── player.js          # → V2 拆为 ui/chat.js ui/player.js ui/favs.js
├── prompts/
│   └── dj-persona.md
├── data/                  # 运行时数据
├── docs/v1_context/       # V1.0 知识归档
├── scripts/               # 构建脚本
└── Crt/                   # 图标 + 台歌
```

## ⚠️ 铁律——每次改代码前必读

### JSON 协议（不可动）
```json
{"system_log":"状态", "dj_speech":"DJ说话", "action_type":"chat_only|change_song", "search_query":"歌手 歌名"}
```

### 状态锁
- ✅ 全局只用 `_busy` 一个布尔锁
- ✅ `playAudio()` 首行 `_busy = false`
- ❌ 不引入 `_aiLocked` / 状态机枚举

### 必须保留的功能（任何重构不可删）
1. `initSeek()` — 进度条拖拽
2. `initFavs()` — 爱心收藏 + 侧边栏
3. `initLogoTap()` — 7 连点彩蛋
4. `checkEasterEgg()` — 聊天指令彩蛋
5. `fadeVol()` — DJ 说话时音乐渐弱（最低 15%）

## 📋 阶段规划规则

- 每次阶段性开发操作，在 `plans/` 文件夹创建计划文件
- 命名递增：`plans/plan1.md` → `plans/plan2.md` → ...
- 内容：本轮目标、涉及文件、预计步骤、验证方式
- 完成后在文件中标注完成状态

## 🔁 重构规则 (V2 新增)

### 逐个迁移，验证后再迁下一个
- ❌ 禁止"全量重写"——V1 被重写了 3 次，每次丢功能
- ✅ 迁一个模块 → 跑完整功能测试 → 确认 V1 核心功能（彩蛋/协议/锁）正常 → 再迁下一个

### 验证清单（每轮重构后必跑）
- [ ] AI 自启 DJ 播报是否正常
- [ ] 聊天 "今晚月亮好亮" → `chat_only` 不切歌
- [ ] 说 "放一首周杰伦晴天" → `change_song` 切歌
- [ ] 进度条可拖拽、爱心可点击、Logo 7 连点触发台歌
- [ ] `_busy` 锁不出现双重播报
- [ ] `fadeVol` 背景音乐渐弱正常

## 🏗️ 快速命令

```bash
npm start              # 开发模式
npm run build          # NSIS Setup（必须在 Windows CMD 中运行）
npm run build:portable # 便携版
```

### 构建环境（重要）
```
必须在 Windows CMD 中：
  D:
  cd D:\OUTPUT\Claudio
  set TEMP=C:\Users\xc_yulian\AppData\Local\Temp
  npm run build
```
Git Bash 的 `TEMP=/tmp` 会导致 electron-builder 跨盘失败。

## 🐛 历史 Bug 速查（16 条）

| # | 现象 | 根因 | 修复 |
|---|------|------|------|
| 1 | AI 反复推同一艺人 | state.addPlay 未调用 | 每次推荐后写入 |
| 2 | 切歌按钮失效 | _busy 未释放 | playAudio 里 `_busy=false` |
| 3 | 进度条拖不动 | 重写漏了 initSeek | 必须包含 initSeek |
| 4 | 聊天框不显示 | `$('#ai-chat')` 返回 null | `document.getElementById` |
| 5 | DJ 说话音乐消失 | fadeVol 最低 2% | 改最低 15% |
| 6 | 设置面板截断 | 没 max-height | `max-height:90vh;overflow-y:auto` |
| 7 | 代理崩溃 | `-a` `-o` 参数 | 只用 `-p -e`，之后整体降级 |
| 8 | API 连不上 | 模型名错 | 用 `deepseek-chat` |
| 9 | Cannot read 'length' | `result.play.length` | 新格式无 play |
| 10 | 播放卡死 | 无 URL 不触发 refill | `setTimeout(refill,500)` |
| 11 | DeepSeek 返回空 | `deepseek-v4-flash` 不存在 | 用 `deepseek-chat` |
| 12 | Bonobo 反复出现 | filter 只看 20 条 | 扩大到 50 + 永久黑名单 |
| 13 | 闲聊也切歌 | DJ 人格覆盖 intent | 重写 persona TWO MODES |
| 14 | JSON 解析失败 | isLikelyDJResponse 不认识 dj_speech | 加 `dj_speech` 检查 |
| 15 | AI 输出空 | `result.speech` 实为 `result.dj_speech` | 全替换 |
| 16 | 台歌不播放 | 路径从 public/ 出发错误 | 用 `../Crt/` |
| 17 | 切歌死锁 | timeupdate 预取设 `_busy=true` → refill 因 `_busy` 立即返回，锁永不解 | 预取不设锁，让 fetchAI 自己锁 |
| 18 | AI 并发重叠说话 | 无 TTS 单例控制 + UI 未锁定 → 两段语音同时播 | `_currentTts` 单例 + `lockUI/unlockUI` |
| 19 | 冷启动盲等 | `setTimeout(loadState,300)` + `setTimeout(auto-start,2000)` 不稳定 | `app:ready` IPC + `commandLine` autoplay 绕过 |
| 20 | AI 空返回卡死 | DeepSeek 超时无兜底 → `_busy` 永不释放 | `DEFAULT_FALLBACK` 兜底 + 重试 3 次后停止 |
| 21 | 歌手名不显示 | Web API 返回数据不用 `ar` 字段 | `formatTrack` 兼容 `ar`/`artists`/`artist` 多种格式 |
| 22 | 重复推歌 | `filterRepeats` 只按 ` - ` 分隔解析歌手，无 ` - ` 的记录全放过 | 双格式解析 + track 名精确去重 |
| 23 | Token 死循环 | scheduler 主进程直接调 DeepSeek，熔断只在渲染进程，scheduler 无视 | 双层熔断: scheduler `_schedulerFailStreak` + chat `_failStreak` |
| 24 | 熔断后电台哑巴 | 兜底 ID 全是 VIP + proxy 宕 → `resolveHardFallback` 全失败 | `getEmergencyUrl()` 绕过 fee 检查 + 免费 ID + MAX=1 |
| 25 | hourly 整点漏网 | cron 回调未检查熔断状态，每次整点照样调 DeepSeek | hourly 回调首行加 `if (_schedulerFailStreak >= MAX) return` |
| 26 | 登录弹窗假按钮 | `-webkit-app-region: drag` 继承到 user-badge span → 点击被窗口拖拽吞掉 | `.user-badge { -webkit-app-region: no-drag }` |
| 27 | 二维码裂图 | base64 无前缀 `data:image/png;base64,` 或 API 返回格式不一致 | `img.src = qrData.startsWith('data:') ? qrData : 'data:image/png;base64,' + qrData` |
| 28 | 兜底歌全是 VIP | 硬编码 ID 全是 VIP，熔断后仍然无法播放 | `getEmergencyUrl()` 跳过 fee 检查 + 免费 ID |
| 29 | hourly 漏网烧 Token | cron 回调未检查熔断状态，整点照样调 DeepSeek | hourly 回调首行加熔断检查 |
| 30 | Cookie 存了但不生效 | `getSongUrl` 优先走 proxy，VIP 用户反而绕过了官方 API | VIP 快速通道：有 cookie → 先调 `song_url_v1`，成功直接返回 |
| 31 | VIP 拿到歌却被 filter 误杀 | `filterRepeats` 跨会话历史全杀 → tracks=[] → 虚假报错"无音源" | filter 禁止全杀：`!filtered.length && tracks.length → [tracks[0]]` |
| 32 | 台长 Token 被限 | `isStationMaster()` 写死 `秋萝伴点星`，API 返回 `秋蘿伴点星`，一字不匹配 | 改用 API 返回的真实昵称 |
| 33 | AI 无视 BLACKLIST 反复推同一艺人 | context.js BLACKLIST 措辞太软 + DNA"default to top artists"指示 AI 回退老歌手 | BLACKLIST→严厉措辞 + DNA 改为 taste direction + 双标签强制融合 |
| 34 | 红心歌单自循环 | liked_songs_sample 作为"参考锚点"→ AI 理解为"推荐同款" | 改为 taste compass + 70/30 新老比例 |
| 35 | DNA 永久封杀喜爱歌手 | `If unsure, default to top artists` 导致 AI 反复推同一批人 | DNA 去艺人名字，只保留风格/mood/scene |
| 36 | V1 起就反复播同一首歌 | 硬兜底 3 处路径从未调 `addPlay`，播放记录永不写入 SQLite，filter 永远拦不住 | 补全 addPlay：熔断路径 + 正常硬兜底 + router 全杀兜底 |
| 37 | AI 词汇表枯竭 | DeepSeek 华语艺人知识有限，高频请求后必然循环 | 120+ 艺人池注入 prompt + 歌单艺人随机采样 |
| 38 | filter 拦截后又被放行 | `filterRepeats` 全杀后 `return [tracks[0]]` 把被拦的歌又放回去 | 全杀后返回 `[]`，触发硬兜底而非重播被拦曲 |
| 39 | 最大化按钮失效 | `favs.js` 只绑了 min/close，漏了 max 的 click 事件 | 补 `$('#btn-max').addEventListener` |
| 40 | 网易云 405 限流 | 预搜索 + resolveTrack + 模块 API 高频调用，NeteaseCloudMusicApi 被限 | `callModule` 60s 静默降级 + 预搜索减半 + refill 30s 冷却 |
| 41 | refill 死循环烧 Token | filter 拦截→空→refill→AI→拦截→死循环 | 拦截后走 Chillwave 兜底 + `_lastRefill` 冷却 |
| 42 | "刚听过这首"后卡死 | back-to-back reject 调 refill → AI 可能再推同一首 → 熔断停摆 | 直接走 handleFallback 硬兜底 |
| 43 | handleFallback 引用已删除的 queue | 歌词面板迁移后 queue/currentIdx/renderQueue 全移除 | 重写为 window.claudio.refillQueue IPC |

## 📖 更多文档
- `docs/v1_context/architecture.md` — V1 架构详解
- `docs/v1_context/strict_rules.md` — V1 绝对禁区
- `docs/v1_context/V2_HANDOVER.md` — V1→V2 交接信
- `docs/v1_context/v2_roadmap.md` — V2 开发蓝图
