#Requires -Version 5.1
<#
.SYNOPSIS
  Envia o projeto (tarball) para a VPS e executa docker compose up -d --build --no-deps app + healthcheck (não sobe/recria db/nginx).

.DESCRIPTION
  Credenciais (por ordem de prioridade para password):
  1) deploy.secrets.local na raiz (SSH_HOST, SSH_USER, SSH_PASSWORD, REMOTE_PATH) — gitignored; copia de deploy.secrets.example
  2) Parâmetros -SshHost, -SshUser, -RemotePath, -PwFile
  3) $env:BLOCKMINER_VPS_PW
  4) .deploy-pw.txt (uma linha, só password)

  Requer PuTTY (pscp.exe e plink.exe), normalmente em "C:\Program Files\PuTTY\".

.EXAMPLE
  .\scripts\deploy-vps-windows.ps1

.EXAMPLE
  .\scripts\deploy-vps-windows.ps1 -PwFile .\.deploy-pw.txt
#>
param(
    [string] $SshHost = '37.27.38.21',
    [string] $SshUser = 'root',
    [string] $RemotePath = '/root/block-miner',
    [string] $PwFile = '',
    [string] $PscpExe = 'C:\Program Files\PuTTY\pscp.exe',
    [string] $PlinkExe = 'C:\Program Files\PuTTY\plink.exe',
    [switch] $SkipTarball,
    [switch] $SkipUpload,
    [string] $TarballPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

function Read-DeploySecretsFile {
    param([string]$Path)
    $out = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $out }
    Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $ix = $line.IndexOf('=')
        if ($ix -lt 1) { return }
        $k = $line.Substring(0, $ix).Trim()
        $v = $line.Substring($ix + 1).Trim()
        if ($k) { $out[$k] = $v }
    }
    return $out
}

$deploySecretsPath = Join-Path $RepoRoot 'deploy.secrets.local'
$deploySecrets = Read-DeploySecretsFile -Path $deploySecretsPath
if (-not $PSBoundParameters.ContainsKey('SshHost') -and $deploySecrets['SSH_HOST']) {
    $SshHost = $deploySecrets['SSH_HOST']
}
if (-not $PSBoundParameters.ContainsKey('SshUser') -and $deploySecrets['SSH_USER']) {
    $SshUser = $deploySecrets['SSH_USER']
}
if (-not $PSBoundParameters.ContainsKey('RemotePath') -and $deploySecrets['REMOTE_PATH']) {
    $RemotePath = $deploySecrets['REMOTE_PATH']
}

