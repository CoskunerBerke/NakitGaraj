<#
  ZAMANLANMIS GOREVI KALDIRIR - BASKA HICBIR SEYI SILMEZ.

  Loglar, zamanlayici durumu, kosu durumu, yayinlanmis surumler, veritabani,
  corpus, filigranlar, veri baglantilari ve worktree OLDUGU GIBI KALIR.
  Gorev kaldirmak "veriyi temizle" demek degildir.
#>
[CmdletBinding()]
param([string] $TaskName = 'NakitGaraj Market Refresh')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "Task '$TaskName' is not installed; nothing to remove."
    return
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task '$TaskName'."
Write-Host ''
Write-Host '  Left untouched on purpose:'
Write-Host '    logs\scheduled-market\            (run history)'
Write-Host '    .local\scheduler\                 (lock, last-run, active-run)'
Write-Host '    backend\data\ junctions           (canonical crawler data)'
Write-Host '    weekly run state, published releases, watermarks, DB, corpus'
Write-Host ''
Write-Host '  Reinstall with: scripts\install-market-schedule.ps1'
