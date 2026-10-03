# Plajah Godot 4 Visualizer Quick-Launcher
Write-Host "Starting Plajah Godot 4 Audio Visualizer (Vulkan Forward+ Engine)..." -ForegroundColor Cyan

$godotPath = (Get-Command godot -ErrorAction SilentlyContinue).Source
if (-not $godotPath) {
    $godotPath = "C:\Users\Kenne\AppData\Local\Microsoft\WinGet\Links\godot.exe"
}

if (-not (Test-Path $godotPath)) {
    Write-Error "Godot binary not found at $godotPath"
    exit 1
}

$projectPath = Join-Path $PSScriptRoot "engines\godot4-visualizer"
Write-Host "Launching: $godotPath --path $projectPath scenes/MasterGalleryGD.tscn" -ForegroundColor Green
Start-Process -FilePath $godotPath -ArgumentList "--path `"$projectPath`" scenes/MasterGalleryGD.tscn"
