$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$built = Join-Path $root 'dist\index.html'

if (-not (Test-Path $built)) {
  Write-Host 'BiteZone is not built yet. In this folder run: npm install'
  Write-Host 'Then run: npm run build'
  exit 1
}
if (-not (Test-Path $electron)) {
  Write-Host 'The BiteZone program is missing. In this folder run: npm install'
  exit 1
}

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

$iconPath = Join-Path $root 'bitezone.ico'
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$stream = [System.IO.File]::Create($iconPath)
$icon.Save($stream)
$stream.Close()
$bmp.Dispose()

$shell = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop 'BiteZone Counter.lnk'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $electron
$shortcut.Arguments = "`"$root`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'BiteZone Counter'
$shortcut.Save()

Write-Host "BiteZone Counter is on the Desktop."
Write-Host $shortcutPath
