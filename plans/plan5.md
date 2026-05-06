# Plan 5: V2.9 最后定档 — 全局优化

**日期**: 2026-05-06  
**状态**: 进行中

## 已完成

### 切歌稳定性
- [x] **back-to-back reject 卡死** (#42): "刚听过这首"不再调 `refill()` → 直接走 `handleFallback()` 硬兜底
- [x] **handleFallback 重写** (#43): 移除对已删除的 `queue`/`currentIdx`/`renderQueue` 引用 → 改用 `window.claudio.refillQueue()` IPC
- [x] **fallback 空 URL** (#38): router fallback 搜 Chillwave 后补 `getSongUrl` 取真实流
- [x] **硬兜底绕过 filter**: `resolveHardFallback` 不再调 `filterRepeats`

### AI 选歌
- [x] **预搜索直接匹配**: AI 从预搜列表选的歌 → 不重复搜 resolveTrack
- [x] **预搜索 0 首降级重试**: `Math Rock + 治愈` 搜不到 → 降级到纯 `Math Rock`
- [x] **严筛失败宽松兜底**: strict artist 没匹配到 → 不直接 return null → 用宽松结果
- [x] **预搜索备选池**: AI 选的被拦 → 先试预搜其他歌 → 都不行才硬兜底

### 性能
- [x] **网易云模块 405 限流**: `callModule` 检测到异常 → 60s 静默全走 Web API
- [x] **refill 防抖**: 500ms setTimeout 替代立即递归

### 音色
- [x] **VOX 音色矩阵**: 5 个音色（飒爽/磐石/Girl/核心1.0/核心2.0），默认飒爽
- [x] **新版鉴权**: ICL + V3 全切到 `X-Api-Key`

---

## 待完成

### P0：filterRepeats 短名误杀
- `artistMatch("Rad", "Rad Museum")` → 宽泛匹配 → 冷门艺人被误拦
- 修复：短名（<4 字符）不参与 artist 过滤，仅靠 track 名精确去重

### P1：Prompt 精简
- 当前 ~2000 字，压缩到 ~1200 字
- 增加强制行：`preSearchResults 非空时必须从中选取`

### P2：启动优化
- `notifyReady` 回调位置调整（已从 favs 移到正确位置）
- 启动到出声控制在 5 秒内

### P3：日志降噪
- 移除调试 console.log（storyteller / filter 详细日志）
- 只保留 Error + 关键状态

---

## 验证
- [ ] 冷启动 → DJ 说话 → 切歌 → 连续 5 首自动切换
- [ ] "刚听过这首" → 不卡死 → 自动播下一首
- [ ] 手动切歌按钮正常工作
- [ ] 五个音色全部可切换
