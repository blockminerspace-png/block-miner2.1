#Requires -Version 5.1
<#
.SYNOPSIS
  SSH to the BlockMiner VPS and run scripts/vps-issue-btcpay-letsencrypt.sh (Let's Encrypt for BTCPay hostname).

.DESCRIPTION
  Uses deploy.secrets.local (SSH_HOST, SSH_USER, SSH_PASSWORD, REMOTE_PATH, DEPLOY_GIT_BRANCH).
  Optional: git pull before running (default on). Set SKIP_GIT_PULL=1 to only issue certs.
  Requires PuTTY plink.exe.
#>
param(
    [string] $PlinkExe = 'C:\Program Files\PuTTY\plink.exe',
    [switch] $SkipGitPull
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

$gitBlock = @"
git fetch origin
git reset --hard origin/$DeployGitBranch
chmod +x scripts/vps-issue-btcpay-letsencrypt.sh 2>/dev/null || true
"@
if ($SkipGitPull) {
    $gitBlock = "chmod +x scripts/vps-issue-btcpay-letsencrypt.sh 2>/dev/null || true"
}

$envPrefix = ''
$leFromSecrets = ''
if ($deploySecrets['BTCPAY_LE_EMAIL'] -and $deploySecrets['BTCPAY_LE_EMAIL'].Trim()) {
    $leFromSecrets = $deploySecrets['BTCPAY_LE_EMAIL'].Trim()
}
if ($leFromSecrets) {
    $escaped = $leFromSecrets.Replace("'", "'\''")
    $envPrefix = "export BTCPAY_LE_EMAIL='$escaped'`n"
}
if ($deploySecrets['BTCPAY_LE_DOMAIN'] -and $deploySecrets['BTCPAY_LE_DOMAIN'].Trim()) {
    $d = $deploySecrets['BTCPAY_LE_DOMAIN'].Trim().Replace("'", "'\''")
    $envPrefix += "export BTCPAY_LE_DOMAIN='$d'`n"
}

$remote = @"
set -e
cd $RemotePath
$envPrefix$gitBlock
bash scripts/vps-issue-btcpay-letsencrypt.sh
"@

$tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
try {
    [System.IO.File]::WriteAllText($tmpPw, $SshPassword.Trim(), [System.Text.UTF8Encoding]::new($false))
    Write-Host "==> remote-btcpay-letsencrypt: $SshUser@$SshHost $RemotePath branch=$DeployGitBranch (git pull: $(-not $SkipGitPull))"
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $remote)
    if ($LASTEXITCODE -ne 0) { throw "plink failed exit $LASTEXITCODE" }
    Write-Host "==> Done. Open https://btcpay.blockminer.space (or your BTCPAY_LE_DOMAIN) — padlock should be valid."
}
finally {
    if (Test-Path -LiteralPath $tmpPw) { Remove-Item -LiteralPath $tmpPw -Force }
}
