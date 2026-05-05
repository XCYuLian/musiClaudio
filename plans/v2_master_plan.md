# Claudio V2.0 终极总纲领与避坑指南

> 制定日期: 2026-05-05 | 效力: V2 开发宪法，所有 feature 分支必须遵守

---

## 一、 致命 Bug 修复红线（必须立即在 src/ 代码中解决）

### 1. 双重锁与切歌死锁
- ❌ 绝对禁止 `_aiLocked` 等多余状态锁
- ✅ 全局只能有且只有 `_busy` 一个布尔锁
- ✅ `audio.onended -> autoNext() -> playAudio()` 链路必须通畅，播完一首自动播下一首
- ✅ `playAudio()` 首行 `_busy = false`
- 风险点：`handleResponse` 中 TTS 播放超时保护 (`setTimeout 20000`) 必须可靠释放 `_busy`

### 2. AI 并发重叠发声（吵架 Bug）
- ✅ 发送消息时，UI 必须物理锁定（`input` 和 `button` 设为 `disabled`），直到 TTS **彻底播放完毕**（`ttsAudio.onended`）才能释放 `_busy` 并解锁 UI
- ✅ 全局只能有一个 TTS 音频实例，避免两段语音重叠
- ✅ 新 TTS 触发前必须终止旧的 TTS 实例（`tts.pause(); tts = null`）

### 3. 冷启动无声/失败
- ✅ Electron 主进程必须加 `app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')` 绕过 Chrome 声音拦截
- ❌ 废弃 3 秒 `setTimeout`。必须等 `window.onload` + SQLite 就绪后，再发送带有 `app_start` 意图的开场请求给 DeepSeek AI
- ✅ `electron-main.js` 中 scheduler 必须在 state.init() 完成后才触发首次播报

### 4. DeepSeek AI 返回空/变哑巴
- ✅ 当 DeepSeek 接口超时或返回空 JSON 时，绝不能卡死状态
- ✅ 必须触发兜底逻辑：播放系统默认备用歌单，并释放 `_busy` 锁
- ✅ 默认备用歌单：硬编码 3-5 首经典中文歌曲路径，确保离线也能播放

### 5. 网易云总是播放翻唱/DJ版
- ✅ `src/api/netease.js` 搜索逻辑必须对 `ar.name`（网易云歌手名字段）进行严格比对
- ✅ 当 AI 指定原唱时，直接过滤掉结果列表中的翻唱版本
- ✅ `artistMatch` 需要两个方向都检查（原唱包含结果 且 结果包含原唱），避免单方向匹配漏过
- ✅ 增加更多质量过滤关键词

---

## 二、 V2 核心产品决策

### 1. 网易云渐进式扫码登录
- 不强制拦截用户使用软件
- 支持免登录试听，但提供扫码入口基于 NeteaseCloudMusicApi 登录网易云账号
- 解锁 VIP 音源和私人日推

### 2. 网易云代理兜底熔断
- 如果免登录模式下使用的代理模块（`@unblockneteasemusic/server`）崩溃
- 绝不能让软件闪退，直接跳过当前歌曲执行 `autoNext()`
- `getSongUrl` 所有异常必须被 try-catch 捕获

### 3. 网易云 Cookie 存储统一
- 网易云扫码获取的授权 Cookie，必须存入现有的 SQLite 数据库中 (`src/core/state.js`)
- 严禁新建额外的 JSON 配置文件
- 使用 `state.setPref('netease_cookie', cookie)` 统一管理

### 4. UI 极简通信
- 拆分后的 UI 不用复杂的事件总线
- 在 `player.html` 中严格按 `<script>` 顺序同步加载：`player.js` → `chat.js` → `favs.js`
- 所有模块通过 `window` 全局作用域共享状态

---

## 三、 V2 史诗级新特性（Roadmap 升级）

### 1. 数字记忆与反思
- 将用户每天的聊天记录存入 SQLite（已有 `messages` 表）
- 每晚 0 点定时触发 DeepSeek 大模型反思
- 自动更新本地的 Taste DNA (`data/internal_taste_dna.md`)

### 2. DJ 闲聊插嘴（Proactive）
- 增加闲置侦测：用户长时间不说话时
- 如果 `!_busy`，DJ 可主动发起话题并请求 DeepSeek 生成语音
- 间隔建议：5-10 分钟随机

---

## 四、 不可碰的铁律（继承 V1）

- JSON 协议 `{system_log, dj_speech, action_type, search_query}` 不可动
- `_busy` 单锁机制不可换
- `audio.onended` → `autoNext()` 链不可断
- `fadeVol(0.15)` 背景音乐最低 15%
- 五大核心功能不可丢：`initSeek`/`initFavs`/`initLogoTap`/`checkEasterEgg`/`fadeVol`
- 构建必须在 Windows CMD 中，`set TEMP=C:\Users\xc_yulian\AppData\Local\Temp`

---

## 五、 验证清单（每次改动后必跑）

- [ ] AI 自启 DJ 播报是否正常
- [ ] 聊天 "今晚月亮好亮" → `chat_only` 不切歌
- [ ] 说 "放一首周杰伦晴天" → `change_song` 切歌
- [ ] 进度条可拖拽、爱心可点击、Logo 7 连点触发台歌
- [ ] `_busy` 锁不出现双重播报/死锁
- [ ] `fadeVol` 背景音乐渐弱正常
- [ ] 冷启动 3 秒内出声
- [ ] AI 返回空时不卡死，自动兜底
- [ ] 不出现两段 TTS 重叠
- [ ] 翻唱/DJ 版被正确过滤
