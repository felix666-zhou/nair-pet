# Nair web pet - tiny static server (PowerShell only, no dependencies).
# Usage:  double-click 启动奈儿网站.cmd   (or: powershell -File serve.ps1 [port])
# ASCII only on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI.

param([int]$Port = 8080)

$root = $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $root 'index.html'))) { $root = (Get-Location).Path }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webm' = 'video/webm'
  '.mp4'  = 'video/mp4'
  '.ttf'  = 'font/ttf'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Cannot listen on port $Port - is it already in use? Try: powershell -File serve.ps1 8081"
  Start-Sleep -Seconds 6
  exit 1
}

$url = "http://127.0.0.1:$Port/"
Write-Host ""
Write-Host "  Nair web pet is running:  $url"
Write-Host "  (keep this window open; press Ctrl+C to stop)"
Write-Host ""
if ($env:NAI_NO_OPEN -ne '1') { Start-Process $url }

while ($listener.IsListening) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $rootFull = [IO.Path]::GetFullPath($root)
    if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'forbidden' }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $res.StatusCode = 404
      $body = [Text.Encoding]::UTF8.GetBytes('404 not found')
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.OutputStream.Write($body, 0, $body.Length)
    } else {
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers['Cache-Control'] = 'no-cache'
      $bytes = [IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    try {
      $res.StatusCode = 500
      $body = [Text.Encoding]::UTF8.GetBytes('500 ' + $_.Exception.Message)
      $res.OutputStream.Write($body, 0, $body.Length)
    } catch {}
  } finally {
    try { $res.Close() } catch {}
  }
}
