# Claudio.fm — Personal AI Radio DJ

你的私人 AI 电台 DJ。了解你的品味、感知时间与天气、自动推荐并播放音乐。

---

## 快速获取你的网易云 UID

> 只有获取正确的 UID，Claudio 才能读懂你的灵魂。

### 方法一：手机 App（推荐）

1. 打开**手机网易云音乐 App**，确保已登录。
2. 点击底部 **"我的"** → 点击自己的**头像**。
3. 进入个人主页后，点击右上角 **"..."** → **"分享"** → **"复制链接"**。
4. 你会获得类似下方的链接：

```
https://y.music.163.com/m/user?id=2034554276
```

5. 链接末尾 `id=` 后面的那串数字（如 `2034554276`）就是你的专属 **UID**。

### 方法二：网页版

1. 打开 [music.163.com](https://music.163.com) 并登录。
2. 点击右上角头像进入个人主页。
3. 浏览器地址栏中的 URL 格式为 `https://music.163.com/#/user/home?id=XXXXXXX`。
4. `id=` 后面的数字就是你的 UID。

---

## 启动 Claudio

```bash
# 开发模式
npm start

# 打包 EXE
npm run build
```

首次启动会显示登录界面——输入你的网易云 UID 即可自动导入歌单并生成品味画像。

---

## 项目结构

```
├── electron-main.js      # Electron 主进程
├── electron-preload.js   # IPC 桥接
├── lib/
│   ├── claude.js         # DeepSeek API 调用
│   ├── context.js        # Prompt 组装（DNA/时间/天气/记忆注入）
│   ├── router.js         # 意图分类 + 指令分流
│   ├── scheduler.js      # 定时播报 + 自动启动
│   ├── ncm.js            # 网易云 API（模块直连 + 网页 fallback）
│   ├── import-netease.js # 歌单导入（分页抓取，1500首上限）
│   ├── profiler.js       # Soul DNA 品味画像生成
│   ├── proxy.js          # UnblockNeteaseMusic VIP 代理
│   ├── tts.js            # Fish Audio TTS 合成
│   ├── weather.js        # IP 定位 + Open-Meteo 天气
│   ├── state.js          # SQLite 持久化
│   └── paths.js          # 统一路径管理
├── prompts/
│   └── dj-persona.md     # DJ 人格系统提示词
├── public/
│   ├── player.html       # 前端 UI
│   ├── player.css        # 赛博朋克样式
│   └── player.js         # 前端逻辑
├── data/                 # 运行时数据
│   ├── state.db          # 播放记录/偏好
│   ├── playlists/        # 导入的歌单
│   └── internal_taste_dna.md  # 品味画像
└── user/                 # 用户语料（可选）
    ├── taste.md
    ├── routines.md
    └── mood-rules.md
```

---

## 环境变量 (.env)

```env
DEEPSEEK_API_KEY=sk-xxx      # DeepSeek API 密钥
DEEPSEEK_MODEL=deepseek-chat # 模型名称
NETEASE_COOKIE=xxx           # 网易云 MUSIC_U cookie（可选，提升导入成功率）
FISH_AUDIO_API_KEY=xxx       # TTS 密钥（可选）
LAT=39.9                     # 默认纬度
LON=116.4                    # 默认经度
```

---

## 技术栈

- **Runtime**: Electron + Node.js ≥ 18
- **AI**: DeepSeek API (OpenAI-compatible)
- **音乐**: NeteaseCloudMusicApi (模块直连)
- **代理**: @unblockneteasemusic/server (VIP 解锁)
- **数据库**: sql.js (SQLite WASM)
- **定时**: node-cron
- **TTS**: Fish Audio
- **天气**: Open-Meteo + ipapi.co
