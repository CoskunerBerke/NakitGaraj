<#
  ZAMANLANMIS GOREVI KURAR - her 3 gunde bir 22:30.

  GOREV YALNIZCA KULLANICI OTURUM ACMISKEN CALISIR. Haftalik kosu, gercek
  Chrome'daki uzantiyla surulur; oturumsuz (Session 0) calisma o tarayiciyi
  goremez. Bu yuzden parola SAKLANMAZ: gorev etkilesimli oturumda, mevcut
  kullanicinin kimligiyle calisir.
#>
[CmdletBinding()]
param(
    [string] $TaskName = 'NakitGaraj Market Refresh',
    [string] $At = '22:30',
    [int] $EveryDays = 3,
    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'scheduled-market-refresh.ps1'
if (-not (Test-Path -LiteralPath $runner)) { throw "Runner not found: $runner" }

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing -and -not $Force) {
    Write-Host "Task '$TaskName' already exists; updating it in place (use -Force to recreate)."
}

# -File kullanilir: alinti kurallari -Command'a gore cok daha ongorulebilir.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $runner) `
    -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Daily -DaysInterval $EveryDays -At $At

# Etkilesimli oturum: parola yok, Chrome gorunur oturumda.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 14) `
    -RestartCount 0
# Kacirilan calistirma hemen degil, kisa bir gecikmeyle denensin.
$settings.StartWhenAvailable = $true

$description = @"
Runs the NakitGaraj weekly market refresh every $EveryDays days at $At.
Resumes an incomplete automation run instead of starting a new one, refuses to
start a second crawler, refuses to start on low disk, and only starts inside
the 21:30-06:30 night window. Requires an interactive logged-on session because
the crawl is driven by the Chrome autopilot extension.
Runner: $runner
"@

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Description $description -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host ''
Write-Host '  MARKET REFRESH SCHEDULE INSTALLED'
Write-Host ''
Write-Host ("  task            {0}" -f $task.TaskName)
Write-Host ("  state           {0}" -f $task.State)
Write-Host ("  runs as         {0} (logon type: {1})" -f $task.Principal.UserId, $task.Principal.LogonType)
Write-Host ("  schedule        every {0} day(s) at {1}" -f $EveryDays, $At)
Write-Host ("  next run time   {0}" -f $info.NextRunTime)
Write-Host ("  wake to run     {0}" -f $task.Settings.WakeToRun)
Write-Host ("  start when available {0}" -f $task.Settings.StartWhenAvailable)
Write-Host ("  execution limit {0}" -f $task.Settings.ExecutionTimeLimit)
Write-Host ("  runner          {0}" -f $runner)
Write-Host ''
Write-Host '  The task will not start a crawler outside 21:30-06:30, and it never'
Write-Host '  passes -IgnoreScheduleWindow.'
Write-Host ''
