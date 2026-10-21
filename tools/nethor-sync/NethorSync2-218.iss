; Nethor Sync 2 - installation par utilisateur Windows, sans elevation.
; Le dossier des plannings est choisi explicitement ; il n'est ni copié ni modifié.
#define AppVersion "2.1.8"
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
Source: "Update-NethorSync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "NethorSync-Version.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "Connect-NethorSync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Installer-Sync.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Register-NethorSyncTasks.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "Verify-NethorSyncBinding.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "NethorSyncRunner.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.example.json"; DestDir: "{app}"; Flags: onlyifdoesntexist
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Lundi-Samedi"""; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Dimanche"""; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Controle Manuel"""; Flags: runhidden
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Nethor Sync 2 - Mises a jour"""; Flags: runhidden

[Code]
var
  PlanningPage: TInputDirWizardPage;

function IsAutoUpdate: Boolean;
begin
  Result := CompareText(ExpandConstant('{param:AUTOUPDATE|0}'), '1') = 0;
end;

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
  if IsAutoUpdate then Exit;
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
  Details: AnsiString;
  Diagnostic: String;
  ErrorFile: String;
  Reply: Integer;
  Success: Boolean;
begin
  if CurStep <> ssPostInstall then Exit;
  if IsAutoUpdate then
  begin
    { Pas de configuration ni de nouvelle authentification lors d'une mise a jour.
      Le programme d'update verifie la presence de la configuration avant
      de lancer l'installateur. }
    Exit;
  end;
  Cmd := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\Installer-Sync.ps1') +
    '" -PlanningFolder "' + PlanningPage.Values[0] + '"';
  ErrorFile := ExpandConstant('{localappdata}\NethorSync2\install-result.txt');
  Success := False;
  repeat
    ResultCode := -1;
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      Cmd, ExpandConstant('{app}'), SW_SHOWNORMAL, ewWaitUntilTerminated, ResultCode) then
    begin
      Diagnostic := 'Impossible de démarrer la configuration Windows.';
    end
    else if ResultCode = 0 then
    begin
      Success := True;
      break;
    end
    else
    begin
      Diagnostic := 'La configuration est incomplète (code ' + IntToStr(ResultCode) + ').';
    end;
    if FileExists(ErrorFile) then
    begin
      if LoadStringFromFile(ErrorFile, Details) then
        Diagnostic := Diagnostic + #13#10#13#10 + UTF8Decode(Details);
    end;
    Reply := MsgBox(Diagnostic + #13#10#13#10 +
      'La liaison déjà créée est conservée. Réessayer maintenant ?',
      mbError, MB_RETRYCANCEL);
  until Reply <> IDRETRY;
  if Success then
  begin
    MsgBox('NethorSync est opérationnel : installation et horaires Windows confirmés.' + #13#10 +
      'Les prochains contrôles se feront sans fenêtre visible.',
      mbInformation, MB_OK);
  end
  else
  begin
    MsgBox('La configuration n''est pas achevée : aucune synchronisation automatique n''a été activée.' +
      Chr(13) + Chr(10) + 'Relancez cet installateur pour reprendre là où il s''est arrêté.',
      mbInformation, MB_OK);
  end;
end;
