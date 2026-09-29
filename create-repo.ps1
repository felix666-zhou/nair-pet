# Create a GitHub repo for this folder, push it, and turn on GitHub Pages.
# ASCII only (Windows PowerShell 5.1 reads .ps1 as ANSI).
# Usage:  powershell -ExecutionPolicy Bypass -File create-repo.ps1 [-User <name>] [-Repo <name>]
# Token source (first found wins): -Token, env GITHUB_TOKEN, ..\github-token.txt

param([string]$User, [string]$Repo = 'nair-pet', [string]$Token)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

if (-not $Token) { $Token = $env:GITHUB_TOKEN }
if (-not $Token) {
  $tokenFile = Join-Path (Split-Path $here -Parent) 'github-token.txt'
  if (Test-Path -LiteralPath $tokenFile) {
    $Token = (Get-Content -LiteralPath $tokenFile |
      Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') } |
      Select-Object -First 1).Trim()
  }
}
if (-not $Token -or $Token -match '<') {
  Write-Host ''
  Write-Host '  [X] No token found.' -ForegroundColor Red
  Write-Host '      Put your GitHub token into  D:\...\github-token.txt  (or set GITHUB_TOKEN).'
  exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host '  [X] git not found. Install Git for Windows first.' -ForegroundColor Red
  exit 1
}

$headers = @{
  Authorization = "token $Token"
  Accept        = 'application/vnd.github+json'
  'User-Agent'  = 'nair-pet-publisher'
}

Write-Host ''
Write-Host '  1/4  checking token ...'
$me = (Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers).login
if (-not $User) { $User = $me }
Write-Host ("       logged in as: {0}" -f $me)

Write-Host ("  2/4  creating repository {0}/{1} ..." -f $User, $Repo)
try {
  $null = Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' -Headers $headers `
    -ContentType 'application/json' `
    -Body (@{ name = $Repo; private = $false; description = 'Nair web pet - static site, each user fills in their own API key' } | ConvertTo-Json)
  Write-Host '       created.'
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 422) { Write-Host '       already exists - will push into it.' }
  else { throw }
}

Write-Host '  3/4  uploading files (about 56 MB, first push may take a few minutes) ...'
Push-Location $here
try {
  git remote remove origin 2>$null
  git remote add origin ("https://github.com/{0}/{1}.git" -f $me, $Repo)
  git branch -M main
  # token goes into a one-off http header, so it is never written into .git/config
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(('x-access-token:{0}' -f $Token)))
  git -c ("http.extraheader=AUTHORIZATION: basic {0}" -f $basic) push -u origin main
  if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
} finally {
  Pop-Location
}

Write-Host '  4/4  turning on GitHub Pages ...'
try {
  $null = Invoke-RestMethod -Method Post -Uri ("https://api.github.com/repos/{0}/{1}/pages" -f $me, $Repo) -Headers $headers `
    -ContentType 'application/vnd.github+json' `
    -Body (@{ source = @{ branch = 'main'; path = '/' } } | ConvertTo-Json)
  Write-Host '       Pages enabled.'
} catch {
  Write-Host '       (Pages may already be enabled, or needs to be switched on in Settings - Pages)'
}

Write-Host ''
Write-Host '  Done. Your website (may take 1-3 minutes to build the first time):' -ForegroundColor Green
Write-Host ("      https://{0}.github.io/{1}/" -f $me, $Repo) -ForegroundColor Green
Write-Host ''
Write-Host '  Repo page:'
Write-Host ("      https://github.com/{0}/{1}" -f $me, $Repo)
Write-Host ''
