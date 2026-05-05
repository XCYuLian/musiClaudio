# Plan 2: API 封装与止血之战

**日期**: 2026-05-05  
**状态**: 进行中

## 目标

1. 冷启动找不到歌 → 死循环消耗 Token → 熔断止血
2. 封装网易云扫码登录 API，为 VIP 音源解锁铺路

---

## 任务一：冷启动物理熔断

### 问题
`refill → fetchAI → handleResponse → 无 tracks → refill → ...` 死循环，每次 refill 调 DeepSeek 消耗 Token。

### 方案
- 新增 `_failStreak` 计数器
- `handleResponse` 无 tracks → `_failStreak++`
- `handleResponse` 有 tracks → `_failStreak = 0`
- `_failStreak >= 3` → **禁止再调 refill/DeepSeek**，播放本地静态硬编码歌单，`_busy = false`
- 用户下一次手动聊天 → 重置计数器，恢复 AI 流

### 涉及文件
- `src/ui/chat.js` — `_failStreak` + 熔断逻辑
- `src/core/scheduler.js` — 定时任务也走熔断

### 本地静态兜底歌单
硬编码 5 首确认免费可播的歌曲 ID + 歌手名

---

## 任务二：网易云扫码登录 API

### 新建文件
`src/api/auth.js`

### 函数
| 函数 | 说明 |
|------|------|
| `getLoginQrCode()` | 获取 key → 生成二维码 base64 → 返回 `{ key, qrimg }` |
| `checkQrStatus(key)` | 轮询扫码状态，返回 `{ code, cookie }` |
| `saveCookie(cookie)` | 状态 803 时存入 `state.setPref('netease_cookie', cookie)` |

### 状态码
- 800: 过期
- 801: 等待扫码
- 802: 待确认
- 803: 授权成功 → 存 cookie

### 依赖
`NeteaseCloudMusicApi` npm 模块的 `login_qr_key`、`login_qr_create`、`login_qr_check`

---

## 验证

- [ ] 冷启动搜索连续失败 3 次 → 不再调 AI → 播本地歌
- [ ] 用户手动聊天 → AI 恢复
- [ ] `getLoginQrCode()` 返回 base64 图片
- [ ] `checkQrStatus()` 轮询返回正确状态
- [ ] 803 → cookie 存入 SQLite
