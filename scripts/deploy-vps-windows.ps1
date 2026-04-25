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
    [string] $SshHost    = '89.167.119.164',
    [string] $SshUser    = 'root',
    [string] $RemotePath = '/root/block-miner',
    [string] $PlinkExe   = 'C:\Program Files\PuTTY\plink.exe',
    [string] $ComposeService = 'app',
    [switch] $RemoveOrphans,
    [string] $LetsEncryptDomain = '',
    [switch] $NoDockerCache
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# PuTTY passes the remote command string literally; Windows CRLF breaks bash (set -e\r, cd ...\r).
function ConvertTo-UnixLf([string]$Text) {
    if ($null -eq $Text) { return '' }
    return ($Text -replace "`r`n", "`n" -replace "`r", "`n")
}

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
# One-shot Prisma recovery (e.g. P3018): set in shell before deploy, no secrets file edit.
if (-not [string]::IsNullOrWhiteSpace($env:DEPLOY_PRISMA_MIGRATE_RESOLVE_ROLLED_BACK)) {
    $deploySecrets['DEPLOY_PRISMA_MIGRATE_RESOLVE_ROLLED_BACK'] = $env:DEPLOY_PRISMA_MIGRATE_RESOLVE_ROLLED_BACK.Trim()
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

$SshHost = ($SshHost -replace "`r", '').Trim()
$SshUser = ($SshUser -replace "`r", '').Trim()
$RemotePath = ($RemotePath -replace "`r", '').Trim()

# Branch on the remote for git reset (default: main). deploy.secrets.local may set DEPLOY_GIT_BRANCH;
# process env DEPLOY_GIT_BRANCH wins (one-shot: production on main even if secrets still say develop).
$DeployGitBranch = 'main'
if ($deploySecrets['DEPLOY_GIT_BRANCH'] -and $deploySecrets['DEPLOY_GIT_BRANCH'].Trim()) {
    $DeployGitBranch = ($deploySecrets['DEPLOY_GIT_BRANCH'] -replace "`r", '').Trim()
}
$envDeployBranch = [Environment]::GetEnvironmentVariable('DEPLOY_GIT_BRANCH', 'Process')
if ($envDeployBranch -and $envDeployBranch.Trim()) {
    $DeployGitBranch = $envDeployBranch.Trim()
}
if (-not $PSBoundParameters.ContainsKey('LetsEncryptDomain') -and $deploySecrets['LE_SYNC_DOMAIN']) {
    $LetsEncryptDomain = $deploySecrets['LE_SYNC_DOMAIN']
}

# Env (ex.: python deploy.py) ganha sobre ficheiro — deploy.py e a fonte quando usas npm run deploy
$SshPassword = $env:BLOCKMINER_VPS_PW
if (-not $SshPassword) { $SshPassword = $deploySecrets['SSH_PASSWORD'] }
if (-not $SshPassword) { throw "Defina credenciais em deploy.py (docstring) ou SSH_PASSWORD em deploy.secrets.local ou `$env:BLOCKMINER_VPS_PW" }

if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink nao encontrado: $PlinkExe (instale PuTTY)." }

# Build map of VITE_* overrides: deploy.secrets.local wins over process env; then merged into .env text before upload.
function Get-ViteEnvOverrideMap {
    param([hashtable]$Secrets)
    $map = @{}
    $names = @(
        'APP_HOST_PORT',
        'DB_PUBLISH_PORT',
        'NGINX_PUBLISH_HTTP',
        'NGINX_PUBLISH_HTTPS',
        # API CORS allowlist (production). Required when the SPA origin differs from vm-backup defaults (e.g. test.blockminer.space).
        'CORS_ORIGINS',
        # Server-side AES key for encrypting RTMP stream keys at rest (64 hex chars). Merge into uploaded .env.production.
        'STREAM_ENCRYPTION_KEY',
        'STREAM_CAPTURE_DISABLED',
        # Admin panel (/api/admin/auth/login) — merged from deploy.secrets.local over vm-backup
        'ADMIN_EMAIL',
        'ADMIN_SECURITY_CODE',
        'ADMIN_JWT_EXPIRES_IN',
        'ADMIN_SESSION_COOKIE_SECURE',
        # Same secret signs user JWTs and admin session cookies; allow override from secrets without editing vm-backup.
        'JWT_SECRET',
        'VITE_WALLETCONNECT_PROJECT_ID',
        'VITE_PUBLIC_WALLET_APP_URL',
        'VITE_POLYGON_RPC_URL',
        'VITE_DISCORD_URL',
        'VITE_TELEGRAM_URL',
        'VITE_TWITTER_URL',
        'VITE_YOUTUBE_URL',
        'VITE_GA_ID',
        # BTCPay (Bitcoin deposits) — merged into VPS .env.production from deploy.secrets.local (never commit secrets).
        'BTCPAY_URL',
        'BTCPAY_API_KEY',
        'BTCPAY_STORE_ID',
        'BTCPAY_WEBHOOK_SECRET',
        'BTCPAY_INVOICE_PAYMENT_METHODS',
        'BTCPAY_COMING_SOON'
    )
    foreach ($k in $names) {
        $fromFile = $Secrets[$k]
        if ($fromFile -and $fromFile.Trim()) {
            $map[$k] = $fromFile.Trim()
            continue
        }
        $fromProc = [Environment]::GetEnvironmentVariable($k, 'Process')
        if ($fromProc -and $fromProc.Trim()) { $map[$k] = $fromProc.Trim() }
    }
    foreach ($key in $Secrets.Keys) {
        if ($key -match '^VITE_' -and $Secrets[$key] -and $Secrets[$key].Trim()) {
            $map[$key] = $Secrets[$key].Trim()
        }
    }
    return $map
}

function Apply-ViteOverridesToEnvText {
    param(
        [string]$Content,
        [hashtable]$ViteMap
    )
    $out = if ($null -eq $Content) { '' } else { $Content }
    foreach ($k in $ViteMap.Keys) {
        $v = $ViteMap[$k]
        if (-not $v) { continue }
        $esc = [regex]::Escape($k)
        $pattern = "(?m)^[ \t]*${esc}[ \t]*=[ \t]*.*\r?$"
        $line = "${k}=$v"
        if ($out -match $pattern) {
            $out = $out -replace $pattern, $line
        } else {
            if ($out.Length -gt 0 -and -not $out.EndsWith("`n")) { $out += "`n" }
            $out += "$line`n"
        }
    }
    return $out
}

function Test-MergedEnvHasWalletConnectId {
    param([string]$Text)
    if (-not $Text) { return $false }
    foreach ($raw in $Text -split "`r?`n") {
        $line = $raw.Trim()
        if ($line -match '^\s*#' -or -not $line) { continue }
        if ($line -match '^\s*VITE_WALLETCONNECT_PROJECT_ID\s*=\s*(.*)$') {
            $val = $matches[1].Trim().Trim('"').Trim("'")
            if ($val.Length -lt 8) { return $false }
            if ($val -match '^(your_|changeme|placeholder|example)') { return $false }
            return $true
        }
    }
    return $false
}

# Host port published for the app container (must match docker-compose.yml APP_HOST_PORT in .env.production).
function Get-AppHostPortForHealthCheck {
    param([string]$EnvText, [hashtable]$Secrets)
    foreach ($raw in ($EnvText -split "`r?`n")) {
        $line = $raw.Trim()
        if ($line -match '^\s*#' -or -not $line) { continue }
        if ($line -match '^\s*APP_HOST_PORT\s*=\s*(.+)$') {
            $v = $matches[1].Trim().Trim('"').Trim("'")
            if ($v -match '^\d+$') { return $v }
        }
    }
    if ($Secrets['APP_HOST_PORT'] -and $Secrets['APP_HOST_PORT'].Trim()) {
        $v2 = $Secrets['APP_HOST_PORT'].Trim()
        if ($v2 -match '^\d+$') { return $v2 }
    }
    return '3000'
}

$plinkHostKeyArgs = @()
$sshHostKey = $deploySecrets['SSH_HOSTKEY']
if ($sshHostKey) {
    $sshHostKey = $sshHostKey.Trim()
    if ($sshHostKey) { $plinkHostKeyArgs = @('-hostkey', $sshHostKey) }
}

# Grava senha em temp file (sem CRLF)
$tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
[System.IO.File]::WriteAllText($tmpPw, $SshPassword.Trim(), [System.Text.UTF8Encoding]::new($false))
$tmpMergedEnv = $null

try {
    # --- Upload do .env.production real para o VPS (deve ser APÓS git reset para não ser apagado) ---
    $envBackupPath = Join-Path $RepoRoot '.env.production.vm-backup'
    if (-not (Test-Path -LiteralPath $envBackupPath)) {
        Write-Warning ".env.production.vm-backup nao encontrado - deploy pode falhar sem env"
    }

    # Primeiro faz git reset no VPS
    $remoteGitCmd = ConvertTo-UnixLf "set -e`ncd $RemotePath`ngit fetch origin`ngit reset --hard origin/$DeployGitBranch`n"
    Write-Host "==> git reset no VPS ($SshHost) branch=$DeployGitBranch ..."
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" $remoteGitCmd

    $skipEnvUpload = $deploySecrets['DEPLOY_SKIP_ENV_UPLOAD'] -eq '1' -or $deploySecrets['DEPLOY_SKIP_ENV_UPLOAD'] -eq 'true'
    # Snapshot of .env text used to resolve APP_HOST_PORT for post-deploy health (must match compose bind on the VM).
    $mergedEnvSnapshot = ''
    if (-not $skipEnvUpload) {
        $viteMap = Get-ViteEnvOverrideMap -Secrets $deploySecrets
        $baseEnvText = ''
        if (Test-Path -LiteralPath $envBackupPath) {
            $baseEnvText = [System.IO.File]::ReadAllText($envBackupPath, [System.Text.UTF8Encoding]::new($false))
        } else {
            Write-Warning ".env.production.vm-backup ausente — a gerar .env só com overrides VITE_* (coloca backup completo na raiz do repo)."
            $baseEnvText = "# Generated by deploy — merge with full production secrets`nNODE_ENV=production`nPORT=3000`n"
        }
        $mergedEnvText = Apply-ViteOverridesToEnvText -Content $baseEnvText -ViteMap $viteMap
        $mergedEnvSnapshot = $mergedEnvText
        $requireWc = $deploySecrets['DEPLOY_REQUIRE_WALLETCONNECT'] -eq '1' -or $deploySecrets['DEPLOY_REQUIRE_WALLETCONNECT'] -eq 'true'
        $hasWc = Test-MergedEnvHasWalletConnectId -Text $mergedEnvText
        if (-not $hasWc) {
            $msg = 'VITE_WALLETCONNECT_PROJECT_ID em falta ou invalido no env enviado. Adiciona em deploy.secrets.local ou .env.production.vm-backup (WalletConnect Cloud / Reown).'
            if ($requireWc) { throw $msg }
            Write-Warning $msg
        } else {
            Write-Host "==> VITE_WALLETCONNECT_PROJECT_ID presente no .env merged (WalletConnect OK no build/runtime)."
        }
        $tmpMergedEnv = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_merged_env_{0}.env" -f [Guid]::NewGuid().ToString('N'))
        [System.IO.File]::WriteAllText($tmpMergedEnv, $mergedEnvText, [System.Text.UTF8Encoding]::new($false))
        Write-Host "==> Uploading merged .env.production to VPS (VITE_* from deploy.secrets.local + vm-backup)..."
        $pscpExe = Join-Path (Split-Path $PlinkExe) 'pscp.exe'
        # Use -pwfile like plink: -pw can fail with special characters or quoting differences.
        & $pscpExe -batch @plinkHostKeyArgs -pwfile $tmpPw $tmpMergedEnv "${SshUser}@${SshHost}:${RemotePath}/.env.production"
        if ($LASTEXITCODE -ne 0) { throw "pscp falhou ao enviar .env.production" }
    } else {
        Write-Host "==> Skip .env.production upload (DEPLOY_SKIP_ENV_UPLOAD)."
        if (Test-Path -LiteralPath $envBackupPath) {
            $mergedEnvSnapshot = [System.IO.File]::ReadAllText($envBackupPath, [System.Text.UTF8Encoding]::new($false))
        }
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
        & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $syncCmd)
    }

    # Host port for curl health checks (must match APP_HOST_PORT in the .env.production used by compose on the VM).
    $healthPort = Get-AppHostPortForHealthCheck -EnvText $mergedEnvSnapshot -Secrets $deploySecrets
    Write-Host "==> Post-deploy health will use host port $healthPort (APP_HOST_PORT from merged env / secrets)."
    $orph = if ($RemoveOrphans) { ' --remove-orphans' } else { '' }
    # --env-file .env.production: injects VITE_* into compose build args so WalletConnect project id ships in the SPA bundle.
    $composeEnv = "docker compose --env-file .env.production"
    $buildStep = if ($NoDockerCache) {
        "$composeEnv build --no-cache $ComposeService && $composeEnv up -d --no-deps$orph $ComposeService"
    } else {
        "$composeEnv up -d --build --no-deps$orph $ComposeService"
    }
    # Sobe DB + reverse proxy: antes só o app era reiniciado (--no-deps) e o nginx ficava parado.
    $bashCleanupV3 = @'
docker ps -aq -f name=block-miner-v3 | while read -r id; do
  [ -z "$id" ] || docker rm -f "$id"
done
'@
    $remoteBuildCmd = @"
set -e
cd $RemotePath
$bashCleanupV3
# Clear stuck app/nginx containers from partial recreates (name conflicts on shared VMs)
$composeEnv stop app nginx 2>/dev/null || true
$composeEnv rm -f app nginx 2>/dev/null || true
# Compose sometimes leaves a named container behind; force by stable project names (docker-compose.yml: name: block-miner)
docker rm -f block-miner-app-1 block-miner-nginx-1 2>/dev/null || true
docker ps -aq --filter name=block-miner-app | while read -r id; do [ -z "`$id" ] || docker rm -f "`$id"; done
docker ps -aq --filter name=block-miner-nginx | while read -r id; do [ -z "`$id" ] || docker rm -f "`$id"; done
$composeEnv up -d db
$buildStep
$composeEnv up -d nginx
$composeEnv ps
$composeEnv exec -T nginx nginx -s reload 2>/dev/null || true
"@
    Write-Host "==> docker compose build no VPS ($SshHost)..."
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $remoteBuildCmd)
    if ($LASTEXITCODE -ne 0) { throw "Remote docker compose step failed (plink exit $LASTEXITCODE)." }

    # Run migrations while the app container is up but BEFORE expecting /health 200 (new schema may be required).
    $runMigrate = $deploySecrets['DEPLOY_PRISMA_MIGRATE_DEPLOY']
    if ($runMigrate -eq '1' -or ($runMigrate -and $runMigrate.ToLower() -eq 'true')) {
        $resolveRbRaw = $deploySecrets['DEPLOY_PRISMA_MIGRATE_RESOLVE_ROLLED_BACK']
        $resolveRb = if ($resolveRbRaw) { $resolveRbRaw.Trim() } else { '' }
        if ($resolveRb) {
            Write-Host "==> prisma migrate resolve --rolled-back $resolveRb ..."
            $resolveRemote = @"
set -e
cd $RemotePath
docker compose --env-file .env.production exec -T $ComposeService npx prisma migrate resolve --rolled-back $resolveRb --schema=server/prisma/schema.prisma
"@
            & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $resolveRemote)
            if ($LASTEXITCODE -ne 0) { throw "prisma migrate resolve failed (plink exit $LASTEXITCODE)." }
        }
        Write-Host "==> prisma migrate deploy in container ($ComposeService)..."
        $migrateRemote = @"
