@echo off
:: ======================================================
:: Claudio — Add Windows Defender Exclusion
::
:: 右键 → "以管理员身份运行" 或管理员终端执行
:: 排除 OUTPUT 目录，解决 electron-builder / asar 文件锁定问题
:: ======================================================
echo Claudio — Add Windows Defender Exclusion
echo.
echo Excluding: %~dp0..\
echo.

powershell -Command "Add-MpPreference -ExclusionPath '%~dp0..\'" 2>nul
if %ERRORLEVEL% neq 0 (
    echo FAILED — Please run as Administrator
    echo 请右键 → 以管理员身份运行
    pause
    exit /b 1
)

echo OK — Defender exclusion added.
echo You can now run: npm run build
pause
