!include "MUI2.nsh"
Name "Claudio"
OutFile "release\Claudio_Setup_1.0.0.exe"
InstallDir "$PROGRAMFILES64\Claudio"
RequestExecutionLevel admin
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE English

Section
  SetOutPath "$INSTDIR"
  File /r "release\Claudio\*"
  CreateShortCut "$DESKTOP\Claudio.lnk" "$INSTDIR\Claudio.exe"
  CreateShortCut "$SMPROGRAMS\Claudio\Claudio.lnk" "$INSTDIR\Claudio.exe"
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\Claudio.lnk"
  Delete "$SMPROGRAMS\Claudio\Claudio.lnk"
  RMDir "$SMPROGRAMS\Claudio"
SectionEnd
