@echo off
:: Claudio - Add Windows Defender Exclusion
:: Run as Administrator (Right-click -> Run as admin)
set "DIR=%~dp0.."
echo Claudio - Defender Exclusion
echo Path: %DIR%
echo.
powershell -Command "& { Add-MpPreference -ExclusionPath '%DIR%' }"
if %ERRORLEVEL% neq 0 (
    echo FAILED - Please run as Administrator.
    pause
    exit /b 1
)
echo OK - Exclusion added.
echo Now run: npm run build
pause