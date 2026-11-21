param(
    [string]$TaskName = 'OrbitSignalsResearchServer',
    [int]$Port = 3443,
    [int]$CheckMinutes = 5
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This installer runs on Windows only.' }
if ($CheckMinutes -lt 2 -or $CheckMinutes -gt 60) { throw 'CheckMinutes must be between 2 and 60.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be in 1024..65535.' }

# This task launches the existing start-pc-backup.ps1. All long-term data and
# access secrets remain outside the repository, as that script already ensures.
$node = (Get-Command node.exe -ErrorAction Stop).Source
$version = & $node --version
$major = [int]($version.TrimStart('v').Split('.')[0])
if ($major -lt 24) { throw "Node.js 24+ required (detected $version)" }

$starter = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'start-pc-backup.ps1'))
$runner = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $starter)) { throw 'start-pc-backup.ps1 not found.' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$args = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -NodePath "{1}" -Port {2}' -f $starter,$node,$Port
$action = New-ScheduledTaskAction -Execute $runner -Argument $args -WorkingDirectory $PSScriptRoot
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $CheckMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$task = New-ScheduledTask -Action $action -Trigger @($logon,$repeat) `
    -Principal $principal -Settings $settings -Description 'Restarts the private Orbit Signals Node server when required; no trading keys.'
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "Task installed: $TaskName"
Write-Output "Server check every $CheckMinutes minutes while Windows is running and user is logged in."
Write-Output "HTTPS port: $Port"
Write-Output "Existing database and connection secrets are retained outside this repo."
Write-Output "Check it with: powershell -File .\check-pc-server.ps1 -Port $Port"
