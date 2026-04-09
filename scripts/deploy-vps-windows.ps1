#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy via git pull no VPS + docker compose up -d --build --no-deps app.

.DESCRIPTION
  Credenciais em deploy.secrets.local (SSH_HOST, SSH_USER, SSH_PASSWORD, REMOTE_PATH).
  Opcional: SSH_HOSTKEY=SHA256:... quando o PuTTY recusa o IP (host key mudou / IP reutilizado).
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
    [switch] $RemoveOrphans,
    [string] $LetsEncryptDomain = ''
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
# Parâmetros passados na linha de comando ganham sobre deploy.secrets.local
if (-not $PSBoundParameters.ContainsKey('SshHost') -and $deploySecrets['SSH_HOST']) {
    $SshHost = $deploySecrets['SSH_HOST']
}
if (-not $PSBoundParameters.ContainsKey('SshUser') -and $deploySecrets['SSH_USER']) {
    $SshUser = $deploySecrets['SSH_USER']
}
if (-not $PSBoundParameters.ContainsKey('RemotePath') -and $deploySecrets['REMOTE_PATH']) {
    $RemotePath = $deploySecrets['REMOTE_PATH']
}
if (-not $PSBoundParameters.ContainsKey('LetsEncryptDomain') -and $deploySecrets['LE_SYNC_DOMAIN']) {
    $LetsEncryptDomain = $deploySecrets['LE_SYNC_DOMAIN']
}

$SshPassword = $deploySecrets['SSH_PASSWORD']
if (-not $SshPassword) { $SshPassword = $env:BLOCKMINER_VPS_PW }
if (-not $SshPassword) { throw "Defina SSH_PASSWORD em deploy.secrets.local ou `$env:BLOCKMINER_VPS_PW" }

if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink nao encontrado: $PlinkExe (instale PuTTY)." }

$plinkHostKeyArgs = @()
$sshHostKey = $deploySecrets['SSH_HOSTKEY']
if ($sshHostKey) {
    $sshHostKey = $sshHostKey.Trim()
    if ($sshHostKey) { $plinkHostKeyArgs = @('-hostkey', $sshHostKey) }
}

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
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" $remoteGitCmd

    # Depois sobe o .env.production real (sobrescreve qualquer template que possa ter voltado)
    if (Test-Path -LiteralPath $envBackupPath) {
        Write-Host "==> Uploading .env.production to VPS..."
        $pscpExe = Join-Path (Split-Path $PlinkExe) 'pscp.exe'
        & $pscpExe -batch @plinkHostKeyArgs -pw $SshPassword $envBackupPath "${SshUser}@${SshHost}:${RemotePath}/.env.production"
        if ($LASTEXITCODE -ne 0) { throw "pscp falhou ao enviar .env.production" }
    }

    # Após git reset, certificados PEM commitados no repo (dev) sobrescrevem os da VM —
    # se houver Let's Encrypt no servidor, volta a copiar para nginx/certs antes do nginx subir.
    if ($LetsEncryptDomain) {
        $le = $LetsEncryptDomain.Trim()
        Write-Host "==> Sync Let's Encrypt -> nginx/certs ($le)..."
        $syncCmd = @"
set -e
cd $RemotePath
mkdir -p nginx/certs
if [ -f "/etc/letsencrypt/live/$le/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/$le/privkey.pem" ]; then
  cp "/etc/letsencrypt/live/$le/fullchain.pem" nginx/certs/cert.pem
  cp "/etc/letsencrypt/live/$le/privkey.pem" nginx/certs/key.pem
  chmod 644 nginx/certs/cert.pem
  chmod 600 nginx/certs/key.pem
  echo "LE sync OK for $le"
else
  echo "WARNING: LE_SYNC_DOMAIN=$le but /etc/letsencrypt/live/$le missing — HTTPS pode falhar"
fi
"@
        & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" $syncCmd
    }

    # Por último faz o build e restart (serviço típico: app → 127.0.0.1:3000)
    $orph = if ($RemoveOrphans) { ' --remove-orphans' } else { '' }
    $remoteBuildCmd = "set -e`ncd $RemotePath`ndocker compose up -d --build --no-deps$orph $ComposeService`ndocker compose exec -T nginx nginx -s reload || true`ncurl -sS -o /dev/null -w 'health_http:%{http_code}\n' http://127.0.0.1:3000/health || true`n"
    Write-Host "==> docker compose build no VPS ($SshHost)..."
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" $remoteBuildCmd
    Write-Host '==> Feito.'
}
finally {
    Remove-Item -LiteralPath $tmpPw -Force -ErrorAction SilentlyContinue
}