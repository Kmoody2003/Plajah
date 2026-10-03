Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead('C:\Users\Kenne\Desktop\Plajah_Package_1.0.26.0\Plajah.WinUI_1.0.26.0_x64.msix')
$entries = $z.Entries | Where-Object { $_.FullName -like '*DesktopLauncherOverlay*' -or $_.FullName -like '*index.html*' }
foreach ($e in $entries) {
    Write-Host "$($e.FullName) - $($e.Length) bytes - LastWrite: $($e.LastWriteTime)"
}
$z.Dispose()
