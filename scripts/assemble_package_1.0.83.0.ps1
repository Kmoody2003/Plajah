$src = "windows-native\Plajah.WinUI\bin\x64\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.83.0_x64_Test"
if (-not (Test-Path $src)) {
    $src = "windows-native\Plajah.WinUI\bin\Release\net8.0-windows10.0.19041.0\win-x64\AppPackages\Plajah.WinUI_1.0.83.0_x64_Test"
}

$destDesktop = "C:\Users\Kenne\Desktop\Plajah_Package_1.0.83.0"
$destLocal = "C:\Users\Kenne\plajah\Plajah_Package_1.0.83.0"

New-Item -ItemType Directory -Force -Path $destDesktop | Out-Null
New-Item -ItemType Directory -Force -Path $destLocal | Out-Null

Copy-Item -Path "$src\*" -Destination $destDesktop -Recurse -Force
Copy-Item -Path "$src\*" -Destination $destLocal -Recurse -Force

Write-Host " Plajah 1.0.83.0 Installation Bundle Assembled!" -ForegroundColor Green
Write-Host " Desktop: $destDesktop" -ForegroundColor Cyan
Write-Host " Local:   $destLocal" -ForegroundColor Cyan
