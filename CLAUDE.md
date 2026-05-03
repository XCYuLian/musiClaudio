# CLAUDE.md — Claudio Project Rules

## 技术栈
- **Runtime**: Node.js ≥ 18 (利用原生 fetch)
- **Backend**: Express + ws (WebSocket)
- **数据库**: better-sqlite3 (单文件 `state.db`)
- **定时任务**: node-cron
- **AI**: DeepSeek API (OpenAI-compatible, `deepseek-chat` 模型)
- **外部服务**: NeteaseCloudMusicApi (本地代理), Fish Audio TTS

## 项目约定

### 文件结构
```
/              → 配置文件 (package.json, .env, .env.example)
/lib/          → 后端核心模块 (context.js, claude.js, router.js, scheduler.js, tts.js)
/prompts/      → 系统提示词模板 (dj-persona.md)
/user/         → 用户语料 (taste.md, routines.md, mood-rules.md, playlists.json)
/cache/tts/    → TTS 音频缓存
/public/       → PWA 前端 (后续阶段)
```

### 代码风格
- CommonJS (`require` / `module.exports`)，不用 ESM
- 异步用 `async/await`，错误统一抛自定义 Error 子类
- 环境变量通过 `dotenv` 加载，key 名全部大写 + 下划线
- 日志用 `morgan` 中间件，业务日志用 `console.error` 打 stderr

### 模块间通信
- `context.js` → `claude.js`：context 产出 `{systemPrompt, userMessage}`，喂给 claude 模块
- `router.js` → 意图分流，简单指令直连操作，NL 对话走 claude
- `scheduler.js` → 调用 `context.js` + `claude.js`，结果通过 WS 推前端
- `tts.js` → 接收 `say` 字段文本，调 Fish Audio 合成 MP3 到 `/cache/tts/`

### JSON 约束 (关键)
- DeepSeek 模型输出强制 JSON，`claude.js` 内置三层提取策略 + schema 校验
- 任何模块不得直接信任模型原始输出，必须经过 `extractJSON()` + `validateResponse()`
- schema 固定为：`{say: string, play: string[], reason: string, segue: string}`

### 测试
- `npm run dev` 用 `--watch` 热重载
- 后端未就绪前，用 `user/` 下的 mock 数据验证 `context.js` 组装逻辑
- 模型调用前先 `console.log(systemPrompt)` 确认提示词拼装正确

## 已知坑
- DeepSeek 偶尔在 JSON 外加废话 → `extractJSON()` 的正则兜底
- better-sqlite3 需 C++ 编译环境 (Windows 装 `windows-build-tools`)
- Fish Audio TTS 有并发限制，`tts.js` 需排队
- NeteaseCloudMusicApi 本地服务必须先启动，否则搜索/播放链路全断
