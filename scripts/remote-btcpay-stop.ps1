#Requires -Version 5.1
<#
.SYNOPSIS
  SSH to the VPS and run scripts/vps-btcpay-docker-down.sh to stop the BTCPay Docker stack.

.DESCRIPTION
  Uses deploy.secrets.local (SSH_HOST, SSH_USER, SSH_PASSWORD, REMOTE_PATH).
  Optional git pull so the stop script exists: set SKIP_GIT_PULL=1 to skip.
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
chmod +x scripts/vps-btcpay-docker-down.sh 2>/dev/null || true
"@
if ($SkipGitPull) {
    $gitBlock = "chmod +x scripts/vps-btcpay-docker-down.sh 2>/dev/null || true"
}

$remote = @"
set -e
cd $RemotePath
$gitBlock
bash scripts/vps-btcpay-docker-down.sh $RemotePath
"@

$tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
try {
    [System.IO.File]::WriteAllText($tmpPw, $SshPassword.Trim(), [System.Text.UTF8Encoding]::new($false))
    Write-Host "==> remote-btcpay-stop: $SshUser@$SshHost $RemotePath"
    & $PlinkExe -batch -ssh @plinkHostKeyArgs -pwfile $tmpPw "${SshUser}@${SshHost}" (ConvertTo-UnixLf $remote)
    if ($LASTEXITCODE -ne 0) { throw "plink exited $LASTEXITCODE" }
    Write-Host "==> Done."
}
finally {
    if (Test-Path -LiteralPath $tmpPw) { Remove-Item -LiteralPath $tmpPw -Force -ErrorAction SilentlyContinue }
}
