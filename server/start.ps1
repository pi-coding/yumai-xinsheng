# YuMai full-stack launcher.
# NOTE: keep this file pure ASCII -- Windows PowerShell 5.1 reads BOM-less .ps1 as GBK.
# Usage:
#   -File start.ps1           start service
#   -File start.ps1 -Stop     stop service
#   -File start.ps1 -Build    build jar then start

param(
    [switch]$Stop,
    [switch]$Build,
    [switch]$NoBrowser,
    [int]$Port = 8081
)

# native tools (java -version / mvn) write to stderr; Stop would abort on that
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'backend'
$jar = Join-Path $backend 'target\yumai-platform.jar'
$log = Join-Path $root 'runtime.log'
$pidFile = Join-Path $root 'runtime.pid'
$redisDir = 'D:\develop\redis'
$mvn = 'D:\develop\apache-maven-3.9.16-bin\apache-maven-3.9.16\bin\mvn.cmd'
$javaHomes = @('D:\develop\jdk11\jdk-11.0.32.1+1', 'D:\develop\jdk11', $env:JAVA_HOME)

function Write-Step($msg) { Write-Host "[yumai] $msg" -ForegroundColor Cyan }
function Write-Warn2($msg) { Write-Host "[warn ] $msg" -ForegroundColor Yellow }
function Write-Err2($msg) { Write-Host "[error] $msg" -ForegroundColor Red }

function Get-JavaHome {
    foreach ($h in $javaHomes) {
        if ($h -and (Test-Path (Join-Path $h 'bin\java.exe'))) { return $h }
    }
    return $null
}

function Test-Port([int]$p) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $ok = $c.ConnectAsync('127.0.0.1', $p).Wait(800)
        $c.Close()
        return $ok
    } catch {
        return $false
    }
}

function Get-PortPid([int]$p) {
    $line = (netstat -ano | Select-String ":$p\s" | Select-String 'LISTENING' | Select-Object -First 1)
    if (-not $line) { return $null }
    $parts = ($line.ToString() -split '\s+') | Where-Object { $_ -ne '' }
    return [int]$parts[-1]
}

if ($Stop) {
    $procId = Get-PortPid $Port
    if ($procId) {
        Stop-Process -Id $procId -Force
        Write-Step "stopped process $procId on port $Port"
    } else {
        Write-Step "nothing listening on port $Port"
    }
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
    exit 0
}

# ---------- 1. JDK ----------
$javaHome = Get-JavaHome
if (-not $javaHome) {
    Write-Err2 'JDK 11 not found. Set JAVA_HOME or install to D:\develop\jdk11'
    exit 1
}
$java = Join-Path $javaHome 'bin\java.exe'
$ver = (& $java -version 2>&1 | Select-Object -First 1)
Write-Step "java: $ver"

# ---------- 2. build ----------
if ($Build -or -not (Test-Path $jar)) {
    if (-not (Test-Path $mvn)) {
        Write-Err2 "maven not found: $mvn"
        exit 1
    }
    Write-Step 'building jar (mvn package)...'
    $env:JAVA_HOME = $javaHome
    Push-Location $backend
    & $mvn -B -DskipTests package
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Write-Err2 'build failed'; exit 1 }
    Write-Step 'build ok'
}

# ---------- 3. MySQL ----------
if (-not (Test-Port 3306)) {
    Write-Err2 'MySQL 3306 is not reachable. Start MySQL service first.'
    exit 1
}
Write-Step 'mysql: 3306 ok'

# ---------- 4. Redis ----------
if (-not (Test-Port 6379)) {
    $redisExe = Join-Path $redisDir 'redis-server.exe'
    if (Test-Path $redisExe) {
        Write-Warn2 'redis not running, starting it ...'
        Start-Process -FilePath $redisExe -ArgumentList '--port','6379' -WindowStyle Hidden
        Start-Sleep -Seconds 2
    } else {
        Write-Err2 'Redis 6379 unreachable and redis-server.exe not found.'
        exit 1
    }
}
if (-not (Test-Port 6379)) { Write-Err2 'redis still not reachable'; exit 1 }
Write-Step 'redis: 6379 ok'

# ---------- 5. run ----------
$oldPid = Get-PortPid $Port
if ($oldPid) {
    Write-Warn2 "port $Port already in use by pid $oldPid, stopping it first"
    Stop-Process -Id $oldPid -Force
    Start-Sleep -Seconds 1
}

Write-Step "starting service on port $Port ..."
# Launch via .NET Process directly: Start-Process in this machine fails while building its env
# dictionary because both HTTPS_PROXY and https_proxy exist (case-only duplicate). Spring Boot
# writes its own log file via logging.file.name, so no console redirection is needed.
$logFile = Join-Path $root 'runtime.log'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $java
$psi.Arguments = '-Dfile.encoding=UTF-8 -jar "' + $jar + '" --server.port=' + $Port + ' --logging.file.name="' + $logFile + '"'
$psi.WorkingDirectory = $backend
$psi.UseShellExecute = $true
$psi.WindowStyle = 'Hidden'
$proc = [System.Diagnostics.Process]::Start($psi)
Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 800
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
        if ($r.code -eq 0) { $ok = $true; break }
    } catch { }
}
if (-not $ok) {
    Write-Err2 "service did not become healthy. See $logFile"
    exit 1
}

Write-Step "service is UP (pid $($proc.Id))"
Write-Step "web: http://localhost:$Port"
Write-Step "api: http://localhost:$Port/api/health"
Write-Step "demo: demo / demo123   admin: admin / admin123"
if (-not $NoBrowser) { Start-Process "http://localhost:$Port" }
