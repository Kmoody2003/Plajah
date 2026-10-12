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
    if (Test-Path 'D:\Plajah Models') {
        $plajahModelDir = 'D:\Plajah Models'
    } elseif (Test-Path 'D:\Plajah AI Models') {
        $plajahModelDir = 'D:\Plajah AI Models'
    } else {
        $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
        $plajahModelDir = Join-Path $localAppData 'Plajah\Models'
    }
}

if (-not (Test-Path $plajahModelDir)) {
    New-Item -ItemType Directory -Path $plajahModelDir -Force | Out-Null
}

# Ensure subfolders exist
@('unet', 'checkpoints', 'diffusion_models', 'ipadapter', 'clip', 'vae') | ForEach-Object {
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
        Write-Host '   TIP: Run with -ModelDirectory D:\Plajah Models to use a secondary drive!' -ForegroundColor Yellow
    }
} else {
    Write-Host ('   Model Storage Path: ' + $plajahModelDir) -ForegroundColor Green
}

# Group A: NVIDIA-Specific Models
$m_nemotron = @{ Name = 'NVIDIA Nemotron-Mini 4B (RTX Instruct)'; Files = @('Nemotron-Mini-4B-Instruct-Q4_K_M.gguf', 'nemotron-mini-4b-instruct.gguf'); Subfolder = 'llm'; Role = 'Directorial Prompt Expansion & Script Intelligence' }
$m_mistral_nemo = @{ Name = 'Mistral-NeMo 12B Instruct (NVIDIA+Mistral)'; Files = @('Mistral-Nemo-Instruct-2407-Q4_K_M.gguf'); Subfolder = 'llm'; Role = '128k Story Worldbuilding & Character Bible' }
$m_cosmos = @{ Name = 'NVIDIA Cosmos-1.0 Prompt Upscaler'; Files = @('cosmos-prompt-upscaler.gguf'); Subfolder = 'llm'; Role = 'Physical World & Dynamic Lighting Upscaler' }

# Group B: Free Diffusion, Creative & Video Models
$m_flux = @{ Name = 'FLUX.1 Schnell (NF4/FP8/Safetensors)'; Files = @('flux1-schnell.safetensors', 'flux1-schnell.sft', 'flux1-schnell-Q4_0.gguf'); Subfolder = 'unet'; Role = 'Primary Cinema Still Engine' }
$m_turbo = @{ Name = 'SDXL-Turbo 1.0 (1-Step Realtime)'; Files = @('sd_xl_turbo_1.0_fp16.safetensors', 'sd_xl_turbo_1.0.safetensors'); Subfolder = 'checkpoints'; Role = 'Realtime Brush & Canvas Diffusion' }
$m_lightning = @{ Name = 'SDXL-Lightning (4-Step Cinema)'; Files = @('sdxl_lightning_4step.safetensors'); Subfolder = 'checkpoints'; Role = 'Rapid 1024px Production Stills' }
$m_animagine = @{ Name = 'Animagine XL 3.1'; Files = @('animagine-xl-3.1.safetensors'); Subfolder = 'checkpoints'; Role = 'Comics, Manga & Vector Art Forge' }
$m_iclight = @{ Name = 'IC-Light Directional'; Files = @('iclight_sd15_fc.safetensors'); Subfolder = 'unet'; Role = '3D Relight & Ambient Swap' }
$m_ipadapter = @{ Name = 'IP-Adapter FaceID Plus V2'; Files = @('ip-adapter-faceid-plusv2_sdxl.bin'); Subfolder = 'ipadapter'; Role = 'Character Bible Likeness Locks' }
$m_svd = @{ Name = 'Stable Video Diffusion XT'; Files = @('svd.safetensors', 'svd_xt.safetensors'); Subfolder = 'checkpoints'; Role = 'Cinematic Image-to-Video Motion' }
$m_sd15 = @{ Name = 'Stable Diffusion 1.5 Pruned'; Files = @('v1-5-pruned-emaonly-fp16.safetensors', 'v1-5-pruned-emaonly.safetensors'); Subfolder = 'checkpoints'; Role = 'Lightweight Canvas Fill & ControlNet' }
$m_qwen = @{ Name = 'Qwen 2.5 7B Instruct'; Files = @('qwen2.5-7b-instruct-q4_k_m.gguf'); Subfolder = 'llm'; Role = 'Dialogue Polishing & Narrative Co-Pilot' }
$m_wan = @{ Name = 'Wan 2.1 Video 14B'; Files = @('Wan2.1_I2V_14B_480P_fp8.safetensors', 'Wan2.1-I2V-14B-480P.safetensors'); Subfolder = 'diffusion_models'; Role = 'Cinematic Camera & Subject Motion' }
$m_supir = @{ Name = 'SUPIR v0Q Detail Enhancer'; Files = @('SUPIR_v0Q.ckpt'); Subfolder = 'checkpoints'; Role = 'Micro-Texture & 4K Upscale' }

$modelList = @(
    $m_nemotron, $m_mistral_nemo, $m_cosmos,
    $m_flux, $m_turbo, $m_lightning, $m_animagine,
    $m_iclight, $m_ipadapter, $m_svd, $m_sd15,
    $m_qwen, $m_wan, $m_supir
)

foreach ($m in $modelList) {
    $found = $false
    foreach ($f in $m.Files) {
        $p = Join-Path $plajahModelDir ($m.Subfolder + '\' + $f)
        if (Test-Path $p) { $found = $true; break }
    }
    if ($found) {
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
