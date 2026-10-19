#requires -Version 5.1
<#
Enregistre les taches pour le compte Windows courant, sans droit administrateur.
Utilise le service Windows Task Scheduler (COM) : aucune dependance
aux noms de jours de la langue Windows ni aux codes retour de schtasks.exe.
#>
[CmdletBinding()]
param(
  [string]$AppPath = $PSScriptRoot,
  [switch]$ProbeOnly,
  [switch]$SkipStart
)
$ErrorActionPreference = 'Stop'
$agentPath = [IO.Path]::GetFullPath($AppPath)
$runner = Join-Path $agentPath 'NethorSyncRunner.vbs'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
  throw "Programme de fond introuvable : NethorSyncRunner.vbs."
}
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
if (-not (Test-Path -LiteralPath $wscript -PathType Leaf)) {
  throw 'Le moteur Windows Script Host est indisponible.'
}
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $user) { throw 'Utilisateur Windows non identifiable.' }
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')

function New-TaskDefinition([string]$Name,[string]$Mode,[int]$Days,[int]$Hour,[int]$TriggerType) {
  $task = $service.NewTask(0)
  $task.RegistrationInfo.Description = 'NethorSync 2 : synchronization de planning, gérée depuis Nethor2.'
  $task.Principal.UserId = $user
  $task.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN : aucun mot de passe Windows stocké
  $task.Principal.RunLevel = 0 # TASK_RUNLEVEL_LUA : sans élévation
  $task.Settings.Enabled = $true
  $task.Settings.Hidden = $false # identifiables dans le Planificateur de tâches
  $task.Settings.AllowDemandStart = $true
  $task.Settings.StartWhenAvailable = $true
  $task.Settings.DisallowStartIfOnBatteries = $false
  $task.Settings.StopIfGoingOnBatteries = $false
  $task.Settings.MultipleInstances = 2 # ignorer si une vérification est déjà en cours
  $task.Settings.ExecutionTimeLimit = if ($Mode -eq 'watch') { 'PT0S' } else { 'PT15M' }
  $action = $task.Actions.Create(0) # TASK_ACTION_EXEC
  $action.Path = $wscript
  $action.Arguments = '//B //Nologo "' + $runner + '" ' + $Mode
  $action.WorkingDirectory = $agentPath
  $trigger = $task.Triggers.Create($TriggerType)
  $trigger.Enabled = $true
  $trigger.StartBoundary = ([datetime]::Today.AddHours($Hour)).ToString('yyyy-MM-ddTHH:mm:ss')
  if ($TriggerType -eq 9) { $trigger.UserId = $user }
  if ($TriggerType -eq 3) {
    $trigger.DaysOfWeek = $Days
    $trigger.WeeksInterval = 1
  } elseif ($TriggerType -eq 2) {
    $trigger.DaysInterval = 1
    $trigger.Repetition.Interval = 'PT5M'
    $trigger.Repetition.Duration = 'P1D'
    $trigger.Repetition.StopAtDurationEnd = $false
  }
  return $task
}

$plans = @(
  @{Name='Nethor Sync 2 - Lundi-Samedi';Mode='scheduled';Days=126;Hour=19;Type=3}
  @{Name='Nethor Sync 2 - Dimanche';Mode='scheduled';Days=1;Hour=12;Type=3}
  @{Name='Nethor Sync 2 - Controle Manuel';Mode='poll';Days=0;Hour=0;Type=2}
  @{Name='Nethor Sync 2 - Ecoute';Mode='watch';Days=0;Hour=0;Type=9}
)
foreach ($plan in $plans) {
  $task = New-TaskDefinition -Name $plan.Name -Mode $plan.Mode -Days $plan.Days -Hour $plan.Hour -TriggerType $plan.Type
  if ($ProbeOnly) {
    Write-Output ('VALIDE : ' + $plan.Name + ' (' + $plan.Mode + ', ' + $plan.Hour + ' h)')
    continue
  }
  if ($plan.Mode -eq 'watch') {
    # Arreter la précédente version de l'écoute avant de redéployer l'application.
    try {
      $oldTask = $folder.GetTask($plan.Name)
      foreach ($instance in @($oldTask.GetInstances(0))) { $instance.Stop() }
    } catch { }
  }
  # TASK_CREATE_OR_UPDATE=6, TASK_LOGON_INTERACTIVE_TOKEN=3.
  # On n'enregistre que les taches de l'utilisateur courant.
  $registered = $folder.RegisterTaskDefinition($plan.Name,$task,6,$user,$null,3,$null)
  if (-not $registered) { throw ('Le Planificateur a refusé la tâche : ' + $plan.Name) }
  Write-Output ('Créée : ' + $plan.Name)
  if ($plan.Mode -eq 'watch' -and -not $SkipStart) {
    # L'agent démarre dès l'installation ; le déclencheur de connexion
    # le relancera à chaque future ouverture de session Windows.
    $null = $registered.Run($null)
    Write-Output 'Agent d’écoute lancé en arrière-plan.'
  }
}
if ($ProbeOnly) { return }

# Nettoyage seulement APRES installation reussie des trois nouvelles taches.
# Supprimer une tache inexistante via schtasks.exe sous ErrorActionPreference=Stop
# interrompait auparavant l'installation (code 1).
foreach ($legacy in @('Nethor Sync 2 - Toutes les 3h','Nethor Sync 2 - Ouverture de session')) {
  try { $null = $folder.GetTask($legacy); $folder.DeleteTask($legacy,0) }
  catch {
    # Certaines éditions Windows emballent l'absence de tâche en
    # MethodInvocationException plutôt qu'en COMException.
    # Ce nettoyage facultatif ne doit JAMAIS annuler l'installation.
    Write-Output ('Ancienne tâche absente ou impossible à supprimer : ' + $legacy)
  }
}
Write-Output 'Planification NethorSync 2 activée pour l’utilisateur Windows courant.'
