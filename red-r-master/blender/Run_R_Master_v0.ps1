param(
  [string]$MonaPath = "",
  [string]$BlenderPath = "",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

function Find-Blender {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return (Resolve-Path $Explicit).Path }

  $cmd = Get-Command blender.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $roots = @(
    "C:\Program Files\Blender Foundation",
    "D:\Blender",
    "D:\Program Files\Blender Foundation"
  ) | Where-Object { Test-Path $_ }

  $candidates = foreach ($root in $roots) {
    Get-ChildItem -Path $root -Filter blender.exe -File -Recurse -ErrorAction SilentlyContinue
  }
  $best = $candidates | Sort-Object FullName -Descending | Select-Object -First 1
  if ($best) { return $best.FullName }
  return $null
}

function Find-Mona {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return (Resolve-Path $Explicit).Path }

  $common = @(
    "$env:USERPROFILE\Downloads",
    "$env:USERPROFILE\Desktop",
    "$env:USERPROFILE\Documents",
    "D:\R_Master",
    "D:\RED",
    "D:\Downloads"
  ) | Where-Object { Test-Path $_ }

  foreach ($root in $common) {
    $hit = Get-ChildItem -Path $root -Filter Mona.blend -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

$ScriptPath = Join-Path $PSScriptRoot "R_Master_BuildPreview_v0.py"
if (-not (Test-Path $ScriptPath)) {
  throw "Missing companion script: $ScriptPath"
}

$Blender = Find-Blender $BlenderPath
if (-not $Blender) {
  throw "Blender was not found. Install Blender 4.4+ or pass -BlenderPath."
}

$Mona = Find-Mona $MonaPath
if (-not $Mona) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Select Mona.blend"
  $dialog.Filter = "Blender file (*.blend)|*.blend"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Mona.blend was not selected."
  }
  $Mona = $dialog.FileName
}

if (-not $OutputDir) {
  $OutputDir = Join-Path ([System.IO.Path]::GetDirectoryName($Mona)) "R_Master_v0_Output"
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

Write-Host "R Master v0"
Write-Host "Blender: $Blender"
Write-Host "Mona:    $Mona"
Write-Host "Output:  $OutputDir"
Write-Host ""

$log = Join-Path $OutputDir "R_Master_v0_blender.log"
$args = @(
  "--background",
  $Mona,
  "--python", $ScriptPath,
  "--",
  "--out", $OutputDir
)

& $Blender @args *>&1 | Tee-Object -FilePath $log
$exit = $LASTEXITCODE
if ($exit -ne 0) {
  throw "Blender failed with exit code $exit. See $log"
}

$report = Join-Path $OutputDir "R_Master_v0_report.json"
$blend = Join-Path $OutputDir "R_Master_Align_v0_PREVIEW.blend"
if (-not (Test-Path $report) -or -not (Test-Path $blend)) {
  throw "Blender exited without the expected output files. See $log"
}

Write-Host ""
Write-Host "R Master v0 preview completed."
Write-Host "Blend:  $blend"
Write-Host "Report: $report"
Write-Host "Renders: R_Master_v0_front.png / side.png / three_quarter.png"
