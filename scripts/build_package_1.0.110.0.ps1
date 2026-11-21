# Rebuild MSIX + APK as 1.0.110.0 from the prepared ship worktree (D:\ship-1114).
# Run: powershell -File scripts\build_package_1.0.110.0.ps1
$ErrorActionPreference = 'Stop'
$main = 'C:\Users\Kenne\plajah'
$ship = 'D:\ship-1114'
$ver  = '1.0.110.0'
$out  = "D:\Plajah_Package_$ver"
$prev = 'D:\Plajah_Package_1.0.109.0'
Set-Location $ship

function Step($m) { Write-Host "`n=== $(Get-Date -Format HH:mm:ss) $m" }

Step 'overlay this session''s Stage edits'
foreach ($f in 'components/scripture/AmboProPresenter.tsx','components/scripture/AmboTabbedLibrary.tsx') {
  Copy-Item "$main\$f" "$ship\$f" -Force
}

Step 'bump version to 110'
(Get-Content android\app\build.gradle -Raw) -replace 'versionCode \d+','versionCode 110' -replace 'versionName "[\d.]+"','versionName "1.0.110.0"' | Set-Content android\app\build.gradle -NoNewline
(Get-Content windows-native\Plajah.WinUI\Package.appxmanifest -Raw) -replace '(Publisher="CN=Plajah" Version=")[\d.]+(")','${1}1.0.110.0${2}' | Set-Content windows-native\Plajah.WinUI\Package.appxmanifest -NoNewline

Step 'hub bundle'
node scripts/buildHubBundle.mjs
if ($LASTEXITCODE) { throw 'hub bundle failed' }

Step 'web build'
npm run build
if ($LASTEXITCODE) { throw 'web build failed' }

Step 'restore git-ignored public files into dist'
$n = 0
Push-Location $main
$ign = git ls-files -o -i --exclude-standard public
Pop-Location
$ign | ForEach-Object {
  $rel = $_ -replace '^public/',''
  $dst = Join-Path "$ship\dist" $rel
  if (-not (Test-Path -LiteralPath $dst)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
    Copy-Item -LiteralPath "$main\$_" -Destination $dst -Force; $n++
  }
}
Write-Host "copied $n ignored public files"

Step 'MSIX'
Push-Location windows-native\Plajah.WinUI
dotnet publish -c Release -r win-x64 -p:Platform=x64 -p:GenerateAppxPackageOnBuild=true
if ($LASTEXITCODE) { throw 'msix failed' }
Pop-Location
$pkg = Get-ChildItem windows-native\Plajah.WinUI\bin -Recurse -Filter "Plajah.WinUI_${ver}_x64.msix" | Select-Object -First 1
if (-not $pkg) { throw 'msix not found' }

Step 'APK'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
Push-Location android
.\gradlew.bat :app:assembleDebug
if ($LASTEXITCODE) { throw 'apk failed' }
Pop-Location

Step 'assemble package folder'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item $pkg.FullName $out -Force
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk "$out\Plajah-$ver-debug.apk" -Force
Copy-Item windows-native\Plajah.WinUI\Plajah.cer $out -Force
Copy-Item "$($pkg.DirectoryName)\Add-AppDevPackage.ps1" $out -Force
if (Test-Path "$($pkg.DirectoryName)\Add-AppDevPackage.resources") { Copy-Item "$($pkg.DirectoryName)\Add-AppDevPackage.resources" $out -Recurse -Force }
foreach ($f in 'Install_Plajah.bat','README_INSTALL.txt') {
  (Get-Content "$prev\$f" -Raw) -replace '1\.0\.109\.0',$ver | Set-Content "$out\$f" -NoNewline
}
Get-ChildItem $out | Select-Object Name,@{n='MB';e={[math]::Round($_.Length/1MB,1)}}

Step 'remove the older package folders'
Remove-Item 'D:\Plajah_Package_1.0.108.0' -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "DONE $ver"
