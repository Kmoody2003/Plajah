# Builds one reference renderer per ported plugin from the ORIGINAL Airwindows C++.
#   powershell -File rust/plajah-airwindows/ref/build.ps1 [-Src <airwindows checkout>] [-Only Density,Galactic]
# Needs MSVC Build Tools and a checkout of https://github.com/airwindows/airwindows (sparse
# plugins/LinuxVST/src is enough). Output: ref/bin/ref_<Name>.exe, read by tests/reference.rs.
param(
  [string]$Src = "$env:USERPROFILE\oss\airwindows",
  [string[]]$Only = @()
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$plugins = Get-Content (Join-Path $here 'plugins.txt') | Where-Object { $_ -and -not $_.StartsWith('#') }
if ($Only.Count) { $plugins = $plugins | Where-Object { $Only -contains $_ } }

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -property installationPath
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
$bin = Join-Path $here 'bin'
$obj = Join-Path $here 'obj'
New-Item -ItemType Directory -Force $bin, $obj | Out-Null

$failed = @()
foreach ($p in $plugins) {
  $dir = Join-Path $Src "plugins\LinuxVST\src\$p"
  if (-not (Test-Path $dir)) { Write-Warning "$p not found in $dir"; $failed += $p; continue }
  $cmd = "`"$vcvars`" >nul && cl /nologo /EHsc /O2 /fp:precise /W0 /D_USE_MATH_DEFINES /D_XKEYCHECK_H /DPLUGIN=$p /DPLUGIN_HEADER=\`"$p.h\`" " +
         "/I`"$here\vst`" /I`"$dir`" /Fo`"$obj\\`" /Fe`"$bin\ref_$p.exe`" " +
         "`"$here\harness.cpp`" `"$dir\$p.cpp`" `"$dir\${p}Proc.cpp`""
  cmd /c $cmd | Where-Object { $_ -notmatch '^(harness|\w+)\.cpp$' }
  if ($LASTEXITCODE -ne 0) { $failed += $p } else { Write-Host "built ref_$p.exe" }
}
if ($failed.Count) { Write-Error "failed: $($failed -join ', ')" }
