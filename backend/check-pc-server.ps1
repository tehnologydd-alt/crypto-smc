param(
    [int]$Port = 3443,
    [string]$StorageDirectory = (Join-Path $PSScriptRoot '..\..\orbit-pc-backup')
)
$ErrorActionPreference = 'Stop'
$StorageDirectory = [IO.Path]::GetFullPath($StorageDirectory)
$pidPath = Join-Path $StorageDirectory 'server.pid'
$logPath = Join-Path $StorageDirectory 'server-error.log'
$connectionPath = Join-Path $StorageDirectory 'connection.json'
$pid = $null
if(Test-Path $pidPath) {
    try { $pid=[int](Get-Content $pidPath -Raw) } catch {}
}
$processAlive = $false
if ($pid) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue
    $processAlive = [bool]($proc -and $proc.Name -ieq 'node.exe' -and $proc.CommandLine -match 'server\.js')
}
$socket = New-Object System.Net.Sockets.TcpClient
$portOpen = $false
try {
    $async = $socket.BeginConnect('127.0.0.1',$Port,$null,$null)
    if ($async.AsyncWaitHandle.WaitOne(1500)) {
        $socket.EndConnect($async)
        $portOpen = $socket.Connected
    }
} catch { $portOpen = $false } finally { $socket.Close() }
Write-Output "Node Orbit process: $(if($processAlive){'RUNNING'}else{'NOT FOUND'})"
Write-Output "HTTPS port $Port on localhost: $(if($portOpen){'LISTENING'}else{'NOT LISTENING'})"
Write-Output "Connection configuration: $(if(Test-Path $connectionPath){'EXISTS (not displayed)'}else{'MISSING'})"
if (-not $processAlive -or -not $portOpen) {
    Write-Output "Log: $logPath"
    exit 1
}
Write-Output "Local transport check OK. Binance connectivity and live depth still require an API/UI check."
