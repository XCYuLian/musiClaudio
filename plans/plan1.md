# Plan 1: 项目目录整理 — 归入 Claudio/ 子目录

**日期**: 2026-05-05  
**状态**: 进行中

## 目标

将 `D:\OUTPUT\` 根目录的所有 Claudio 项目文件归入 `D:\OUTPUT\Claudio\`，使 OUTPUT 成为多项目 workspace。

## 步骤

1. ~~排查待删文件引用~~ ✅ 已完成 — 全部安全
2. 创建 `Claudio/` 目录
3. `git rm` 误追踪的临时测试文件 (`%TEMP%*`)
4. `git mv` 所有项目文件到 `Claudio/`
5. 移动 `.git/` 到 `Claudio/.git/`（独立 repo）
6. 清理 `D:\OUTPUT\` 的 gitignored 构建产物
7. 更新项目内路径引用
8. 验证 git 状态

## 待删清单（已验证无源码引用）

| 文件 | 大小 | 原因 |
|------|------|------|
| `%TEMP%ncm_test.json` | 0 | 测试残留 |
| `%TEMP%ncm_web.json` | 115B | 测试残留 |
| `%TEMP%tts_test.mp3` | 47B | 测试残留 |
| `%TEMP%tts_test2.mp3` | 47B | 测试残留 |
| `%TEMP%tts_volc.mp3` | 125B | 测试残留 |
| `electron-v33.4.11-win32-x64.zip` | 115MB | 下载缓存，gitignored |
| `node_modules/` | 624MB | gitignored，npm install 重建 |
| `release/` | 1.7GB | gitignored，build 输出 |
| `.electron-cache/` | 110MB | gitignored，构建缓存 |
| `.eb-cache/` | 1.3MB | gitignored |
| `.build-temp/` | 0 | gitignored，构建临时 |

## 验证

- [ ] `git status` 干净
- [ ] `D:\OUTPUT\Claudio\` 包含完整项目
- [ ] `D:\OUTPUT\` 只剩 `.claude/` 系统目录
