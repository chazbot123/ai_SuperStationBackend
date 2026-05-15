param(
  [string]$Host = "8.166.114.238",
  [string]$User = "root",
  [string]$AppRoot = "/data/ai-superweb",
  [string]$Pm2Process = "ai-superweb-server",
  [int]$HealthPort = 3001,
  [string]$HealthPath = "/api/health",
  [switch]$SkipFrontendBuild,
  [switch]$SkipBackendBuild,
  [switch]$SkipHealthCheck,
  [switch]$PromptPassword,
  [string]$PasswordPlain
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverRoot = Join-Path $repoRoot "server"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ai-superweb-deploy-" + [Guid]::NewGuid().ToString("N"))
$serverTarPath = Join-Path $tempRoot "server-dist.tar"
$webTarPath = Join-Path $tempRoot "web-dist.tar"
$askPassTextPath = Join-Path $tempRoot "ssh-askpass.txt"
$askPassCmdPath = Join-Path $tempRoot "ssh-askpass.cmd"
$remoteScriptPath = Join-Path $tempRoot "deploy_ai_superweb.sh"
$remoteScriptTarget = "/tmp/deploy_ai_superweb.sh"
$remoteServerTar = "/tmp/server-dist.tar"
$remoteWebTar = "/tmp/web-dist.tar"

$script:askPassEnabled = $false
$script:envBackup = @{}

function Test-RequiredTool {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Required tool not found: $Name"
  }

  return $command.Source
}

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Enable-SshAskPass {
  param([string]$PlainPassword)

  [System.IO.File]::WriteAllText($askPassTextPath, $PlainPassword, [Text.UTF8Encoding]::new($false))
  $askPassScript = @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Raw '%~dp0ssh-askpass.txt'"
"@
  [System.IO.File]::WriteAllText($askPassCmdPath, $askPassScript, [Text.UTF8Encoding]::new($false))

  $script:envBackup = @{
    SSH_ASKPASS = $env:SSH_ASKPASS
    SSH_ASKPASS_REQUIRE = $env:SSH_ASKPASS_REQUIRE
    DISPLAY = $env:DISPLAY
  }

  $env:SSH_ASKPASS = $askPassCmdPath
  $env:SSH_ASKPASS_REQUIRE = "force"
  $env:DISPLAY = "trae-deploy"
  $script:askPassEnabled = $true
}

function Disable-SshAskPass {
  if (-not $script:askPassEnabled) {
    return
  }

  $env:SSH_ASKPASS = $script:envBackup["SSH_ASKPASS"]
  $env:SSH_ASKPASS_REQUIRE = $script:envBackup["SSH_ASKPASS_REQUIRE"]
  $env:DISPLAY = $script:envBackup["DISPLAY"]
  $script:askPassEnabled = $false
}

function Invoke-External {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory = $repoRoot
  )

  $oldLocation = Get-Location
  try {
    Set-Location $WorkingDirectory
    Write-Host ("> " + $FilePath + " " + ($Arguments -join " ")) -ForegroundColor DarkGray
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath exited with code $LASTEXITCODE"
    }
  } finally {
    Set-Location $oldLocation
  }
}

