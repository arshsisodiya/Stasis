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
Var /GLOBAL PrivacyConsentCheckbox
Var /GLOBAL ViewLicenseButton
Var /GLOBAL ViewPrivacyButton

# -----------------------------
# Privacy Consent Page
# -----------------------------

Function OpenLicenseDoc
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=license.txt" "${__FILEDIR__}\\license.txt"
  ExecShell "open" "$PLUGINSDIR\\license.txt"
FunctionEnd

Function OpenPrivacyDoc
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=privacy.txt" "${__FILEDIR__}\\privacy.txt"
  ExecShell "open" "$PLUGINSDIR\\privacy.txt"
FunctionEnd

Function PrivacyConsentPage
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 20u 10u 280u 16u "Before installing Stasis, please review the legal documents:"
  Pop $0

  ${NSD_CreateButton} 20u 30u 130u 14u "View License"
  Pop $ViewLicenseButton
  ${NSD_OnClick} $ViewLicenseButton OpenLicenseDoc

  ${NSD_CreateButton} 170u 30u 130u 14u "View Privacy Policy"
  Pop $ViewPrivacyButton
  ${NSD_OnClick} $ViewPrivacyButton OpenPrivacyDoc

  ${NSD_CreateLabel} 20u 54u 280u 20u "You must accept the Privacy Policy to continue installation."
  Pop $0

  ${NSD_CreateCheckbox} 20u 78u 280u 12u "I have read and accept the Privacy Policy"
  Pop $PrivacyConsentCheckbox

  nsDialogs::Show
FunctionEnd

Function PrivacyConsentPageLeave
  ${NSD_GetState} $PrivacyConsentCheckbox $0
  ${If} $0 != ${BST_CHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_OK "You must accept the Privacy Policy to proceed."
    Abort
  ${EndIf}
FunctionEnd

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
  Page custom PrivacyConsentPage PrivacyConsentPageLeave
  Page custom StartupPage StartupPageLeave
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\stasis"
!macroend