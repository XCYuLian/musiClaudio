# Claudio.fm v1.0 — Personal AI Radio DJ

你的私人 AI 电台 DJ。了解你的品味、感知时间与天气、用你的声音说话、自动推荐并播放音乐。

## 快速开始

```bash
npm install
npm start        # 开发模式
npm run build    # 打包 EXE → release/Claudio/Claudio.exe
```

首次启动即开即用——内置默认 API Key，无需任何配置。

## 怎么获取网易云 UID

1. 手机网易云 → 我的 → 头像 → 分享 → 复制链接
2. 链接末尾 `id=` 后的数字就是你的 UID
3. 在设置 → NETEASE IMPORT 中填入，一键导入歌单

## 功能

- 🎙️ **AI 电台 DJ**：DeepSeek 驱动，单曲流式推荐，DJ 说话 + 音乐交替
- 🗣️ **声音复刻**：火山引擎 ICL 自定义男声 TTS，DJ 真的在说话
- 🔍 **70% 探索模式**：90% 新歌发现 + 10% 歌单怀旧
- 🚫 **翻唱拦截**：歌手强校验 + 黑名单关键词 + VIP 试听过滤
- 🔓 **VIP 解锁**：UnblockNeteaseMusic 代理（端口 8081）
- ❤️ **红心收藏**：侧边栏 Drawer，毛玻璃效果
- 📊 **品味 DNA**：自动分析歌单生成音乐画像
- 🎮 **彩蛋**：聊天框输入"你是谁做的"或连点 Logo 7 次

## 项目结构

```
├── electron-main.js      # Electron 主进程
├── electron-preload.js   # IPC 桥接
├── lib/
│   ├── claude.js         # DeepSeek API + JSON 强校验
│   ├── context.js        # System Prompt 组装
│   ├── router.js         # 意图分流 (chat/music)
│   ├── scheduler.js      # 定时 + 自启
│   ├── ncm.js            # 网易云 API（歌手强校验）
│   ├── tts.js            # 火山 ICL TTS
│   ├── proxy.js          # VIP 代理解锁
│   ├── import-netease.js # 歌单导入
│   ├── profiler.js       # 品味 DNA 生成
│   ├── weather.js        # IP 定位 + Open-Meteo
│   ├── state.js          # SQLite 持久化
│   └── paths.js          # 统一路径
├── prompts/
│   └── dj-persona.md     # DJ 人格
├── public/
│   ├── player.html       # UI
│   ├── player.css        # 赛博朋克样式
│   └── player.js         # 前端逻辑
├── data/                 # 运行时数据
│   ├── state.db          # 播放记录/偏好
│   ├── playlists/        # 导入的歌单
│   └── internal_taste_dna.md
├── Crt/                  # 图标 + 台歌
└── CLAUDE.md             # 开发者规则与避坑指南
```

## 环境变量 (.env)

```env
DEEPSEEK_API_KEY=sk-xxx           # DeepSeek API 密钥
DEEPSEEK_MODEL=deepseek-chat      # 模型名称
VOLC_APPID=2901907354             # 火山引擎 AppID
VOLC_TOKEN=xxx                    # 火山引擎 Access Token
VOLC_SPEAKER=S_xSgIXKL12         # 自定义音色 ID
```

## 技术栈

Electron + Node.js / DeepSeek API / Volcengine ICL TTS / NeteaseCloudMusicApi / sql.js / node-cron / Open-Meteo

---

**Created by Galton欣城, 2026**