function Assert-PathExists {
  param([string]$PathValue)

  if (-not (Test-Path -LiteralPath $PathValue)) {
    throw "Path not found: $PathValue"
  }
}

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host ("== " + $Title + " ==") -ForegroundColor Cyan
}

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
  $sshExe = Test-RequiredTool "ssh"
  $scpExe = Test-RequiredTool "scp"
  $tarExe = Test-RequiredTool "tar"
  $npmExe = Test-RequiredTool "npm"

  Assert-PathExists $repoRoot
  Assert-PathExists $serverRoot

  if ($PromptPassword -and -not $PasswordPlain) {
    $securePassword = Read-Host "SSH Password" -AsSecureString
    $PasswordPlain = ConvertTo-PlainText $securePassword
  }

  if ($PasswordPlain) {
    Enable-SshAskPass -PlainPassword $PasswordPlain
  }

  Write-Section "Build Frontend"
  if ($SkipFrontendBuild) {
    Write-Host "Skip frontend build" -ForegroundColor Yellow
  } else {
    Invoke-External -FilePath $npmExe -Arguments @("run", "build") -WorkingDirectory $repoRoot
  }
  Assert-PathExists (Join-Path $repoRoot "dist")

  Write-Section "Build Backend"
  if ($SkipBackendBuild) {
    Write-Host "Skip backend build" -ForegroundColor Yellow
  } else {
    Invoke-External -FilePath $npmExe -Arguments @("run", "build") -WorkingDirectory $serverRoot
  }
  Assert-PathExists (Join-Path $serverRoot "dist")
  Assert-PathExists (Join-Path $serverRoot "chi_sim.traineddata")
  Assert-PathExists (Join-Path $serverRoot "eng.traineddata")

  Write-Section "Package Artifacts"
  Invoke-External -FilePath $tarExe -Arguments @("-cf", $serverTarPath, "-C", $serverRoot, "dist", "chi_sim.traineddata", "eng.traineddata")
  Invoke-External -FilePath $tarExe -Arguments @("-cf", $webTarPath, "-C", $repoRoot, "dist")

  $remoteScript = @"
#!/usr/bin/env bash
set -euo pipefail

BASE='$AppRoot'
PM2_PROCESS='$Pm2Process'
SERVER_TAR='$remoteServerTar'
WEB_TAR='$remoteWebTar'
TS=\$(date +%F_%H%M%S)

[ -f "\$SERVER_TAR" ] || { echo "missing \$SERVER_TAR" >&2; exit 1; }
[ -f "\$WEB_TAR" ] || { echo "missing \$WEB_TAR" >&2; exit 1; }

[ -d "\$BASE/server/dist" ] && mv "\$BASE/server/dist" "\$BASE/server/dist-backup-\$TS" || true
mkdir -p "\$BASE/server"
tar -xf "\$SERVER_TAR" -C "\$BASE/server"

[ -d "\$BASE/dist" ] && mv "\$BASE/dist" "\$BASE/dist-backup-\$TS" || true
mkdir -p "\$BASE"
tar -xf "\$WEB_TAR" -C "\$BASE"

pm2 restart "\$PM2_PROCESS"
pm2 save || true
"@

  if (-not $SkipHealthCheck) {
    $remoteScript += @"

sleep 3
curl -fsS "http://127.0.0.1:$HealthPort$HealthPath"
echo
"@
  }

  [System.IO.File]::WriteAllText($remoteScriptPath, $remoteScript, [Text.UTF8Encoding]::new($false))

  Write-Section "Upload Artifacts"
  Invoke-External -FilePath $scpExe -Arguments @(
    "-o", "StrictHostKeyChecking=accept-new",
    $serverTarPath,
    $webTarPath,
    $remoteScriptPath,
    "$User@$Host:/tmp/"
  )

  Write-Section "Apply On Server"
  Invoke-External -FilePath $sshExe -Arguments @(
    "-o", "StrictHostKeyChecking=accept-new",
    "$User@$Host",
    "bash $remoteScriptTarget"
  )

  Write-Section "Cleanup Remote Temp Files"
  Invoke-External -FilePath $sshExe -Arguments @(
    "-o", "StrictHostKeyChecking=accept-new",
    "$User@$Host",
    "rm -f $remoteServerTar $remoteWebTar $remoteScriptTarget"
  )

  Write-Host ""
  Write-Host "Deployment completed." -ForegroundColor Green
  if (-not $SkipHealthCheck) {
    Write-Host ("Health check: http://127.0.0.1:" + $HealthPort + $HealthPath) -ForegroundColor Green
  }
} finally {
  Disable-SshAskPass
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
