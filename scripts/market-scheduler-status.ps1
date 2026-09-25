<#
  SABAH KOMUTU - tek bakista "gece ne oldu?"

  Bilinmeyen deger UYDURULMAZ: okunamayan her alan "unknown" yazar.
#>
[CmdletBinding()]
param(
    [string] $TaskName = 'NakitGaraj Market Refresh',
    [int] $Port = 8791
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'MarketScheduler.psm1') -Force
$paths = Get-SchedulerPaths -RepoRoot $repoRoot
$canonicalData = 'C:\dev\NakitGaraj-market-refresh\backend\data'

# Write-Host ile yazilir: Write-Output kullanilsaydi iki akis karisir ve
# basliklar ciktinin basina toplanirdi.
function Field { param([string] $Name, $Value) Write-Host ('  {0,-24} {1}' -f $Name, $(if ($null -eq $Value -or "$Value" -eq '') { 'unknown' } else { $Value })) }
function Size { param([double] $Bytes) if ($Bytes -ge 1GB) { '{0:N2} GB' -f ($Bytes / 1GB) } elseif ($Bytes -ge 1MB) { '{0:N0} MB' -f ($Bytes / 1MB) } else { '{0:N0} KB' -f ($Bytes / 1KB) } }

Write-Host ''
Write-Host '  NAKITGARAJ MARKET REFRESH - SCHEDULER STATUS'
Write-Host ''

# --------------------------------------------------------------- gorev
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$info = if ($task) { Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue } else { $null }
Field 'Task installed' $(if ($task) { 'yes' } else { 'no' })
Field 'Task enabled' $(if ($task) { $task.State } else { $null })
Field 'Next scheduled run' $(if ($info) { $info.NextRunTime } else { $null })
Field 'Last scheduled run' $(if ($info) { $info.LastRunTime } else { $null })
Field 'Last task result' $(if ($info) { '0x{0:X}' -f $info.LastTaskResult } else { $null })
Write-Host ''

# ------------------------------------------------------- son calistirma
$last = if (Test-Path -LiteralPath $paths.LastRunFile) { Get-Content -LiteralPath $paths.LastRunFile -Raw | ConvertFrom-Json } else { $null }
Field 'Last classification' $(if ($last) { $last.classification } else { $null })
Field 'Last run ID' $(if ($last) { $last.runId } else { $null })
Field 'Last started' $(if ($last) { $last.startedAt } else { $null })
Field 'Last ended' $(if ($last) { $last.endedAt } else { $null })
Field 'Last duration' $(if ($last) { '{0} min' -f [math]::Round($last.durationSeconds / 60, 1) } else { $null })
Field 'Last resumed' $(if ($last) { $last.resumed } else { $null })
if ($last -and $last.reason) { Field 'Last reason' $last.reason }
Write-Host ''

# ------------------------------------------------------------ canli kosu
$lock = Read-SchedulerLock -LockFile $paths.LockFile
$alive = $false
if ($lock -and $lock.pid) { $alive = Test-SchedulerProcessAlive -ProcessId ([int]$lock.pid) }
Field 'Active scheduler' $(if ($lock) { if ($alive) { 'running' } else { 'stale lock (dead pid)' } } else { 'idle' })
Field 'PID' $(if ($lock) { $lock.pid } else { 'none (no scheduler running)' })
Field 'Bridge port in use' $(Test-BridgePortBusy -Port $Port)
Write-Host ''

# -------------------------------------------------------------- crawler
$runs = Get-WeeklyRuns -RunsDir $paths.RunsDir
$auto = @($runs | Where-Object { $_.RunId -like ((Get-AutoRunPrefix) + '*') })
$newestAuto = $auto | Select-Object -First 1
Write-Host '  Crawler'
if ($newestAuto) {
    Field '  newest auto run' $newestAuto.RunId
    Field '  state' $newestAuto.State
    Field '  COMPLETE' $newestAuto.Complete
    Field '  INCOMPLETE' $newestAuto.Failed
    Field '  PENDING' ($newestAuto.Pending + $newestAuto.InProgress)
    Field '  updated' $newestAuto.UpdatedAt
} else {
    Field '  newest auto run' 'none yet'
}
$bootstrap = Read-BootstrapRun -Path $paths.BootstrapFile
$adoptedId = if ($bootstrap -and $bootstrap.Status -eq 'PENDING') { $bootstrap.RunId } else { $null }
$foreign = @($runs | Where-Object { $_.RunId -notlike ((Get-AutoRunPrefix) + '*') -and (Test-RunResumable $_) -and $_.RunId -ne $adoptedId })
foreach ($f in $foreign) {
    Field '  manual run pending' ('{0} (state {1}, {2} pending) - not adopted automatically' -f $f.RunId, $f.State, $f.Pending)
}
Write-Host ''

