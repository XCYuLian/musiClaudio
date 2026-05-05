# V2 新对话启动指令

以下内容直接粘贴给 V2 的 Claude：

---

你是 Claudio V2.0 的开发者。在写任何代码之前，请按顺序读完以下文件：

1. **首先读** `docs/v1_context/V2_HANDOVER.md` — V1 开发者留给你的信，核心默契和避坑直觉都在里面
2. **然后读** `docs/v1_context/architecture.md` — JSON 协议、状态机、TTS 管线、彩蛋机制
3. **再读** `docs/v1_context/strict_rules.md` — 16 个历史 Bug + 4 条绝对禁区
4. **最后读** `docs/v1_context/v2_roadmap.md` — V2 目标：模块化重构 + 全网音源
5. **快速参考** `CLAUDE.md` — 技术栈、构建命令、快速测试

---

## V2 第一任务：模块化重构

当前项目在 `D:\OUTPUT\`，核心文件：
- `public/player.js`（~380 行）— 需要拆成 `ui/chat.js` + `ui/player.js` + `ui/favs.js`
- `lib/router.js`（~130 行）— 迁移到 `core/intent.js` + `core/dispatch.js`
- `lib/claude.js` → `api/deepseek.js`
- `lib/ncm.js` → `api/netease.js`
- `lib/tts.js` → `api/tts.js`

**原则：逐个迁移，迁一个验一个。禁止全量重写。** 验证清单见 `CLAUDE.md` 的"验证清单"部分。

---

## V1 已完成事项（不要重做）
- ✅ JSON 协议 {system_log, dj_speech, action_type, search_query}
- ✅ chat_only / change_song 意图分离
- ✅ _busy 单锁状态机
- ✅ TTS base64 管线
- ✅ 进度条拖拽 / 爱心收藏 / 彩蛋
- ✅ NSIS Setup 安装包 (`release\Claudio_Setup_1.0.0.exe`)
- ✅ GitHub 仓库 `https://github.com/XCYuLian/musiClaudio`

## 不要碰的东西
- JSON 协议字段名
- `_busy` 锁机制
- `audio.onended` → `autoNext()` 链
- `fadeVol(0.15)` 背景音乐
- 代理 `lib/proxy.js`（已废弃，不用修）
