# 📻 Claudio V2.1 — 你的专属 AI 赛博电台

Claudio 是一款基于 Electron 的智能桌面电台。它不只是播放器——它是一个拥有音乐品味的 AI DJ，能听懂你的情绪，陪你聊天，在合适的时机精准切歌。

---

## ✨ V2.1 核心特性

- 🎙️ **AI DJ 电台**：DeepSeek 驱动的智能 DJ，`chat_only` 闲聊不切歌，`change_song` 精准推歌
- 🔐 **网易云扫码登录**：VIP 无损音质直连，免代理，无限制
- 🎯 **探索引擎**：每次请求注入随机小众风格、星座天气氛围、心动歌曲参考锚点
- 📜 **实时歌词**：LRC 解析 + 平滑滚动高亮，替代传统歌单队列
- ⚡ **VIP 极速直连**：登录后走官方 lossless 接口，零 proxy 干扰
- 🛡️ **原唱守卫**：强制歌手匹配，翻唱/DJ 版绝对过滤
- 🔄 **24h 防重复**：SQLite 持久化播放记录，24 小时内绝不重复推荐
- 💬 **DJ 随机插嘴**：10 分钟闲置后 20% 概率主动闲聊（凌晨 1-6 点静默）
- 🎮 **隐藏彩蛋**："/sudo creator" 触发隐藏频段，Logo 7 连点播放台歌
- 🎨 **全动态 UI**：歌名强制走马灯、赛博状态栏、ON AIR 呼吸灯

---

## 🚀 快速开始

```bash
npm install
npm start
```

右上角点击 `🎵 游客` → 扫码登录网易云 → VIP 无损音质解锁。

---

## 🏗️ 项目结构 (V2)

```
├── electron-main.js         # Electron 主进程
├── electron-preload.js      # IPC 桥接
├── src/
│   ├── api/                 # 外部 API 封装
│   │   ├── deepseek.js      # DeepSeek AI 聊天
│   │   ├── netease.js       # 网易云搜索/URL/歌词/VIP
│   │   ├── tts.js           # 火山引擎 TTS 合成
│   │   ├── auth.js          # 网易云扫码登录
│   │   └── weather.js       # IP 定位 + 天气
│   ├── core/                # 核心业务逻辑
│   │   ├── router.js        # 意图分流 (chat/music)
│   │   ├── scheduler.js     # 定时播报 + 自启 + 熔断
│   │   ├── state.js         # SQLite 持久化
│   │   ├── context.js       # System Prompt 组装
│   │   ├── lyric.js         # LRC 歌词解析
│   │   ├── profiler.js      # 品味 DNA 生成
│   │   ├── import-netease.js # 歌单导入
│   │   └── paths.js         # 统一路径
│   └── ui/                  # 渲染进程 UI
│       ├── player.js        # 播放器核心 + 歌词渲染
│       ├── chat.js          # 聊天 + AI 交互 + 熔断
│       ├── favs.js          # 收藏 + 设置 + 状态栏
│       └── auth_ui.js       # 扫码登录交互
├── public/                  # HTML + CSS
├── data/                    # 运行时数据 (SQLite DB)
├── Crt/                     # 图标 + 台歌
├── plans/                   # 开发计划文档
└── CLAUDE.md                # 开发者规则 + 31 条历史 Bug
```

---

## 🛠️ 技术栈

Electron + Node.js / DeepSeek API / Volcengine ICL TTS / NeteaseCloudMusicApi / sql.js / node-cron / Open-Meteo

---

## 👨‍💻 创造者

**Galton欣城** — 灵感来自 @mmguo

*"午夜的电波永不停歇，Claudio 陪你度过每一个无眠之夜。"*
