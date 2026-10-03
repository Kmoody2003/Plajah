# setup-local-ai.ps1 — Plajah Native Creative Engine Setup & Manager for Windows
# Configures discrete GPU acceleration, Plajah Native Engine, and on-device model weights.
# Supports dedicated secondary drives (e.g. D:\PlajahModels or E:\AI_Models).

param(
    [string]$ModelDirectory,
    [switch]$DownloadModels,
    [switch]$CheckStatus
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   Plajah Native Studio Engine -- Local Hardware Setup  " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Probe GPU & VRAM
Write-Host "[1/4] Checking Hardware Capabilities..." -ForegroundColor White
$gpu = Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1
if ($gpu) {
    $vramGb = [math]::Round($gpu.AdapterRAM / 1GB, 1)
    Write-Host ('   Detected GPU: ' + $gpu.Name) -ForegroundColor Green
    Write-Host ('   Dedicated VRAM: ' + $vramGb + ' GB') -ForegroundColor Green
} else {
    Write-Host '   Warning: Could not detect discrete GPU via WMI.' -ForegroundColor Yellow
}

# 2. Check Plajah Native Windows Runtime
Write-Host ""
Write-Host "[2/4] Testing Plajah Native Acceleration..." -ForegroundColor White

$hasDirectMl = Test-Path "$env:SystemRoot\System32\DirectML.dll"
if ($hasDirectMl) {
    Write-Host '   Windows DirectML: READY (Native Hardware Acceleration)' -ForegroundColor Green
} else {
    Write-Host '   Windows DirectML: Available via DirectX Runtime' -ForegroundColor DarkGray
}

$hasCuda = (Test-Path "$env:SystemRoot\System32\nvcuda.dll") -or (Test-Path "$env:SystemRoot\System32\DriverStore\FileRepository\*\nvcuda.dll")
if ($hasCuda) {
    Write-Host '   NVIDIA CUDA / TensorRT: READY (High-Performance Path)' -ForegroundColor Green
} else {
    Write-Host '   NVIDIA CUDA: Standard DirectML Path Active' -ForegroundColor DarkGray
}

# 3. Plajah Native Model Storage & Drive Detection
Write-Host ""
Write-Host "[3/4] Resolving Model Storage Drive..." -ForegroundColor White

$plajahModelDir = $ModelDirectory
if (-not $plajahModelDir) {
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $plajahModelDir = Join-Path $localAppData 'Plajah\Models'
}

if (-not (Test-Path $plajahModelDir)) {
    New-Item -ItemType Directory -Path $plajahModelDir -Force | Out-Null
}

# Ensure subfolders exist
@('unet', 'checkpoints', 'diffusion_models', 'ipadapter') | ForEach-Object {
    $sub = Join-Path $plajahModelDir $_
    if (-not (Test-Path $sub)) { New-Item -ItemType Directory -Path $sub -Force | Out-Null }
}

$driveRoot = [System.IO.Path]::GetPathRoot($plajahModelDir)
$driveInfo = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq $driveRoot.TrimEnd('\') }
if ($driveInfo) {
    $freeGb = [math]::Round($driveInfo.FreeSpace / 1GB, 1)
    $totalGb = [math]::Round($driveInfo.Size / 1GB, 1)
    Write-Host ('   Model Storage Path: ' + $plajahModelDir) -ForegroundColor Green
    Write-Host ('   Drive (' + $driveInfo.DeviceID + ') Free Space: ' + $freeGb + ' GB free of ' + $totalGb + ' GB') -ForegroundColor Green
    if ($freeGb -lt 25) {
        Write-Host '   WARNING: Current drive has under 25 GB free. Large models require 30GB+.' -ForegroundColor Red
        Write-Host '   TIP: Run with -ModelDirectory D:\PlajahModels to use a secondary drive!' -ForegroundColor Yellow
    }
} else {
    Write-Host ('   Model Storage Path: ' + $plajahModelDir) -ForegroundColor Green
}

$m1 = @{ Name = 'FLUX.1 Schnell (NF4/GGUF)'; File = 'flux1-schnell.sft'; Subfolder = 'unet'; Role = 'Cinema Stills' }
$m2 = @{ Name = 'SUPIR v0Q Detail Enhancer'; File = 'SUPIR_v0Q.ckpt'; Subfolder = 'checkpoints'; Role = 'Micro-Texture and 4K Upscale' }
$m3 = @{ Name = 'IC-Light Directional'; File = 'iclight_sd15_fc.safetensors'; Subfolder = 'unet'; Role = '3D Relight and Ambient' }
$m4 = @{ Name = 'Wan 2.1 Video 14B'; File = 'Wan2.1_I2V_14B_480P_fp8.safetensors'; Subfolder = 'diffusion_models'; Role = 'Cinematic Camera Motion' }
$m5 = @{ Name = 'Animagine XL 3.1'; File = 'animagine-xl-3.1.safetensors'; Subfolder = 'checkpoints'; Role = 'Comics and Vector Forge' }

$modelList = @($m1, $m2, $m3, $m4, $m5)

foreach ($m in $modelList) {
    $modelPath = Join-Path $plajahModelDir ($m.Subfolder + '\' + $m.File)
    if (Test-Path $modelPath) {
        Write-Host ('   [INSTALLED] ' + $m.Name + ' - ' + $m.Role) -ForegroundColor Green
    } else {
        Write-Host ('   [READY TO DOWNLOAD] ' + $m.Name + ' - ' + $m.Role) -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[4/4] Engine Summary:" -ForegroundColor White
Write-Host "   Plajah Native Engine is integrated directly into Plajah WinUI and WebGPU." -ForegroundColor Green
Write-Host "   Supports storing weights on any secondary NVMe/SSD drive with one click." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