# ------------------------------------------------- tek seferlik devralma
Field 'Bootstrap run' $(if ($bootstrap) { $bootstrap.RunId } else { 'none configured' })
Field 'Bootstrap status' $(if ($bootstrap) { $bootstrap.Status } else { 'n/a' })
if ($bootstrap -and $bootstrap.RunId) {
    $bRun = @($runs | Where-Object { $_.RunId -eq $bootstrap.RunId }) | Select-Object -First 1
    if ($bRun) {
        Field 'Bootstrap pending' ($bRun.Pending + $bRun.InProgress)
        Field 'Bootstrap complete' ('{0} / {1} (state {2})' -f $bRun.Complete, $bRun.Total, $bRun.State)
    } else {
        Field 'Bootstrap pending' 'run not found under the weekly runs directory'
        Field 'Bootstrap complete' $null
    }
}
Write-Host ''

# ---------------------------------------------------------------- chrome
$chromeProfile = Get-ChromeAutomationProfile
Field 'Chrome automation profile' $(
    if ($chromeProfile) { "{0}  (extension {1})" -f $chromeProfile.ProfileDirectory, $chromeProfile.ExtensionId }
    else { 'NOT FOUND - the autopilot extension is not installed in any profile' }
)
if ($chromeProfile) {
    $chromeState = Test-AutomationChromeRunning -Profile $chromeProfile
    Field 'Chrome running' $(if ($chromeState.Running) { 'yes (pid(s) ' + ($chromeState.MatchingPids -join ',') + ')' } else { 'no' })
    $active = if (Test-Path -LiteralPath $paths.ActiveRunFile) { Get-Content -LiteralPath $paths.ActiveRunFile -Raw | ConvertFrom-Json } else { $null }
    Field 'Chrome started by scheduler' $(if ($active) { $active.chromeStartedByScheduler } else { 'no active run' })
    $ext = Get-AutopilotExtensionState -ProfilePath (Join-Path $chromeProfile.UserDataDir $chromeProfile.ProfileDirectory) -ExtensionId $chromeProfile.ExtensionId
    Field 'Extension auto-start' $(if ($ext.Found) { "$($ext.AutoStart)  (best effort read)" } else { $ext.Reason })
    Field 'Extension last state' $(if ($ext.Found) { "$($ext.LastState), bridge $($ext.BridgeUrl)" } else { $null })
}
Field 'Extension bridge connected' $(
    if (Test-BridgePortBusy -Port $Port) { 'bridge port is in use (a run is up)' } else { 'no bridge running right now' }
)
Write-Host ''

# ---------------------------------------------------------------- depo
try {
    $disk = Invoke-BackendProbe -BackendDir $paths.Backend -Probe 'disk'
    Field 'Disk free' ('{0:N1} GB (minimum {1:N0} GB)' -f ($disk.freeBytes / 1GB), ($disk.minFreeBytes / 1GB))
} catch { Field 'Disk free' $null }
try {
    $pub = Invoke-BackendProbe -BackendDir $paths.Backend -Probe 'published'
    Field 'Versions files' $pub.totalFiles
    Field 'Versions size' (Size $pub.totalBytes)
    Field 'Current release' $pub.currentRelease
    Field 'Retention health' $(if ($pub.refusals.Count -gt 0) { 'REFUSING: ' + ($pub.refusals -join '; ') } elseif ($pub.deletable -gt 0) { '{0} obsolete release(s) prunable ({1})' -f $pub.deletable, (Size $pub.reclaimableBytes) } else { 'converged (nothing prunable)' })
} catch { Field 'Versions files' $null }
Write-Host ''

# ----------------------------------------------------------------- veri
$market = Test-DataLink -LinkPath $paths.MarketData -CanonicalPath (Join-Path $canonicalData 'market-refresh') -ProbeRelativePath 'weekly\published\current.json'
$hier = Test-DataLink -LinkPath $paths.HierarchyData -CanonicalPath (Join-Path $canonicalData 'vehicle-hierarchy') -ProbeRelativePath 'current.json'
Field 'Canonical data path' $canonicalData
Field 'Data junction healthy' ('market-refresh: {0}, vehicle-hierarchy: {1}' -f $market.Healthy, $hier.Healthy)
if (-not $market.Healthy) { Field '  market reason' $market.Reason }
if (-not $hier.Healthy) { Field '  hierarchy reason' $hier.Reason }
Write-Host ''

# ----------------------------------------------------------------- log
$lastLog = Get-ChildItem -LiteralPath $paths.LogDir -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Field 'Last log' $(if ($lastLog) { $lastLog.FullName } else { $null })
Write-Host ''
