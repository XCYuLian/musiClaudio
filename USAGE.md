# Claudio 使用指南

## 环境准备

### 1. 前置服务

| 服务 | 说明 | 获取方式 |
|------|------|---------|
| DeepSeek API Key | AI 大脑，必须 | [platform.deepseek.com](https://platform.deepseek.com) |
| Fish Audio API Key | TTS 语音合成 | [fish.audio](https://fish.audio) |
| NeteaseCloudMusicApi | 网易云音乐代理 | `git clone` 后本地 `npm start`，默认 :3000 |

### 2. 安装

```bash
cd Claudio
npm install
cp .env.example .env
```

编辑 `.env`，至少填上 `DEEPSEEK_API_KEY`。

### 3. 启动

```bash
npm run dev     # 开发模式，文件变更自动重启
```

服务默认监听 `http://localhost:8080`。

## 定义你的品味

编辑 `user/` 目录下的 4 个文件。**写得越具体，Claudio 越懂你。**

### `taste.md` — 音乐品味
```markdown
## 我喜欢的
- 后摇 (MONO, toe, Sigur Rós)
- 爵士说唱 (Nujabes)
...
## 我不喜欢的
- 榜单流行
...
```

### `routines.md` — 每日作息
```markdown
| 时间 | 场景 | 音乐需求 |
| 09:00 | 开始工作 | 纯器乐，专注 |
| 22:00 | 准备睡觉 | 氛围，无歌词 |
```

### `mood-rules.md` — 情绪规则
```markdown
| 触发词 | 动作 |
| "累了" | 氛围音乐，慢节奏 |
| "开心" | 欢快独立，高 BPM |
```

### `playlists.json` — 歌单模板
```json
{
  "coding-focus": ["toe", "MONO", "Nujabes"],
  "evening-chill": ["Bonobo", "Tycho", "Four Tet"]
}
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/chat` | 发送对话，获取 DJ 回应 |
| `GET` | `/api/now` | 当前播放状态 |
| `GET` | `/api/next` | 获取下一首 |
| `GET` | `/api/taste` | 用户品味摘要 |
| `GET` | `/api/plan/today` | 今日播报计划 |
| `WS` | `/stream` | 实时状态推送 |

### POST /api/chat 示例

```json
// Request
{ "message": "我有点累了，放点放松的音乐" }

// Response
{
  "say": "听起来你今天过得很充实。来，让这首曲子帮你卸下疲惫——这是 toe 的《Goodbye》，整首歌像一条缓缓流淌的河，不需要歌词，鼓点和吉他就够了。",
  "play": ["toe Goodbye", "MONO Hymn to the Immortal Wind"],
  "reason": "用户表达疲倦，选择了后摇器乐，符合 taste.md 中对 toe 和 MONO 的偏好，bpm 在 60-80 区间适合放松。",
  "segue": "闭上眼睛，深呼吸，让音乐接管。"
}
```

## 定时任务

Claudio 内置了调度器，可以定时触发：

- **07:00** — 日常规划播报
- **09:00** — 早间音乐问候
- **每小时** — 情绪/环境检查
- **日历 webhook** — 响应飞书日程变化

调度逻辑在 `lib/scheduler.js`，cron 表达式可按需调整。

## 故障排查

| 问题 | 检查 |
|------|------|
| `DEEPSEEK_API_KEY is not set` | `.env` 文件是否存在、key 是否正确 |
| `Cannot extract valid JSON` | 模型返回格式异常，查看 `claude.js` 日志 |
| 网易云搜索无结果 | `NETEASE_API_URL` 服务是否在运行 |
| TTS 合成失败 | Fish Audio key 是否有效、是否超并发 |
| SQLite 编译报错 | Windows 需安装 C++ 编译工具链 |
