# Plan 1: 项目目录整理 — 归入 Claudio/ 子目录

**日期**: 2026-05-05  
**状态**: ✅ 已完成

## 目标

将 `D:\OUTPUT\` 根目录的所有 Claudio 项目文件归入 `D:\OUTPUT\Claudio\`，使 OUTPUT 成为多项目 workspace。

## 步骤

1. ~~排查待删文件引用~~ ✅ 全部安全（源码零引用）
2. ~~创建 `Claudio/` 目录~~ ✅
3. ~~`git rm` 误追踪的临时测试文件 (`%TEMP%*`)~~ ✅
4. ~~`git mv` 所有项目文件到 `Claudio/`~~ ✅（后因 .git 移入而 flatten 回根级）
5. ~~移动 `.git/` 到 `Claudio/.git/`（独立 repo）~~ ✅
6. ~~清理 `D:\OUTPUT\` 的 gitignored 构建产物~~ ✅ 释放 ~2.5GB
7. ~~更新项目内路径引用~~ ✅ CLAUDE.md 构建路径 corrected
8. ~~验证 git 状态~~ ✅ `nothing to commit, working tree clean`

## 整理结果

```
D:\OUTPUT\
  .claude\              # Claude Code 系统
  Claudio\              # Claudio 项目（独立 git repo）
    .git\
    .env                # 从旧位置复制
    electron-main.js
    lib\ public\ ...    # 所有源码
    plans\plan1.md      # 本文件
```

## 待删清单（已验证无源码引用）

| 文件 | 大小 | 结果 |
|------|------|------|
| `%TEMP%*` × 5 | ~0.3KB | `git rm` + 物理删除 |
| `electron-v33.4.11-win32-x64.zip` | 115MB | 已删除 |
| `node_modules/` | 624MB | 已删除 |
| `release/` | 1.7GB | 已删除 |
| `.electron-cache/` | 110MB | 已删除 |
| `.eb-cache/` | 1.3MB | 已删除 |
| `.build-temp/` | 0 | 已删除 |

## 验证

- [x] `git status` 干净
- [x] `D:\OUTPUT\Claudio\` 包含完整项目
- [x] `D:\OUTPUT\` 只剩 `.claude/` + `Claudio/`
- [x] `.env` 已复制到 Claudio/
