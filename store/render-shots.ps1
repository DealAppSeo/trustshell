# Draw the three 1280x800 listing shots. The words are the stamp labels.
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot 'screenshots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Shot([string]$path, [string]$reply, [string]$stamp, [string]$extra) {
  $bmp = New-Object System.Drawing.Bitmap 1280, 800
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(250, 250, 249))

  $titleFont = New-Object System.Drawing.Font 'Segoe UI', 20, ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font 'Segoe UI', 18
  $stampFont = New-Object System.Drawing.Font 'Segoe UI', 11, ([System.Drawing.FontStyle]::Bold)
  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(17, 24, 39))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(156, 163, 175))
  $card = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(229, 231, 235)), 1

  $g.FillRectangle($card, 200, 160, 880, 420)
  $g.DrawRectangle($pen, 200, 160, 880, 420)
  $g.DrawString('TrustShell', $titleFont, $ink, 240, 200)
  $g.DrawString('Assistant reply', $stampFont, $muted, 240, 260)
  if ($reply) { $g.DrawString($reply, $bodyFont, $ink, 240, 300) }

  $stampColor = $ink
  $stampPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(17, 24, 39)), 1
  if ($stamp -eq 'Not checked') {
    $stampColor = $muted
    $stampPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(229, 231, 235)), 1
  }
  $g.DrawRectangle($stampPen, 240, 390, 200, 28)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $box = New-Object System.Drawing.RectangleF 240, 390, 200, 28
  $g.DrawString($stamp, $stampFont, $stampColor, $box, $format)
  if ($extra) { $g.DrawString($extra, $bodyFont, $ink, 240, 440) }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $titleFont.Dispose()
  $bodyFont.Dispose()
  $stampFont.Dispose()
}

New-Shot (Join-Path $outDir 'pass.png') '2 + 2 = 4.' 'Checks out' ''
New-Shot (Join-Path $outDir 'veto.png') 'This answer invents a source.' 'Caught' 'Checked and found false.'
New-Shot (Join-Path $outDir 'not-checked.png') '' 'Not checked' 'No reply was there to check.'