set -e
cd $RemotePath
docker compose --env-file .env.production exec -T $ComposeService npx prisma migrate deploy --schema=server/prisma/schema.prisma
"@
        & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $migrateRemote)
        if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed (plink exit $LASTEXITCODE)." }
    }

    # Node cold start (Prisma generate, DB wait, Express bind) often exceeds 2s; retry against the published host port.
    # Use a single-quoted here-string so $(...) is NOT evaluated by PowerShell (must run on the Linux VM as bash).
    $healthRemote = @'
set -e
cd "__REMOTE_PATH__"
ok=0
i=0
while [ $i -lt 45 ]; do
  i=$((i+1))
  code=$(curl -sS --connect-timeout 3 --max-time 12 -o /dev/null -w "%{http_code}" "http://127.0.0.1:__HEALTH_PORT__/health" 2>/dev/null || echo 000)
  echo "health_try:$i http:$code"
  if [ "$code" = "200" ]; then ok=1; break; fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  echo "DEPLOY_WARNING: /health did not return 200 within ~90s on port __HEALTH_PORT__; app may still be starting or misconfigured."
  docker compose --env-file .env.production logs --tail=80 __COMPOSE_SERVICE__ || true
  exit 0
fi
echo "health_ok:200"
exit 0
'@
    $healthRemote = $healthRemote.Replace('__REMOTE_PATH__', $RemotePath).Replace('__HEALTH_PORT__', $healthPort).Replace('__COMPOSE_SERVICE__', $ComposeService)
    Write-Host "==> Waiting for application health on 127.0.0.1:${healthPort}/health ..."
    # One-line over SSH: multiline + quotes are mangled by plink/Windows argv; pipe base64 into bash.
    $healthUnix = ConvertTo-UnixLf $healthRemote
    $healthB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($healthUnix))
    $remoteHealthCmd = "printf '%s' '$healthB64' | base64 -d | bash"
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" $remoteHealthCmd
    if ($LASTEXITCODE -ne 0) { throw "Health check SSH step failed (plink exit $LASTEXITCODE)." }

    Write-Host '==> Feito.'
}
finally {
    Remove-Item -LiteralPath $tmpPw -Force -ErrorAction SilentlyContinue
    if ($tmpMergedEnv -and (Test-Path -LiteralPath $tmpMergedEnv)) {
        Remove-Item -LiteralPath $tmpMergedEnv -Force -ErrorAction SilentlyContinue
    }
}
