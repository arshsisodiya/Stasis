!include "LogicLib.nsh"
!include "nsDialogs.nsh"

# -----------------------------
# Auto-run After Install
# -----------------------------

!macro NSIS_HOOK_POSTINSTALL
  # Register stasis:// deep-link protocol for notification action buttons.
  WriteRegStr HKCU "Software\Classes\stasis" "" "URL:Stasis Protocol"
  WriteRegStr HKCU "Software\Classes\stasis" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\stasis\DefaultIcon" "" "$INSTDIR\Stasis.exe,0"
  WriteRegStr HKCU "Software\Classes\stasis\shell\open\command" "" '"$INSTDIR\Stasis.exe" "%1"'
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

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\stasis"
!macroend