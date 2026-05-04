# 📻 Claudio — 你的专属 AI 赛博电台

Claudio 是一款基于 Electron 构建的智能桌面电台应用。它不仅仅是一个音乐播放器，更是一个拥有"灵魂"的 AI DJ。能听懂你的情绪，陪你聊天，在合适时机精准切歌。

---

## ✨ 核心特性 (V1.0)

- 🧠 **智能意图分离**：基于大模型的精准意图识别，聊得来就**不切歌**，想听歌立刻为你播放。严格 JSON 协议分离 `chat_only` 与 `change_song`
- 🎙️ **专属 AI DJ**：火山引擎 ICL 自定义男声 TTS，拥有独立人设与温度，播报绝不包含冰冷的系统日志
- 🛡️ **原唱守卫**：歌手强校验 + 12 关键词黑名单 + 45 秒 VIP 试听拦截，拒绝翻唱/DJ 版
- 🔓 **VIP 解锁**：UnblockNeteaseMusic 代理，破解 30 秒试听限制
- 🔍 **探索引擎**：90% 新歌发现 + 10% 歌单怀旧，50% 华语/亚洲音乐
- ❤️ **红心收藏**：毛玻璃侧边栏 Drawer，随时回味心动曲目
- 📊 **品味 DNA**：自动分析歌单生成音乐画像，AI 比你自己更懂你的口味
- 🎮 **隐藏彩蛋**：聊天框输入"你是谁做的"，或连点 Logo 7 次
- 🎨 **赛博朋克 UI**：20px 网格背景 + VT323 点阵字体 + 呼吸光晕 + 2px 极细进度条

---

## 👨‍💻 创造者与致谢

- **Creator / 创造者**：**Galton欣城**
- **Inspiration / 灵感来源**：特别感谢抖音博主 **@mmguo** 提供的绝妙灵感！([视频传送门](https://v.douyin.com/LdplsjBmzos/))

---

## 🚀 快速开始

下载 Release 的便携版，解压双击 `Claudio.exe` 即可。首次启动即开即用——内置默认 API Key，无需任何配置。

**开发者模式：**
```bash
npm install
npm start        # 开发模式
npm run build:portable  # 打包便携版 → release/Claudio/
```

---

## 📖 怎么获取网易云 UID

1. 手机网易云 → 我的 → 头像 → 分享 → 复制链接
2. 链接末尾 `id=` 后的数字就是你的 UID
3. 设置 → NETEASE IMPORT 中填入，一键导入歌单

---

## 🏗️ 项目结构

```
├── electron-main.js      # Electron 主进程
├── electron-preload.js   # IPC 桥接
├── lib/
│   ├── claude.js         # DeepSeek API + JSON 强校验
│   ├── context.js        # System Prompt 组装（时间/DNA/规则）
│   ├── router.js         # 意图分流 (chat/music)
│   ├── scheduler.js      # 定时播报 + 自启
│   ├── ncm.js            # 网易云 API（歌手强校验）
│   ├── tts.js            # 火山 ICL TTS
│   ├── proxy.js          # VIP 代理解锁
│   ├── import-netease.js # 歌单导入
│   ├── profiler.js       # 品味 DNA 生成
│   ├── weather.js        # IP 定位 + Open-Meteo
│   ├── state.js          # SQLite 持久化
│   └── paths.js          # 统一路径管理
├── prompts/
│   └── dj-persona.md     # DJ 人格系统提示词
├── public/               # 前端 UI
├── data/                 # 运行时数据（DB/歌单/DNA）
├── Crt/                  # 应用图标 + 台歌
└── CLAUDE.md             # 开发者规则与避坑指南
```

---

## 技术栈

Electron + Node.js / DeepSeek API / Volcengine ICL TTS / NeteaseCloudMusicApi / sql.js / node-cron / Open-Meteo / @unblockneteasemusic

---

*"午夜的电波永不停歇，Claudio 陪你度过每一个无眠之夜。"*