function Resolve-PwFilePath {
    param([hashtable]$Secrets = @{})
    if ($PwFile) {
        if (-not (Test-Path -LiteralPath $PwFile)) {
            throw "PwFile não encontrado: $PwFile"
        }
        return (Resolve-Path -LiteralPath $PwFile).Path
    }
    $envPw = $env:BLOCKMINER_VPS_PW
    if ($envPw) {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_deploy_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
        [System.IO.File]::WriteAllText($tmp, $envPw.Trim(), [System.Text.UTF8Encoding]::new($false))
        return @{ Path = $tmp; Temp = $true }
    }
    $secPw = $Secrets['SSH_PASSWORD']
    if ($secPw) {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_deploy_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
        [System.IO.File]::WriteAllText($tmp, $secPw.Trim(), [System.Text.UTF8Encoding]::new($false))
        return @{ Path = $tmp; Temp = $true }
    }
    $defaultLocal = Join-Path $RepoRoot '.deploy-pw.txt'
    if (Test-Path -LiteralPath $defaultLocal) {
        return (Resolve-Path -LiteralPath $defaultLocal).Path
    }
    throw @"
Defina password SSH sem a pôr no Git:
  - Cria deploy.secrets.local (copia deploy.secrets.example) com SSH_PASSWORD=...
  - ou `$env:BLOCKMINER_VPS_PW = '...'
  - ou .deploy-pw.txt (uma linha) na raiz
  - ou -PwFile 'caminho'
"@
}

if (-not (Test-Path -LiteralPath $PscpExe)) { throw "pscp não encontrado: $PscpExe (instale PuTTY)." }
if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink não encontrado: $PlinkExe (instale PuTTY)." }

$pwResolved = Resolve-PwFilePath -Secrets $deploySecrets
$pwFilePath = if ($pwResolved -is [hashtable]) { $pwResolved.Path } else { $pwResolved }
$removePwTemp = ($pwResolved -is [hashtable]) -and $pwResolved.Temp

# PuTTY -pwfile is sensitive to trailing newlines/spaces; normalize file-based passwords.
if (-not $removePwTemp -and (Test-Path -LiteralPath $pwFilePath)) {
    $trimmed = [System.IO.File]::ReadAllText($pwFilePath, [System.Text.UTF8Encoding]::new($false)).Trim()
    if ($trimmed.Length -gt 0) {
        $tmpPw = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_deploy_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
        [System.IO.File]::WriteAllText($tmpPw, $trimmed, [System.Text.UTF8Encoding]::new($false))
        $pwFilePath = $tmpPw
        $removePwTemp = $true
    }
}

try {
    if (-not $SkipTarball) {
        if (-not $TarballPath) {
            $TarballPath = Join-Path $RepoRoot '..\bm-deploy.tar.gz'
        }
        $TarballPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TarballPath)
        Write-Host '==> Criando tarball (exclui node_modules, .git, data, .env, etc.)...'
        if (Test-Path -LiteralPath $TarballPath) { Remove-Item -LiteralPath $TarballPath -Force }
        $excludes = @(
            '--exclude=node_modules',
            '--exclude=client/node_modules',
            '--exclude=client/dist',
            '--exclude=.git',
            '--exclude=data',
            '--exclude=forensics_vault',
            '--exclude=backup-template',
            '--exclude=uploads',
            '--exclude=.env',
            '--exclude=.env.production',
            '--exclude=.env.test',
            '--exclude=heap.heapsnapshot'
        )
        & tar.exe -czf $TarballPath @excludes -C $RepoRoot .
        if (-not (Test-Path -LiteralPath $TarballPath)) { throw 'Falha ao criar tarball.' }
        Write-Host "    $($TarballPath) ($([math]::Round((Get-Item $TarballPath).Length / 1MB, 2)) MB)"
    }
    else {
        if (-not $TarballPath) { throw 'Com -SkipTarball deve indicar -TarballPath com o .tar.gz já criado.' }
        $TarballPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TarballPath)
        if (-not (Test-Path -LiteralPath $TarballPath)) { throw "Tarball não encontrado: $TarballPath" }
    }

    $remoteTar = '/tmp/bm-deploy.tar.gz'
    if (-not $SkipUpload) {
        Write-Host '==> Upload (pscp)...'
        & $PscpExe -batch -pwfile $pwFilePath $TarballPath "${SshUser}@${SshHost}:$remoteTar"
    }
    else {
        Write-Host '==> Upload ignorado (-SkipUpload); a usar tarball já em' $remoteTar 'no servidor'
    }

    # Bash remoto falha com CRLF (Windows); forçar só LF no script enviado ao plink.
    $remoteCmd = (@"
set -e
cd $RemotePath
tar -xzf $remoteTar
if [ ! -f .env.production ] && [ -f .env ]; then cp .env .env.production; fi
docker compose up -d --build --no-deps app
curl -sS -o /dev/null -w 'health_http:%{http_code}\n' http://127.0.0.1:3000/health || true
"@ -replace "`r`n", "`n" -replace "`r", "`n").TrimEnd() + "`n"
    Write-Host '==> Extrair + docker compose up -d --build --no-deps app...'
    & $PlinkExe -batch -ssh -pwfile $pwFilePath "${SshUser}@${SshHost}" $remoteCmd
    Write-Host '==> Feito.'
}
finally {
    if ($removePwTemp -and (Test-Path -LiteralPath $pwFilePath)) {
        Remove-Item -LiteralPath $pwFilePath -Force -ErrorAction SilentlyContinue
    }
}
