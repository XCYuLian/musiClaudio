# Claudio — 个人 AI 电台

一个能读懂你听歌习惯、像真正的 DJ 一样播报音乐的个人 AI 电台。

## 它是怎么工作的？

```
你的听歌记录 → Claudio 大脑 (DeepSeek) → DJ 播报词 → TTS 语音合成 → 播放
       ↑                  ↑                    ↓
   user/*.md          网易云检索            PWA 客户端
  (品味/作息)        (歌曲/歌词)          (WebSocket)
```

**四层架构**：
1. **外部上下文** — 你的品味文件、DeepSeek 大脑、网易云 API、Fish TTS
2. **本地大脑** — Node.js 核心服务 (router / context / claude / scheduler / tts / state.db)
3. **运行时聚合** — 6 块上下文拼装 → 模型前向 → JSON 输出 → 后处理
4. **交互表层** — PWA 客户端 + HTTP/WebSocket 通信

## 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 意图分流 | `lib/router.js` | 简单指令直连 → 音乐搜索走网易云 → NL 对话走 LLM |
| 提示词组装 | `lib/context.js` | 6 块上下文拼装 → system prompt |
| 大脑适配器 | `lib/claude.js` | DeepSeek API 调用 + JSON 强校验 |
| 节律调度 | `lib/scheduler.js` | cron 定时任务 (早间播报、情绪检查) |
| 声音管线 | `lib/tts.js` | Fish Audio TTS → MP3 缓存 |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 3. 启动开发模式
npm run dev
```

## 用户文件

在 `user/` 目录下编辑你的音乐品味：
- `taste.md` — 喜欢的流派、艺人、关键词
- `routines.md` — 每日作息和对应音乐需求
- `mood-rules.md` — 情绪/天气 → 音乐映射规则
- `playlists.json` — 歌单模板

## 技术栈

Node.js / Express / WebSocket / SQLite / DeepSeek API / Fish Audio TTS
