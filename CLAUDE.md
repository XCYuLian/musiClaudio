# Claudio — 开发者规则与避坑指南 (V2 Ready)

## 技术栈
- **Runtime**: Node.js ≥ 18, Electron + CommonJS
- **数据库**: sql.js (SQLite WASM, `data/state.db`)
- **AI**: DeepSeek API (`deepseek-chat`，**禁用 deepseek-v4-flash**)
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
  cd D:\OUTPUT
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

## 📖 更多文档
- `docs/v1_context/architecture.md` — V1 架构详解
- `docs/v1_context/strict_rules.md` — V1 绝对禁区
- `docs/v1_context/V2_HANDOVER.md` — V1→V2 交接信
- `docs/v1_context/v2_roadmap.md` — V2 开发蓝图
