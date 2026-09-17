[CmdletBinding()]
param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js LTS first."
}

$nodeModules = Join-Path $projectRoot "node_modules"
if ($Install -or -not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    Write-Host "Installing frontend dependencies..."
    & npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed."
    }
}

Write-Host "Building the Windows NSIS installer..."
& npm run tauri build -- --bundles nsis
if ($LASTEXITCODE -ne 0) {
    throw "The Windows Tauri build failed."
}

$outputDirectory = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis"
Write-Host "Windows installer output: $outputDirectory"
