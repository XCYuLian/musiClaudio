# 📻 Claudio V2.8 — 你的专属 AI 赛博电台

Claudio 是一个基于 Electron 的 AI 电台。它不只是播放器——它是一个会讲故事、懂留白、像午夜电台主播一样的 DJ。

---

## ✨ V2.8 核心特性

### 🎙️ 午夜主播心智
- **三段式口播**：情绪锚点 + 幕后故事 + 听觉钩子
- **歌词融入**：随机抽取当前歌曲 2-3 句歌词，自然织入口播
- **交叉淡入**：70% DJ 叠在上一首尾 + 30% 叠在新歌前奏，零空窗
- **手动触发**：说"讲讲这首"立刻听主播聊

### 🔐 网易云扫码登录
- VIP 无损音质直连，代理自动跳过
- Cookie 全链路注入，SQLite 持久化

### 🎯 探索引擎
- 120+ 艺人风格池 + 你的歌单艺人随机采样
- 双标签强制融合 + 48 种深夜场景词汇
- 70/30 新老比例，24h 自动轮回

### 🛡️ 防重复 + 熔断
- SQLite 24h 硬拦截，所有播放路径记录
- 双层熔断（主进程+渲染进程），Token 零浪费
- 网易云 405 限流自动降级

### 🎨 全动态 UI
- 歌名/歌手强制走马灯，20px 指挥舰按钮
- 时钟数据漂流 + ON AIR 呼吸灯 + 频谱可视化
- DJ 音量独立控制

---

## 🚀 快速开始

```bash
npm install
npm start
```

点击右上角 LIVE 徽章 → 扫码登录网易云 → VIP 无损解锁。

---

## 🏗️ 项目结构

```
├── electron-main.js         # Electron 主进程
├── src/
│   ├── api/                 # 外部 API
│   │   ├── deepseek.js      # DeepSeek AI
│   │   ├── netease.js       # 网易云 + VIP
│   │   ├── tts.js           # 火山引擎 TTS
│   │   └── auth.js          # 扫码登录
│   ├── core/                # 核心逻辑
│   │   ├── router.js        # 意图分流
│   │   ├── scheduler.js     # 定时播报 + 熔断
│   │   ├── state.js         # SQLite 持久化
│   │   ├── context.js       # Prompt 组装
│   │   ├── storyteller.js   # 午夜主播引擎
│   │   └── lyric.js         # LRC 解析
│   └── ui/                  # 渲染进程
│       ├── player.js        # 播放器 + 歌词 + 频谱
│       ├── chat.js          # 聊天 + AI + 熔断 + 故事
│       ├── favs.js          # 收藏 + 设置 + 状态栏
│       └── auth_ui.js       # 扫码登录 UI
├── public/                  # HTML + CSS
├── plans/                   # 开发计划
└── CLAUDE.md                # 开发者规则 + 41 条 Bug
```

---

## 🛠️ 技术栈

Electron + Node.js / DeepSeek API / Volcengine ICL TTS / NeteaseCloudMusicApi / sql.js

---

## 👨‍💻 创造者

**Galton欣城** — 灵感来自 @mmguo

*"午夜的电波永不停歇，Claudio 陪你度过每一个无眠之夜。"*
