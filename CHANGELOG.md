# Claudio 更新报告

## V2.1 — 2026-05-05

### 🏗️ 架构重构
- **模块化拆分**：`lib/` → `src/api/` + `src/core/` + `src/ui/`
- 14 个源文件按职责三层分层，40+ 处 require 路径精密修正
- 删除 11 个旧文件 + 5 个误追踪临时文件

### 🔐 网易云扫码登录
- 基于 NeteaseCloudMusicApi 的 QR 码登录流程
- 非阻塞 IPC 架构：获取 QR → 轮询状态 → Cookie 存入 SQLite
- Cookie 全链路注入：`callModule()` + `webGet()` + `getEmergencyUrl()`

### ⚡ VIP 极速直连
- 登录后优先走官方 `song_url_v1 (level: lossless)`
- 代理自动跳过，零 `proxy URL failed` 日志刷屏
- 音质提升：`br=320000` → `br=999000`

### 🎯 探索多样性引擎
- 每次 AI 请求注入随机小众风格 + 星座天气氛围
- 心动歌曲作为参考锚点："这些你听腻了，找相似但不同的"
- 24h 持久化去重：SQL 时间过滤替代数量限制

### 🛡️ 原唱守卫强化
- 强制歌手匹配：非目标歌手结果直接丢弃
- BAD_KEYWORDS 扩展至 26 项
- `getEmergencyUrl()` 绕过 VIP 检查确保兜底

### 🔄 双层熔断机制
- 主进程 scheduler + 渲染进程 chat 双保险
- 一次失败即锁死全部 cron 任务
- 硬编码免费兜底 ID + `getEmergencyUrl()` 紧急取链

### 🎤 DJ 智能插嘴
- 10 分钟闲置 → 20% 概率主动闲聊（chat_only，不切歌）
- 凌晨 1-6 点静默
- 结合 VIP 偏好数据个性化话术

### 📜 实时歌词面板
- 废弃传统 QUEUE 列表 → LRC 动态歌词
- 平滑滚动 + 当前行绿色发光高亮
- 无歌词时优雅降级

### 🎨 全动态 UI
- 歌名强制走马灯：长文本滚动 / 短文本摇摆
- 赛博状态栏：Token 模式、VIP 状态、探索风格轮播
- ON AIR 呼吸灯：2s 周期 glow pulse
- 切歌按钮 busy 时物理+视觉双重拦截

### 🐛 修复 15 个 Bug (#17-#31)
详见 CLAUDE.md 历史 Bug 速查

### 👑 台长专属
- 身份感应：无限 Token 权限自动激活
- 启动欢迎语：`欢迎台长归位，无限 Token 权限已自动激活`

---

## V1.0 — 2026-04

- 初始版本：Electron 桌面电台
- DeepSeek AI DJ + 火山 TTS
- 网易云音乐搜索 + 播放
- JSON 协议意图分离
- 进度条/收藏/彩蛋
