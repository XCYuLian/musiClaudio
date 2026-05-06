# Claudio V2.9 — 你的专属 AI 赛博电台

Claudio 是一个基于 Electron 的 AI 电台。它不只是播放器——它是一个会讲故事、懂留白、像午夜电台主播一样的 DJ。

---

## ✨ V2.9 核心特性

### 🎙️ 午夜主播心智
- **实时叙事**：从歌词里挑一句打动人的，聊聊它让你想到什么
- **背景生成**：不阻塞音乐播放，故事在后台生成
- **歌曲中段触发**：播放到 ~50% 自然插入，TTS 时长自动同步
- **手动触发**：说"讲讲这首"立刻听主播聊

### 🔐 网易云扫码登录
- VIP 无损音质直连，代理自动跳过
- Cookie 全链路注入，SQLite 持久化

### 🎯 探索引擎 V2
- 35 种风格标签 + 独立艺人映射表
- 多样化策略：70% 新发现 + 30% 熟悉，50% 华语/亚洲
- 双标签强制融合 + 48 种深夜场景词汇

### 🛡️ 防重复 + 消息队列
- SQLite 24h 硬拦截
- 用户纠正消息队列（TTL 60s），不被系统 refill 覆盖
- seek-to-end / autoNext 全链路 one-shot 守卫
- 网易云 405 限流自动降级

### 🎨 全动态 UI
- 歌名/歌手强制走马灯
- 时钟数据漂流 + ON AIR 呼吸灯 + 频谱可视化
- DJ 音量 / TTS 音色独立切换

---

## 🚀 快速开始

```bash
npm install
npm start
```

点击右上角 LIVE 徽章 → 扫码登录网易云 → VIP 无损解锁。

---

## 📦 下载

> [Releases](https://github.com/XCYuLian/musiClaudio/releases) 页面下载最新安装包

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
│   │   └── paths.js         # 统一路径解析
│   └── ui/                  # 渲染进程
│       ├── player.js        # 播放器 + 歌词 + 频谱
│       ├── chat.js          # 聊天 + AI + 故事 + 队列
│       ├── favs.js          # 收藏 + 设置 + 状态栏
│       └── auth_ui.js       # 扫码登录 UI
├── public/                  # HTML + CSS
├── plans/                   # 开发计划
└── CLAUDE.md                # 开发者规则 + 45 条 Bug
```

---

## 🛠️ 技术栈

Electron + Node.js / DeepSeek API / Volcengine ICL TTS / NeteaseCloudMusicApi / sql.js

---

## 👨‍💻 创造者

**Galton欣城** — 灵感来自 @mmguo
