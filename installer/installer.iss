#define AppName "Startup Notifier"
#define AppVersion GetEnv('APP_VERSION')
#define AppPublisher "Arsh Sisodiya"
#define AppExeName "StartupNotifier.exe"
#define AppDirName "Startup Notifier"
#define TaskName "StartupNotifierTask"

[Setup]
AppId={{9A5E9D2F-8C24-4F92-B2A9-STARTUPNOTIFIERBYARSH}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={pf}\{#AppDirName}
DisableDirPage=yes
DefaultGroupName={#AppName}
DisableProgramGroupPage=no
OutputDir=output
OutputBaseFilename=StartupNotifierSetup-{#AppVersion}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
WizardStyle=modern
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Components]
Name: "main"; Description: "Application Files"; Flags: fixed

[Tasks]
Name: "normalmode"; Description: "Normal Mode (visible, configurable)"; Flags: exclusive
Name: "hiddenmode"; Description: "Background Mode (runs silently at startup)"; Flags: exclusive unchecked
Name: "desktopicon"; Description: "Create Desktop Shortcut"; Flags: unchecked

[Files]
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.template.json"; DestDir: "{commonappdata}\{#AppDirName}"; DestName: "config.json"; Flags: onlyifdoesntexist

[Dirs]
Name: "{commonappdata}\{#AppDirName}"; Permissions: admins-full system-full

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: normalmode
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "schtasks.exe"; \
Parameters: "/create /f /sc onstart /ru SYSTEM /rl HIGHEST /tn {#TaskName} /tr """"{app}\{#AppExeName}"""""; \
Flags: runhidden

[UninstallRun]
Filename: "schtasks.exe"; \
Parameters: "/delete /f /tn {#TaskName}"; \
Flags: runhidden

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\{#AppDirName}"

; =============================
; CODE MUST BE LAST
; =============================
[Code]

var
  TelegramPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  TelegramPage :=
    CreateInputQueryPage(
      wpSelectTasks,
      'Telegram Configuration',
      'Telegram Bot Setup',
      'Enter your Telegram bot details. These are stored locally and can be changed later.'
    );

  TelegramPage.Add('Bot Token:', False);
  TelegramPage.Add('Chat ID:', False);
end;

procedure WriteConfig(Mode: String);
var
  ConfigPath: String;
  ConfigJson: String;
  BotToken: String;
  ChatId: String;
begin
  ConfigPath :=
    ExpandConstant('{commonappdata}\Startup Notifier\config.json');

  BotToken := TelegramPage.Values[0];
  ChatId := TelegramPage.Values[1];

  ConfigJson :=
    '{' + #13#10 +
    '  "ui_mode": "' + Mode + '",' + #13#10 +
    '  "startup_delay": 15,' + #13#10 +
    '  "logging": { "level": "info" },' + #13#10 +
    '  "telegram": {' + #13#10 +
    '    "bot_token": "' + BotToken + '",' + #13#10 +
    '    "chat_id": "' + ChatId + '"' + #13#10 +
    '  }' + #13#10 +
    '}';

  SaveStringToFile(ConfigPath, ConfigJson, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if IsTaskSelected('hiddenmode') then
      WriteConfig('hidden')
    else
      WriteConfig('normal');
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = TelegramPage.ID then
  begin
    if (TelegramPage.Values[0] = '') or (TelegramPage.Values[1] = '') then
    begin
      MsgBox(
        'Telegram Bot Token and Chat ID are required.',
        mbError,
        MB_OK
      );
      Result := False;
    end;
  end;
end;

