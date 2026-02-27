!include "LogicLib.nsh"
!include "nsDialogs.nsh"

# -----------------------------
# Auto-run After Install
# -----------------------------

!macro NSIS_HOOK_POSTINSTALL
  # Intentionally left empty. Tauri's built-in run checkbox handles this.
!macroend

# -----------------------------
# Global Variable
# -----------------------------

Var /GLOBAL StartupCheckbox

# -----------------------------
# Custom Startup Page
# -----------------------------

Function StartupPage
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateCheckbox} 20u 40u 200u 12u "Run Stasis automatically when Windows starts"
  Pop $StartupCheckbox

  nsDialogs::Show
FunctionEnd

Function StartupPageLeave
  ${NSD_GetState} $StartupCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Stasis" '"$INSTDIR\Stasis.exe"'
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_CUSTOM_PAGES
  Page custom StartupPage StartupPageLeave
!macroend