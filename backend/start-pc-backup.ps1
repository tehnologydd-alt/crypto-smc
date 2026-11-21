param(
    [string]$StorageDirectory = (Join-Path $PSScriptRoot '..\..\orbit-pc-backup'),
    [string]$NodePath = 'node',
    [string]$ListenAddress = '0.0.0.0',
    [int]$Port = 3443
)

$ErrorActionPreference = 'Stop'
$StorageDirectory = [System.IO.Path]::GetFullPath($StorageDirectory)
New-Item -ItemType Directory -Path $StorageDirectory -Force | Out-Null
$secretPath = Join-Path $StorageDirectory 'connection.json'
$pfxPath = Join-Path $StorageDirectory 'orbit-lan.pfx'
$pidPath = Join-Path $StorageDirectory 'server.pid'
$logPath = Join-Path $StorageDirectory 'server.log'
$errorPath = Join-Path $StorageDirectory 'server-error.log'

if (Test-Path -LiteralPath $secretPath) {
    $settings = Get-Content -LiteralPath $secretPath -Raw | ConvertFrom-Json
} else {
    $randomToken = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    $pfxPassword = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
    $rsa = [System.Security.Cryptography.RSA]::Create(2048)
    try {
        $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
            'CN=Orbit Signals LAN', $rsa, 'SHA256', [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
        $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
        $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
            [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true))
        $serverAuth = [System.Security.Cryptography.OidCollection]::new()
        [void]$serverAuth.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
        $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($serverAuth, $false))
        $san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
        $san.AddDnsName('localhost')
        $san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
        $request.CertificateExtensions.Add($san.Build())
        $cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1), [DateTimeOffset]::UtcNow.AddYears(2))
        try {
            [System.IO.File]::WriteAllBytes($pfxPath, $cert.Export(
                [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $pfxPassword))
            $pin = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($cert.RawData))
        } finally { $cert.Dispose() }
    } finally { $rsa.Dispose() }
    $settings = [pscustomobject]@{ token = $randomToken; pfxPassword = $pfxPassword; certificateSha256 = $pin }
    [System.IO.File]::WriteAllText($secretPath, ($settings | ConvertTo-Json -Compress))
}

if (-not (Test-Path -LiteralPath $pfxPath)) { throw 'Сертификат отсутствует. Восстановите orbit-lan.pfx из резервной копии.' }
if (Test-Path -LiteralPath $pidPath) {
    $oldPid = 0
    try { $oldPid = [int](Get-Content -LiteralPath $pidPath -Raw) } catch {}
    if ($oldPid -gt 0) {
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
        if ($existing -and $existing.Name -ieq 'node.exe' -and
            $existing.CommandLine -match 'server\\.js') {
            Write-Output "Orbit backup already running (PID $oldPid)."
            return
        }
    }
}

$env:HOST = $ListenAddress
$env:PORT = [string]$Port
$env:DATA_DIR = Join-Path $StorageDirectory 'data'
$env:APP_TOKEN = $settings.token
$env:TLS_PFX_PATH = $pfxPath
$env:TLS_PFX_PASSWORD = $settings.pfxPassword
$env:LAN_ONLY = '1'
$process = Start-Process -FilePath $NodePath -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath
[System.IO.File]::WriteAllText($pidPath, [string]$process.Id)
Start-Sleep -Seconds 2
if ($process.HasExited) { throw "Orbit backup exited early; see $errorPath" }
Write-Output "Orbit backup running on port $Port (PID $($process.Id))."
Write-Output "Connection details and secret are stored at $secretPath. Do not commit this directory."

