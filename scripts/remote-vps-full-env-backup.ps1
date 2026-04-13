#Requires -Version 5.1
<#
.SYNOPSIS
  Download production env files from the BlockMiner VPS into repo backups/ (gitignored).

.DESCRIPTION
  Pulls via PSCP:
    - REMOTE_PATH/.env.production
    - REMOTE_PATH/docker/btcpay/env (if present)
  Output: backups/vps-env-dump-<UTC timestamp>/
  Also copies deploy.secrets.local from this machine into the same folder (if present) — keep that USB-safe.

  Requires PuTTY pscp.exe / plink path (same folder as deploy).
#>
param(
    [string] $PlinkExe = 'C:\Program Files\PuTTY\plink.exe'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
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

$SshHost = ($deploySecrets['SSH_HOST']).Trim()
$SshUser = ($deploySecrets['SSH_USER']).Trim()
$RemotePath = ($deploySecrets['REMOTE_PATH']).Trim()
if (-not $SshHost -or -not $SshUser -or -not $RemotePath) {
    throw "deploy.secrets.local must define SSH_HOST, SSH_USER, REMOTE_PATH"
}

$SshPassword = $env:BLOCKMINER_VPS_PW
if (-not $SshPassword) { $SshPassword = $deploySecrets['SSH_PASSWORD'] }
if (-not $SshPassword) { throw "Set SSH_PASSWORD in deploy.secrets.local or BLOCKMINER_VPS_PW" }

if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink not found: $PlinkExe" }
$pscpExe = Join-Path (Split-Path $PlinkExe) 'pscp.exe'
if (-not (Test-Path -LiteralPath $pscpExe)) { throw "pscp not found next to plink: $pscpExe" }

$plinkHostKeyArgs = @()
$sshHostKey = $deploySecrets['SSH_HOSTKEY']
if ($sshHostKey -and $sshHostKey.Trim()) {
    $plinkHostKeyArgs = @('-hostkey', $sshHostKey.Trim())
}

$ts = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$outDir = Join-Path $RepoRoot "backups/vps-env-dump-$ts"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
try {
    [System.IO.File]::WriteAllText($tmpPw, $SshPassword.Trim(), [System.Text.UTF8Encoding]::new($false))
    $remoteBase = "${SshUser}@${SshHost}:"
    Write-Host "==> Downloading VPS env to $outDir"

    $appEnv = Join-Path $outDir '.env.production.from-vps'
    & $pscpExe -batch @plinkHostKeyArgs -pwfile $tmpPw "${remoteBase}${RemotePath}/.env.production" $appEnv
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "pscp .env.production failed (exit $LASTEXITCODE) — file may be missing on server."
    }

    $btEnv = Join-Path $outDir 'docker-btcpay-env.from-vps'
    & $pscpExe -batch @plinkHostKeyArgs -pwfile $tmpPw "${remoteBase}${RemotePath}/docker/btcpay/env" $btEnv 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> (optional) docker/btcpay/env not downloaded — may not exist."
    }

    if (Test-Path -LiteralPath $deploySecretsPath) {
        Copy-Item -LiteralPath $deploySecretsPath -Destination (Join-Path $outDir 'deploy.secrets.local.copy-from-workstation') -Force
        Write-Host "==> Copied local deploy.secrets.local into dump folder (merge source for deploy)."
    }

    @"
VPS env backup created: $outDir
Files:
  - .env.production.from-vps  (BlockMiner app container env on server)
  - docker-btcpay-env.from-vps (optional BTCPay installer env)
  - deploy.secrets.local.copy-from-workstation (if present on this PC)

Keep this folder OFF git and in a safe place before destroying the VPS.
"@ | Set-Content -Path (Join-Path $outDir 'README.txt') -Encoding UTF8

    Write-Host "==> Done. See README.txt in the dump folder."
}
finally {
    if (Test-Path -LiteralPath $tmpPw) { Remove-Item -LiteralPath $tmpPw -Force -ErrorAction SilentlyContinue }
}
