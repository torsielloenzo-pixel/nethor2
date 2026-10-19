; Nethor Sync 2 - installation par utilisateur Windows, sans elevation.
; Le dossier des plannings est choisi explicitement ; il n'est ni copié ni modifié.
#define AppVersion "2.1.0"
[Setup]
AppId={{B29F5D58-538F-40C2-9FA2-1A6B5926A4F8}
AppName=NethorSync 2
AppVersion={#AppVersion}
AppPublisher=Nethor
AppPublisherURL=https://nethor.fr/
DefaultDirName={localappdata}\NethorSync2\app
DefaultGroupName=NethorSync 2
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyMemo=yes
PrivilegesRequired=lowest
WizardStyle=modern
OutputDir=..\..\build\installer
OutputBaseFilename=NethorSync2-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
CloseApplications=no
UninstallDisplayName=NethorSync 2 — Agent de synchronisation
ChangesEnvironment=no
SetupLogging=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "NethorSync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Connect-NethorSync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Installer-Sync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "NethorSyncRunner.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.example.json"; DestDir: "{app}"; Flags: onlyifdoesntexist
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Lundi-Samedi"""; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Dimanche"""; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Controle Manuel"""; Flags: runhidden

[Code]
var
  PlanningPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  PlanningPage := CreateInputDirPage(
    wpWelcome,
    'Localisation des plannings',
    'Choisissez le dossier suivi par NethorSync',
    'Sélectionnez le dossier contenant vos fichiers Excel et ses sous-dossiers (année, mois). ' +
    'Les originaux restent à cet emplacement et ne seront jamais supprimés.',
    False, '');
  PlanningPage.Add('Dossier à surveiller :');
  PlanningPage.Values[0] := ExpandConstant('{userdesktop}\Nethor Sync');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PlanningPage.ID then
  begin
    if (not DirExists(PlanningPage.Values[0])) then
    begin
      MsgBox('Ce dossier est introuvable. Veuillez sélectionner un dossier existant.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Cmd: String;
begin
  if CurStep <> ssPostInstall then Exit;

  Cmd := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Installer-Sync.ps1') +
    '" -PlanningFolder "' + PlanningPage.Values[0] + '"';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Cmd, ExpandConstant('{app}'), SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('L''assistant de configuration NethorSync n''a pas pu démarrer. ' +
      'Le poste n''est pas opérationnel. Vous pouvez réessayer depuis le programme installé.',
      mbError, MB_OK);
  end
  else if ResultCode <> 0 then
  begin
    MsgBox('NethorSync a été copié sur ce poste mais la configuration n''a pas abouti (code ' +
      IntToStr(ResultCode) + '). Aucune synchronisation automatique n''a été activée.',
      mbError, MB_OK);
  end
  else
  begin
    MsgBox('Installation terminée. NethorSync fonctionnera discrètement en arrière-plan. ' +
      'Vous pouvez vérifier son état depuis Nethor2.', mbInformation, MB_OK);
  end;
end;
