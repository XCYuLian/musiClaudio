# Claudio V2.0 — 开发蓝图

## 核心目标

### 1. 代码模块化重构（最高优先级）

拆分当前单体 `public/player.js`（~380 行）和后端杂糅模块：

```
lib/
  api/          # DeepSeek、网易云、TTS 等外部 API 封装
    deepseek.js
    netease.js
    tts.js
  core/         # 核心业务逻辑
    intent.js   # 意图分类
    scheduler.js
    state.js
  ui/           # 纯 UI 逻辑（与 core 无耦合）
    chat.js
    player.js
    favs.js
```

**原则：** V1 逻辑拆分后必须依然可运行，再接入新音源。

### 2. 全网音源接入

替换/增强当前仅依赖网易云的单一音源：
- **AlgerMusicPlayer** 或类似聚合接口
- 多源降级：A 源失败 → B 源 → C 源
- 每个源独立超时（≤5s），不阻塞

### 3. 修复 V1 遗留问题

| 问题 | 优先级 |
|------|--------|
| 代理 @unblockneteasemusic/server 不稳定 | P0 |
| EXE 图标仅便携版生效（resedit），Setup 版走 electron-builder | P1 |
| electron-builder 需 Windows CMD + 特定 TEMP | P1 |
| 歌手校验依赖网易云返回 ar 字段（部分歌缺 artist 数据） | P2 |
| 日 token 限额硬编码 100k | P2 |

### 4. V2 新功能方向

- **多语言 TTS 音色切换**：UI 按钮选择不同 DJ 声音
- **音源缓存预加载**：当前曲播到 70% 时后台预取下一首
- **播放列表持久化**：重启恢复完整队列（当前只恢复当前曲）
- **更丰富的彩蛋**：隐藏频段扩展

## 开发流程

1. **先读** `docs/v1_context/architecture.md` + `strict_rules.md`
2. **模块拆分**：建 `lib/api/`, `lib/core/`，逐文件迁移
3. **验证 V1 全功能**：每拆分一个模块跑完整测试
4. **接入新音源**：合并到 `lib/api/music.js`
5. **UI 增强**：新音色切换、缓存预加载

## V1 保留事项

以下逻辑 V2 不得改变：
- JSON 协议 `{system_log, dj_speech, action_type, search_query}`
- `_busy` 单锁机制
- `chat_only` / `change_song` 路由
- `fadeVol(0.15)` 背景音乐
- 进度条拖拽、爱心收藏、Logo 7 连点彩蛋
