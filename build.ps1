# build.ps1 - Full Stasis Production Build Script
# Run from the PROJECT ROOT: .\build.ps1
#
# What this does:
#   1. Builds Python backend with PyInstaller -> dist/stasis-backend.exe
#   2. Copies EXE to frontend/src-tauri/bin/stasis-backend.exe
#   3. Runs npm run tauri:build in /frontend to produce NSIS installer
#
# Prerequisites (must be installed & on PATH):
#   - Python  + pyinstaller  (pip install pyinstaller)
#   - Node.js + npm
#   - Rust (stable, via rustup)
#   - Tauri CLI (installed via npm devDependencies)
#   - NSIS (https://nsis.sourceforge.io/Download) - must be on PATH
#   - UPX (optional, https://upx.github.io)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend"
$BinDir = Join-Path $ProjectRoot "frontend\src-tauri\bin"
$SpecFile = Join-Path $ProjectRoot "stasis-backend.spec"
$BackendExe = Join-Path $BinDir "stasis-backend.exe"
$DistExe = Join-Path $ProjectRoot "dist\stasis-backend.exe"

# -------------------------------------------------------
# Helper: print a section header
# -------------------------------------------------------
function Write-Step {
    param([string]$msg)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Find-Tool {
    param([string]$name, [string]$hint = "")
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "  [MISSING] '$name' not found on PATH." -ForegroundColor Red
        if ($hint) {
            Write-Host "            Hint: $hint" -ForegroundColor Yellow
        }
        exit 1
    }
    Write-Host "  [OK] $name" -ForegroundColor Green
}

# -------------------------------------------------------
# 0. Check prerequisites
# -------------------------------------------------------
Write-Step "Checking prerequisites..."

Find-Tool "python"      "Install from https://python.org"
Find-Tool "pyinstaller" "Run: pip install pyinstaller"
Find-Tool "node"        "Install from https://nodejs.org"
Find-Tool "npm"         "Install from https://nodejs.org"
Find-Tool "cargo"       "Install Rust from https://rustup.rs"

if (Get-Command "upx" -ErrorAction SilentlyContinue) {
    Write-Host "  [OK] upx (EXE compression enabled)" -ForegroundColor Green
}
else {
    Write-Host "  [WARN] upx not found - EXE will not be compressed" -ForegroundColor Yellow
}

# -------------------------------------------------------
# 1. Build Python backend with PyInstaller
# -------------------------------------------------------
Write-Step "Step 1/3 - Building Python backend with PyInstaller..."

if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
    Write-Host "  Created $BinDir" -ForegroundColor DarkGray
}

Push-Location $ProjectRoot
try {
    Write-Host "  Running: pyinstaller --clean --noconfirm $SpecFile" -ForegroundColor DarkGray
    & pyinstaller --clean --noconfirm $SpecFile
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $DistExe)) {
    Write-Host "[ERROR] PyInstaller output not found: $DistExe" -ForegroundColor Red
    Write-Host "        Check the PyInstaller output above for errors." -ForegroundColor Red
    exit 1
}

Write-Host "  Copying EXE to src-tauri/bin/ ..." -ForegroundColor Yellow
Copy-Item -Force $DistExe $BackendExe

$exeSize = [math]::Round((Get-Item $BackendExe).Length / 1MB, 1)
Write-Host "  [OK] stasis-backend.exe copied ($exeSize MB)" -ForegroundColor Green

# -------------------------------------------------------
# 2. npm install (if needed)
# -------------------------------------------------------
Write-Step "Step 2/3 - Checking npm dependencies..."

Push-Location $FrontendDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "  Running npm install..." -ForegroundColor Yellow
        & npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    }
    else {
        Write-Host "  node_modules already present, skipping install." -ForegroundColor DarkGray
    }

    # -------------------------------------------------------
    # 3. Build Tauri app (Vite + Rust + NSIS)
    # -------------------------------------------------------
    Write-Step "Step 3/3 - Building Tauri desktop app (may take several minutes)..."

    & npm run tauri:build
    if ($LASTEXITCODE -ne 0) {
        throw "tauri:build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

# -------------------------------------------------------
# 4. Report output
# -------------------------------------------------------
Write-Step "Build complete!"

$BundleDir = Join-Path $FrontendDir "src-tauri\target\release\bundle"
if (Test-Path $BundleDir) {
    Write-Host ""
    Write-Host "  Installer(s) produced:" -ForegroundColor White
    Get-ChildItem -Recurse -Include "*.exe", "*.msi" $BundleDir | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 1)
        Write-Host "    $($_.FullName)  ($sizeMB MB)" -ForegroundColor Green
    }
}
else {
    Write-Host "  Bundle directory not found. Check Tauri build output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Done!" -ForegroundColor Cyan
Write-Host ""
