#Requires -Version 5.1
<#
.SYNOPSIS
  SSH to the same VPS as deploy, git-pull BlockMiner, run BTCPay coexistence bootstrap (background install).

.DESCRIPTION
  Reads deploy.secrets.local (SSH_HOST, SSH_USER, SSH_PASSWORD, REMOTE_PATH, DEPLOY_GIT_BRANCH).
  Requires PuTTY plink.exe. Does not print passwords.
#>
param(
    [string] $PlinkExe = 'C:\Program Files\PuTTY\plink.exe'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-UnixLf([string]$Text) {
    if ($null -eq $Text) { return '' }
    return ($Text -replace "`r`n", "`n" -replace "`r", "`n")
}

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

# Default matches scripts/deploy-vps-windows.ps1 (deploy.secrets.local may override).
$DeployGitBranch = 'main'
if ($deploySecrets['DEPLOY_GIT_BRANCH'] -and $deploySecrets['DEPLOY_GIT_BRANCH'].Trim()) {
    $DeployGitBranch = $deploySecrets['DEPLOY_GIT_BRANCH'].Trim()
}
$envDeployBranch = [Environment]::GetEnvironmentVariable('DEPLOY_GIT_BRANCH', 'Process')
if ($envDeployBranch -and $envDeployBranch.Trim()) {
    $DeployGitBranch = $envDeployBranch.Trim()
}

$SshPassword = $env:BLOCKMINER_VPS_PW
if (-not $SshPassword) { $SshPassword = $deploySecrets['SSH_PASSWORD'] }
if (-not $SshPassword) { throw "Set SSH_PASSWORD in deploy.secrets.local or BLOCKMINER_VPS_PW" }

if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink not found: $PlinkExe" }

$plinkHostKeyArgs = @()
$sshHostKey = $deploySecrets['SSH_HOSTKEY']
if ($sshHostKey -and $sshHostKey.Trim()) {
    $plinkHostKeyArgs = @('-hostkey', $sshHostKey.Trim())
}

$tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
try {
    [System.IO.File]::WriteAllText($tmpPw, $SshPassword.Trim(), [System.Text.UTF8Encoding]::new($false))

    $remote = @"
set -e
cd $RemotePath
git fetch origin
git reset --hard origin/$DeployGitBranch
chmod +x scripts/vps-btcpay-coexist-install.sh docker/btcpay/install-btcpay.sh docker/btcpay/reinstall-btcpay.sh 2>/dev/null || true
bash scripts/vps-btcpay-coexist-install.sh
"@
    Write-Host "==> remote-btcpay-setup: $SshUser@$SshHost $RemotePath branch=$DeployGitBranch"
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $remote)
    if ($LASTEXITCODE -ne 0) { throw "plink failed exit $LASTEXITCODE" }
    Write-Host "==> Done. On server: tail -f /root/btcpay-blockminer-install.log"
}
finally {
    if (Test-Path -LiteralPath $tmpPw) { Remove-Item -LiteralPath $tmpPw -Force }
}
