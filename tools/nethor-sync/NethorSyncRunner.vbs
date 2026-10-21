' Agent NethorSync 2: tache Windows avec lancement sans console visible.
Option Explicit
Dim shell, fso, base, powershell, flag, command, code
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
flag = ""
If WScript.Arguments.Count > 0 Then
  Select Case LCase(WScript.Arguments(0))
    Case "scheduled": flag = "-Scheduled"
    Case "poll": flag = "-PollOnly"
    Case "update": scriptName = "Update-NethorSync.ps1"
    Case Else: WScript.Quit 2
  End Select
End If
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
command = Chr(34) & powershell & Chr(34) & " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " & Chr(34) & base & "\NethorSync.ps1" & Chr(34) & " " & flag
code = shell.Run(command, 0, True)
WScript.Quit code
