!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

Name "Stasis"
OutFile "StasisSetup.exe"
InstallDir "$PROGRAMFILES\Stasis"
InstallDirRegKey HKLM "Software\Stasis" "Install_Dir"
RequestExecutionLevel admin

!define MUI_ABORTWARNING
!define MUI_ICON "${__FILEDIR__}\icon.ico"
!define MUI_UNICON "${__FILEDIR__}\icon.ico"

BrandingText "Stasis - Digital Wellbeing for Windows"

# -------------------------
# Pages
# -------------------------

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${__FILEDIR__}\license.txt"
!insertmacro MUI_PAGE_LICENSE "${__FILEDIR__}\privacy.txt"
!insertmacro MUI_PAGE_DIRECTORY

Page custom StartupPage StartupPageLeave

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

# -------------------------
# Variables
# -------------------------

Var StartupCheckbox

# -------------------------
# Custom Page - Run at Startup
# -------------------------

Function StartupPage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 20u 40u 200u 12u "Run Stasis automatically when Windows starts"
  Pop $StartupCheckbox

  nsDialogs::Show
FunctionEnd

Function StartupPageLeave
FunctionEnd

# -------------------------
# Installation Section
# -------------------------

Section "Install"

  SetOutPath "$INSTDIR"

  # Tauri will copy files here automatically
  File /r "*.*"

  WriteRegStr HKLM "Software\Stasis" "Install_Dir" "$INSTDIR"

  CreateDirectory "$SMPROGRAMS\Stasis"
  CreateShortcut "$SMPROGRAMS\Stasis\Stasis.lnk" "$INSTDIR\Stasis.exe"
  CreateShortcut "$DESKTOP\Stasis.lnk" "$INSTDIR\Stasis.exe"

  # Optional startup
  ${NSD_GetState} $StartupCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Stasis" '"$INSTDIR\Stasis.exe"'
  ${EndIf}

  # Write uninstall info
  WriteUninstaller "$INSTDIR\Uninstall.exe"

SectionEnd

# -------------------------
# Run After Install
# -------------------------

Function .onInstSuccess
  Exec "$INSTDIR\Stasis.exe"
FunctionEnd

# -------------------------
# Uninstall Section
# -------------------------

Section "Uninstall"

  ; ---- Kill running backend ----
  nsExec::ExecToStack 'taskkill /IM stasis-backend.exe /F'
  nsExec::ExecToStack 'taskkill /IM Stasis.exe /F'

  Sleep 1000

  Delete "$DESKTOP\Stasis.lnk"
  Delete "$SMPROGRAMS\Stasis\Stasis.lnk"
  RMDir "$SMPROGRAMS\Stasis"

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Stasis"
  DeleteRegKey HKLM "Software\Stasis"

  Delete "$INSTDIR\Uninstall.exe"

  ; ---- Remove full install directory ----
  RMDir /r "$INSTDIR"

SectionEnd