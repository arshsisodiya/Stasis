#define AppName "Stasis"
#define AppVersion GetEnv('APP_VERSION')
#define AppPublisher "Arsh Sisodiya"
#define AppExeName "Stasis.exe"
#define AppDirName "Stasis"
#define TaskName "StasisTask"

[Setup]
AppId={{3c6f81ac-25dd-43a5-84b6-8b77764c9434}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={pf}\{#AppDirName}
DisableDirPage=yes
DefaultGroupName={#AppName}
OutputDir=output
OutputBaseFilename=StasisSetup-{#AppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
WizardStyle=modern
SetupLogging=yes
LicenseFile=license.txt

; ⭐ IMPORTANT FOR UPDATE STABILITY
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; =============================
; FILES (FOR PYINSTALLER --ONEDIR)
; =============================

[Files]
; Copy entire onedir folder
Source: "..\dist\Stasis\*"; \
    DestDir: "{app}"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

; =============================
; REGISTRY CLEANUP
; =============================

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueName: "Stasis"; \
    Flags: deletevalue uninsdeletevalue

; =============================
; ICONS
; =============================

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"

; =============================
; RUN AFTER INSTALL
; =============================


[Run]

Filename: "schtasks.exe"; \
Parameters: "/create /f /sc onlogon /tn ""{#TaskName}"" /tr """"{app}\{#AppExeName}"""""; \
Flags: runhidden

Filename: "{app}\{#AppExeName}"; \
Flags: nowait runascurrentuser


; =============================
; UNINSTALL SECTION
; =============================

[UninstallRun]

; Kill running process
Filename: "taskkill.exe"; \
Parameters: "/f /im {#AppExeName}"; \
Flags: runhidden; \
RunOnceId: "KillStasis"

; Delete scheduled task
Filename: "schtasks.exe"; \
Parameters: "/delete /f /tn ""{#TaskName}"""; \
Flags: runhidden; \
RunOnceId: "DeleteStasisTask"

; =============================
; OPTIONAL DATA DELETE PROMPT
; =============================

[Code]

var
  DeleteData: Boolean;

procedure InitializeUninstallProgressForm;
var
  Response: Integer;
begin
  Response :=
    MsgBox(
      'Do you want to delete all application data (logs, config, activity data)?',
      mbConfirmation,
      MB_YESNO or MB_DEFBUTTON2
    );

  DeleteData := (Response = idYes);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataPath: String;
begin
  if (CurUninstallStep = usPostUninstall) and DeleteData then
  begin
    DataPath := ExpandConstant('{localappdata}\{#AppDirName}');
    if DirExists(DataPath) then
      DelTree(DataPath, True, True, True);
  end;
end;
