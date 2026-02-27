# Local proxy for cycling app — no Python or Node required, uses built-in PowerShell
# Serves files from this folder at http://localhost:8080/
# Proxies http://localhost:8080/icu-internal/* → https://intervals.icu/api/*
# Proxies http://localhost:8080/strava-internal/* → https://www.strava.com/api/v3/*
# Proxies http://localhost:8080/strava-auth/* → https://www.strava.com/oauth/*

$port   = 8080
$root   = $PSScriptRoot
$prefix = 'http://localhost:8080/'

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Cycling app running at http://localhost:8080/"  -ForegroundColor Green
Write-Host "Proxying /icu-internal/*     -> https://intervals.icu/api/*"
Write-Host "Proxying /strava-internal/*  -> https://www.strava.com/api/v3/*"
Write-Host "Proxying /strava-auth/*      -> https://www.strava.com/oauth/*"
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json'
    '.ico'  = 'image/x-icon'
    '.png'  = 'image/png'
}

while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $req  = $ctx.Request
    $resp = $ctx.Response

    $resp.Headers.Add('Access-Control-Allow-Origin', '*')
    $resp.Headers.Add('Access-Control-Allow-Headers', 'Authorization, Accept, Content-Type')
    $resp.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    if ($req.HttpMethod -eq 'OPTIONS') {
        $resp.StatusCode = 204
        $resp.Close()
        continue
    }

    $path = $req.Url.PathAndQuery

    # --- Proxy: /icu-internal/* → https://intervals.icu/api/* ---
    if ($path.StartsWith('/icu-internal/')) {
        $target = 'https://intervals.icu/api/' + $path.Substring('/icu-internal/'.Length)
        try {
            $auth    = $req.Headers['Authorization']
            $headers = @{ 'Authorization' = $auth; 'Accept' = 'application/json' }
            $wr      = Invoke-WebRequest -Uri $target -Headers $headers -UseBasicParsing -ErrorAction Stop
            $bytes   = $wr.Content
            if ($bytes -is [string]) { $bytes = [System.Text.Encoding]::UTF8.GetBytes($bytes) }
            $resp.ContentType   = 'application/json'
            $resp.ContentLength64 = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "PROXY 200  $target"
        } catch {
            $resp.StatusCode = 502
            Write-Host "PROXY ERR  $target  $_"
        }
        $resp.Close()
        continue
    }

    # --- Strava Auth: POST /strava-auth/* → https://www.strava.com/oauth/* ---
    if ($path.StartsWith('/strava-auth/') -and $req.HttpMethod -eq 'POST') {
        $target = 'https://www.strava.com/oauth/' + $path.Substring('/strava-auth/'.Length)
        try {
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $body   = $reader.ReadToEnd()
            $reader.Close()
            $wr = Invoke-WebRequest -Uri $target -Method POST -Body $body `
                  -ContentType 'application/x-www-form-urlencoded' -UseBasicParsing -ErrorAction Stop
            $bytes = $wr.Content
            if ($bytes -is [string]) { $bytes = [System.Text.Encoding]::UTF8.GetBytes($bytes) }
            $resp.ContentType     = 'application/json'
            $resp.ContentLength64 = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "STRAVA AUTH 200  $target"
        } catch {
            $resp.StatusCode = 502
            Write-Host "STRAVA AUTH ERR  $target  $_"
        }
        $resp.Close()
        continue
    }

    # --- Strava API: GET /strava-internal/* → https://www.strava.com/api/v3/* ---
    if ($path.StartsWith('/strava-internal/')) {
        $target = 'https://www.strava.com/api/v3/' + $path.Substring('/strava-internal/'.Length)
        try {
            $auth    = $req.Headers['Authorization']
            $headers = @{ 'Authorization' = $auth; 'Accept' = 'application/json' }
            $wr      = Invoke-WebRequest -Uri $target -Headers $headers -UseBasicParsing -ErrorAction Stop
            $bytes   = $wr.Content
            if ($bytes -is [string]) { $bytes = [System.Text.Encoding]::UTF8.GetBytes($bytes) }
            $resp.ContentType     = 'application/json'
            $resp.ContentLength64 = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "STRAVA 200  $target"
        } catch {
            $resp.StatusCode = 502
            Write-Host "STRAVA ERR  $target  $_"
        }
        $resp.Close()
        continue
    }

    # --- Static file serving ---
    $filePath = if ($path -eq '/' -or $path -eq '') {
        Join-Path $root 'index.html'
    } else {
        Join-Path $root ($path.TrimStart('/').Split('?')[0] -replace '/', [IO.Path]::DirectorySeparatorChar)
    }

    if (Test-Path $filePath -PathType Leaf) {
        $ext   = [IO.Path]::GetExtension($filePath)
        $bytes = [IO.File]::ReadAllBytes($filePath)
        $resp.ContentType     = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { 'application/octet-stream' }
        $resp.ContentLength64 = $bytes.Length
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $resp.StatusCode = 404
    }
    $resp.Close()
}
