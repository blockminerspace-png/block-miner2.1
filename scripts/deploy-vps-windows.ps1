#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy via git pull no VPS + docker compose up -d --build --no-deps app.

.DESCRIPTION
  Credenciais em deploy.secrets.local (SSH_HOST, SSH_USER, SSH_PASSWORD, REMOTE_PATH).
  Requer PuTTY (plink.exe) em "C:\Program Files\PuTTY\".

.EXAMPLE
  .\scripts\deploy-vps-windows.ps1
#>
param(
    [string] $SshHost    = '37.27.38.21',
    [string] $SshUser    = 'root',
    [string] $RemotePath = '/root/block-miner',
    [string] $PlinkExe   = 'C:\Program Files\PuTTY\plink.exe',
    [string] $ComposeService = 'app',
    [switch] $RemoveOrphans
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# --- Le credenciais de deploy.secrets.local ---
$deploySecretsPath = Join-Path $RepoRoot 'deploy.secrets.local'
$deploySecrets = @{}
if (Test-Path -LiteralPath $deploySecretsPath) {
    Get-Content -LiteralPath $deploySecretsPath -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $ix = $line.IndexOf('=')
        if ($ix -lt 1) { return }
        $k = $line.Substring(0, $ix).Trim()
        $v = $line.Substring($ix + 1).Trim()
        if ($k) { $deploySecrets[$k] = $v }
    }
}
if ($deploySecrets['SSH_HOST'])    { $SshHost    = $deploySecrets['SSH_HOST'] }
if ($deploySecrets['SSH_USER'])    { $SshUser    = $deploySecrets['SSH_USER'] }
if ($deploySecrets['REMOTE_PATH']) { $RemotePath = $deploySecrets['REMOTE_PATH'] }

$SshPassword = $deploySecrets['SSH_PASSWORD']
if (-not $SshPassword) { $SshPassword = $env:BLOCKMINER_VPS_PW }
if (-not $SshPassword) { throw "Defina SSH_PASSWORD em deploy.secrets.local ou `$env:BLOCKMINER_VPS_PW" }

if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink nao encontrado: $PlinkExe (instale PuTTY)." }

# Grava senha em temp file (sem CRLF)
$tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
[System.IO.File]::WriteAllText($tmpPw, $SshPassword.Trim(), [System.Text.UTF8Encoding]::new($false))

try {
    # --- Upload do .env.production real para o VPS (deve ser APÓS git reset para não ser apagado) ---
    $envBackupPath = Join-Path $RepoRoot '.env.production.vm-backup'
    if (-not (Test-Path -LiteralPath $envBackupPath)) {
        Write-Warning ".env.production.vm-backup nao encontrado - deploy pode falhar sem env"
    }

    # Primeiro faz git reset no VPS
    $remoteGitCmd = "set -e`ncd $RemotePath`ngit fetch origin`ngit reset --hard origin/main`n"
    Write-Host "==> git reset no VPS ($SshHost)..."
    & $PlinkExe -batch -ssh -pwfile $tmpPw "${SshUser}@${SshHost}" $remoteGitCmd

    # Depois sobe o .env.production real (sobrescreve qualquer template que possa ter voltado)
    if (Test-Path -LiteralPath $envBackupPath) {
        Write-Host "==> Uploading .env.production to VPS..."
        $pscpExe = Join-Path (Split-Path $PlinkExe) 'pscp.exe'
        & $pscpExe -batch -pw $SshPassword $envBackupPath "${SshUser}@${SshHost}:${RemotePath}/.env.production"
        if ($LASTEXITCODE -ne 0) { throw "pscp falhou ao enviar .env.production" }
    }

    # Por último faz o build e restart (serviço típico: app → 127.0.0.1:3000)
    $orph = if ($RemoveOrphans) { ' --remove-orphans' } else { '' }
    $remoteBuildCmd = "set -e`ncd $RemotePath`ndocker compose up -d --build --no-deps$orph $ComposeService`ndocker compose exec -T nginx nginx -s reload || true`ncurl -sS -o /dev/null -w 'health_http:%{http_code}\n' http://127.0.0.1:3000/health || true`n"
    Write-Host "==> docker compose build no VPS ($SshHost)..."
    & $PlinkExe -batch -ssh -pwfile $tmpPw "${SshUser}@${SshHost}" $remoteBuildCmd
    Write-Host '==> Feito.'
}
finally {
    Remove-Item -LiteralPath $tmpPw -Force -ErrorAction SilentlyContinue
}