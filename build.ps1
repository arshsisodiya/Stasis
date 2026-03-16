param(
    [string]$Version = ""
)

# build.ps1 - Full Stasis Production Build Script
# Run from the PROJECT ROOT: .\build.ps1
# Example: .\build.ps1 -Version 2.5.1
#
# What this does:
#   1. Synchronizes versions across tauri.conf.json, package.json, Cargo.toml
#   2. Generates Windows Version info for the backend EXE
#   3. Builds Python backend with PyInstaller -> dist/stasis-backend.exe
#   4. Copies EXE to frontend/src-tauri/bin/stasis-backend.exe
#   5. Runs npm run tauri:build in /frontend to produce NSIS installer

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend"
$BinDir = Join-Path $ProjectRoot "frontend\src-tauri\bin"
$SpecFile = Join-Path $ProjectRoot "stasis-backend.spec"
$BackendDir = Join-Path $BinDir "stasis-backend"
$DistDir = Join-Path $ProjectRoot "dist\stasis-backend"
$DistExe = Join-Path $DistDir "stasis-backend.exe"

$TauriConf = Join-Path $FrontendDir "src-tauri\tauri.conf.json"
$PkgJson = Join-Path $FrontendDir "package.json"
$CargoToml = Join-Path $FrontendDir "src-tauri\Cargo.toml"

# -------------------------------------------------------
# Helpers
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

function Sync-Versions {
    param([string]$targetVersion)
    
    Write-Host "  Synchronizing versions to $targetVersion..." -ForegroundColor Yellow

    # 1. Update tauri.conf.json
    if (Test-Path $TauriConf) {
        Write-Host "    -> Updating tauri.conf.json" -ForegroundColor DarkGray
        $conf = Get-Content $TauriConf -Raw | ConvertFrom-Json
        $conf.version = $targetVersion
        $conf | ConvertTo-Json -Depth 10 | Set-Content $TauriConf
    }

    # 2. Update package.json
    if (Test-Path $PkgJson) {
        Write-Host "    -> Updating package.json" -ForegroundColor DarkGray
        $pkg = Get-Content $PkgJson -Raw | ConvertFrom-Json
        $pkg.version = $targetVersion
        $pkg | ConvertTo-Json -Depth 10 | Set-Content $PkgJson
    }

    # 3. Update Cargo.toml (Regex)
    if (Test-Path $CargoToml) {
        Write-Host "    -> Updating Cargo.toml" -ForegroundColor DarkGray
        $content = Get-Content $CargoToml
        $content = $content -replace '^version\s*=\s*".*?"', "version = `"$targetVersion`""
        $content | Set-Content $CargoToml
    }
}

function Generate-PyInstallerVersionFile {
    param([string]$v)
    
    # Needs to be 4-part tuple for filevers/prodvers (e.g. 2,5,0,0)
    $cleanV = $v -replace '[^0-9.]', ''
    $parts = $cleanV.Split('.')
    $v4 = "0, 0, 0, 0"
    
    if ($parts.Count -eq 3) { $v4 = "$($parts[0]), $($parts[1]), $($parts[2]), 0" }
    elseif ($parts.Count -ge 4) { $v4 = "$($parts[0]), $($parts[1]), $($parts[2]), $($parts[3])" }
    elseif ($parts.Count -eq 2) { $v4 = "$($parts[0]), $($parts[1]), 0, 0" }
    elseif ($parts.Count -eq 1) { $v4 = "$($parts[0]), 0, 0, 0" }

    Write-Host "  Generating Windows version info ($v) ..." -ForegroundColor Yellow

    $info = @"
# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers=($v4),
    prodvers=($v4),
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
    ),
  kids=[
    StringFileInfo(
      [
      StringTable(
        '040904B0',
        [StringStruct('CompanyName', 'Arsh Sisodiya'),
        StringStruct('FileDescription', 'Stasis Backend Service'),
        StringStruct('FileVersion', '$v'),
        StringStruct('InternalName', 'Stasis'),
        StringStruct('LegalCopyright', 'Copyright (c) 2025 Arsh Sisodiya'),
        StringStruct('OriginalFilename', 'stasis-backend.exe'),
        StringStruct('ProductName', 'Stasis'),
        StringStruct('ProductVersion', '$v')])
      ]), 
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"@
    $info | Set-Content (Join-Path $ProjectRoot "file_version_info.txt") -Encoding Utf8
}

# -------------------------------------------------------
# 0. Versioning Logic
# -------------------------------------------------------
Write-Step "Resolving Build Version..."

if ([string]::IsNullOrWhiteSpace($Version)) {
    if (Test-Path $TauriConf) {
        $conf = Get-Content $TauriConf -Raw | ConvertFrom-Json
        $Version = $conf.version
        Write-Host "  Using current version from tauri.conf.json: $Version" -ForegroundColor Green
    } else {
        $Version = "1.0.0"
        Write-Host "  No version provided and tauri.conf.json not found. Using default: $Version" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Target version provided: $Version" -ForegroundColor Green
    Sync-Versions -targetVersion $Version
}

Generate-PyInstallerVersionFile -v $Version

# -------------------------------------------------------
# 1. Check prerequisites
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
# 2. Build Python backend with PyInstaller
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

Write-Host "  Copying backend directory to src-tauri/bin/ ..." -ForegroundColor Yellow
if (Test-Path $BackendDir) {
    Remove-Item -Recurse -Force $BackendDir
}
Copy-Item -Recurse -Force $DistDir $BackendDir

$dirSizeMB = [math]::Round((Get-ChildItem $BackendDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "  [OK] stasis-backend dir copied ($dirSizeMB MB)" -ForegroundColor Green

$VersionedZipName = "stasis-backend-v$Version.zip"
$VersionedZipPath = Join-Path $ProjectRoot "dist\$VersionedZipName"
Compress-Archive -Path $DistDir -DestinationPath $VersionedZipPath -Force
Write-Host "  [OK] Standalone backend saved as dist\$VersionedZipName" -ForegroundColor Green

# -------------------------------------------------------
# 3. npm install (if needed)
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
    # 4. Build Tauri app (Vite + Rust + NSIS)
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
# 5. Report output
# -------------------------------------------------------
Write-Step "Build complete!"

$BundleDir = Join-Path $FrontendDir "src-tauri\target\release\bundle"
if (Test-Path $BundleDir) {
    Write-Host ""
    Write-Host "  Installer(s) produced (Version: $Version):" -ForegroundColor White
    Get-ChildItem -Recurse -Include "*.exe", "*.msi" $BundleDir | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 1)
        Write-Host "    $($_.FullName)  ($sizeMB MB)" -ForegroundColor Green
    }
}
else {
    Write-Host "  Bundle directory not found. Check Tauri build output above." -ForegroundColor Yellow
}

if (Test-Path $VersionedZipPath) {
    $zipSizeMB = [math]::Round((Get-Item $VersionedZipPath).Length / 1MB, 1)
    Write-Host "    $VersionedZipPath  ($zipSizeMB MB)" -ForegroundColor Green
}

# Cleanup
if (Test-Path (Join-Path $ProjectRoot "file_version_info.txt")) {
    Remove-Item (Join-Path $ProjectRoot "file_version_info.txt")
}

Write-Host ""
Write-Host "  Done!" -ForegroundColor Cyan
Write-Host ""
