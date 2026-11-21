# Puts a "Finance Dashboard" shortcut on your Desktop and in the Start menu. It runs "Run as app.cmd" (minimised) with the app icon.
# Run from the project folder:  npm run shortcut
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'Run as app.cmd'
$icon = Join-Path $root 'build\icon.ico'
if (-not (Test-Path $target)) { throw "Cannot find $target" }
$shell = New-Object -ComObject WScript.Shell
$places = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))
foreach ($dir in $places) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Finance Dashboard.lnk'))
  $lnk.TargetPath = $target
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = $icon
  $lnk.WindowStyle = 7   # minimised: only the app window shows
  $lnk.Description = 'Finance Dashboard (runs on this computer)'
  $lnk.Save()
  Write-Host "Created $($lnk.FullName)"
}
