param(
  [string]$Root = ''
)

$ErrorActionPreference = 'Stop'

if (-not $Root) {
  $Root = Split-Path -Parent $PSScriptRoot
}
$Root = $Root.TrimEnd('\')

function Find-Electron([string]$AppRoot) {
  $packageDir = Join-Path $AppRoot 'node_modules\electron'
  $pathFile = Join-Path $packageDir 'path.txt'
  $dist = Join-Path $packageDir 'dist'
  if (Test-Path $pathFile) {
    $relative = (Get-Content $pathFile -Raw).Trim()
    $fromFile = Join-Path $dist $relative
    if (Test-Path $fromFile) { return $fromFile }
  }
  $direct = Join-Path $dist 'electron.exe'
  if (Test-Path $direct) { return $direct }
  if (Test-Path $packageDir) {
    $found = Get-ChildItem -Path $packageDir -Filter 'electron.exe' -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

Write-Host "BiteZone folder: $Root"

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  Write-Host 'This is not the BiteZone folder. Open Command Prompt and run:'
  Write-Host 'cd /d %USERPROFILE%\Desktop\bitezone-crm-offline'
  Write-Host '"Make Desktop Icon.bat"'
  exit 1
}

$built = Join-Path $Root 'dist\index.html'
if (-not (Test-Path $built)) {
  Write-Host 'The counter is not built yet. In this folder run:'
  Write-Host 'npm run build'
  exit 1
}

$electron = Find-Electron $Root
if (-not $electron) {
  $installer = Join-Path $Root 'node_modules\electron\install.js'
  if (-not (Test-Path $installer)) {
    Write-Host 'Installing BiteZone. This can take a few minutes.'
    Push-Location $Root
    & npm install
    $npmCode = $LASTEXITCODE
    Pop-Location
    if ($npmCode -ne 0) {
      Write-Host 'npm install failed. Leave this window open and send a photo of the text above.'
      exit 1
    }
  }
  $installer = Join-Path $Root 'node_modules\electron\install.js'
  if (-not (Test-Path $installer)) {
    Write-Host 'The BiteZone program package is still missing after npm install.'
    exit 1
  }
  Write-Host 'Downloading the BiteZone program. This can take a few minutes.'
  Push-Location $Root
  & node $installer
  $downloadCode = $LASTEXITCODE
  Pop-Location
  if ($downloadCode -ne 0) {
    Write-Host 'The BiteZone program did not download. Leave this window open and send a photo of the text above.'
    exit 1
  }
  $electron = Find-Electron $Root
}

if (-not $electron) {
  Write-Host 'The BiteZone program is still missing from:'
  Write-Host (Join-Path $Root 'node_modules\electron\dist\electron.exe')
  exit 1
}

Write-Host "Program found: $electron"

$iconPath = Join-Path $Root 'bitezone.ico'
try {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap 64, 64
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 248, 241, 234))
  $bun = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 122, 62, 29))
  $patty = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 58, 36, 24))
  $base = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 196, 137, 79))
  $seed = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 246, 234, 216))
  $g.FillEllipse($bun, 8, 8, 48, 28)
  $g.FillEllipse($seed, 20, 14, 5, 5)
  $g.FillEllipse($seed, 30, 12, 4, 4)
  $g.FillEllipse($seed, 40, 16, 4, 4)
  $g.FillRectangle($patty, 8, 30, 48, 8)
  $g.FillEllipse($base, 8, 34, 48, 20)
  $g.Dispose()
  $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $stream = [System.IO.File]::Create($iconPath)
  $icon.Save($stream)
  $stream.Close()
  $bmp.Dispose()
} catch {
  $iconPath = $electron
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop 'BiteZone Counter.lnk'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $electron
$shortcut.Arguments = "`"$Root`""
$shortcut.WorkingDirectory = $Root
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'BiteZone Counter'
$shortcut.Save()

Write-Host 'BiteZone Counter is on the Desktop.'
Write-Host $shortcutPath
