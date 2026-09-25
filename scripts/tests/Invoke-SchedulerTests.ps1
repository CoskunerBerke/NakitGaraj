<#
  ZAMANLAYICI KARAR TESTLERI

  Pester 5 bu makinede yok (yalnizca 3.4). Bagimlilik eklemek yerine kucuk
  bir dogrulama kosumu kullanilir; testler gercek modul fonksiyonlarini
  gercek dosya sistemi kurgulari uzerinde calistirir.

  HICBIR TEST CRAWLER BASLATMAZ ve hicbiri kanonik veriye dokunmaz;
  her kurgu gecici dizinde kurulur.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptsDir = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $scriptsDir 'MarketScheduler.psm1') -Force

$script:Pass = 0
$script:Fail = 0
$script:Failures = New-Object System.Collections.Generic.List[string]

function It {
    param([string] $Name, [scriptblock] $Body)
    try {
        & $Body
        $script:Pass++
        Write-Host ("  PASS  {0}" -f $Name) -ForegroundColor Green
    } catch {
        $script:Fail++
        $script:Failures.Add("$Name :: $($_.Exception.Message)")
        Write-Host ("  FAIL  {0}" -f $Name) -ForegroundColor Red
        Write-Host ("        {0}" -f $_.Exception.Message) -ForegroundColor DarkRed
    }
}
function Assert-Equal {
    param($Expected, $Actual, [string] $Because = '')
    if ("$Expected" -ne "$Actual") { throw "expected '$Expected', got '$Actual' $Because" }
}
function Assert-True { param([bool] $Condition, [string] $Because = '') if (-not $Condition) { throw "expected true: $Because" } }
function Assert-False { param([bool] $Condition, [string] $Because = '') if ($Condition) { throw "expected false: $Because" } }

# --------------------------------------------------------------- kurgular
$root = Join-Path ([IO.Path]::GetTempPath()) ("ng-sched-tests-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $root -Force | Out-Null

function New-RunFixture {
    param(
        [Parameter(Mandatory)][string] $RunsDir,
        [Parameter(Mandatory)][string] $RunId,
        [Parameter(Mandatory)][string] $State,
        [int] $Pending = 0, [int] $InProgress = 0, [int] $Complete = 0, [int] $Failed = 0,
        [datetime] $UpdatedAt = (Get-Date)
    )
    $dir = Join-Path $RunsDir $RunId
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $items = @()
    1..$Pending | ForEach-Object { if ($Pending -gt 0) { $items += @{ status = 'PENDING' } } }
    1..$InProgress | ForEach-Object { if ($InProgress -gt 0) { $items += @{ status = 'IN_PROGRESS' } } }
    1..$Complete | ForEach-Object { if ($Complete -gt 0) { $items += @{ status = 'COMPLETE' } } }
    1..$Failed | ForEach-Object { if ($Failed -gt 0) { $items += @{ status = 'INCOMPLETE' } } }
    $payload = @{
        version = 'weekly-market-session-v2'; runId = $RunId; state = $State
        updatedAt = $UpdatedAt.ToUniversalTime().ToString('o'); items = $items
    }
    @{ checksum = 'test'; payload = $payload } | ConvertTo-Json -Depth 8 |
        Set-Content -LiteralPath (Join-Path $dir 'checkpoint.json') -Encoding utf8
    $dir
}

Write-Host ''
Write-Host '  MARKET SCHEDULER - DECISION TESTS'
Write-Host ''

# A) hic otomatik kosu yok -> YENI
It 'A) no previous automation run -> NEW' {
    $runs = Join-Path $root 'A\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00')
    Assert-Equal 'NEW' $d.Action
    Assert-Equal 'market-auto-2026-09-24-2230' $d.RunId
    Assert-False $d.Resumed
}

# B) yarim otomatik kosu -> DEVAM (ayni kimlik)
It 'B) incomplete automation run -> RESUME the same run id' {
    $runs = Join-Path $root 'B\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-auto-2026-09-21-2230' -State 'RUNNING' -Pending 120 -Complete 80 | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00')
    Assert-Equal 'RESUME' $d.Action
    Assert-Equal 'market-auto-2026-09-21-2230' $d.RunId
    Assert-True $d.Resumed
}

# C) onceki otomatik kosu COMPLETE -> YENI
It 'C) completed automation run -> NEW' {
    $runs = Join-Path $root 'C\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-auto-2026-09-21-2230' -State 'COMPLETE' -Complete 6205 | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00')
    Assert-Equal 'NEW' $d.Action
    Assert-Equal 'market-auto-2026-09-24-2230' $d.RunId
}

It 'C2) INCOMPLETE run with nothing pending is terminal -> NEW (no resume loop)' {
    $runs = Join-Path $root 'C2\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-auto-2026-09-21-2230' -State 'INCOMPLETE' -Complete 20 -Failed 5 | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00')
    Assert-Equal 'NEW' $d.Action
}

It 'C3) ACCESS_RESTRICTED run with pending work is resumable' {
    $runs = Join-Path $root 'C3\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-auto-2026-09-21-2230' -State 'ACCESS_RESTRICTED' -Pending 900 -Complete 100 | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00')
    Assert-Equal 'RESUME' $d.Action
}

It 'C4) a manual run is never adopted automatically, but is reported' {
    $runs = Join-Path $root 'C4\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'RUNNING' -Pending 2398 -Complete 3800 | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00')
    Assert-Equal 'NEW' $d.Action
    Assert-Equal 1 @($d.ForeignResumable).Count
    Assert-Equal 'market-baseline-6205-2026-09-08' $d.ForeignResumable[0].RunId
}

It 'C5) -AdoptRunId resumes a named manual run on purpose' {
    $runs = Join-Path $root 'C5\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'RUNNING' -Pending 2398 -Complete 3800 | Out-Null
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -AdoptRunId 'market-baseline-6205-2026-09-08'
    Assert-Equal 'RESUME' $d.Action
    Assert-Equal 'market-baseline-6205-2026-09-08' $d.RunId
}

# D/E/F) kilit
It 'D) live lock -> SKIP' {
    $lock = [pscustomobject]@{ pid = 4242; runId = 'market-auto-x'; startedAt = (Get-Date).ToString('o') }
    $d = Get-LockDecision -Lock $lock -ProcessAlive $true -PortBusy $false
    Assert-Equal 'SKIP' $d.Action
}
It 'E) stale lock (dead pid, free port) -> RECOVER' {
    $lock = [pscustomobject]@{ pid = 999999; runId = 'market-auto-x'; startedAt = (Get-Date).ToString('o') }
    $d = Get-LockDecision -Lock $lock -ProcessAlive $false -PortBusy $false
    Assert-Equal 'RECOVER' $d.Action
}
It 'F) dead pid but busy bridge port -> SKIP (never assume stale)' {
    $lock = [pscustomobject]@{ pid = 999999; runId = 'market-auto-x'; startedAt = (Get-Date).ToString('o') }
    $d = Get-LockDecision -Lock $lock -ProcessAlive $false -PortBusy $true
    Assert-Equal 'SKIP' $d.Action
}
It 'F2) no lock but the bridge port is busy -> SKIP' {
    $d = Get-LockDecision -Lock $null -ProcessAlive $false -PortBusy $true
    Assert-Equal 'SKIP' $d.Action
}
It 'F3) no lock and free port -> PROCEED' {
    $d = Get-LockDecision -Lock $null -ProcessAlive $false -PortBusy $false
    Assert-Equal 'PROCEED' $d.Action
}
It 'F4) a live pid is detected for this very process' {
    Assert-True (Test-SchedulerProcessAlive -ProcessId $PID) 'current process must look alive'
    Assert-False (Test-SchedulerProcessAlive -ProcessId 999999) 'pid 999999 must not look alive'
}

# H/I) gece penceresi
It 'H) outside the night window -> not allowed' {
    Assert-False (Test-InNightWindow -Now ([datetime]'2026-09-24T14:00:00')) '14:00'
    Assert-False (Test-InNightWindow -Now ([datetime]'2026-09-24T21:29:00')) '21:29'
    Assert-False (Test-InNightWindow -Now ([datetime]'2026-09-24T06:30:00')) '06:30 is the exclusive end'
}
It 'I) inside the night window -> allowed (including after midnight)' {
    Assert-True (Test-InNightWindow -Now ([datetime]'2026-09-24T22:30:00')) '22:30'
    Assert-True (Test-InNightWindow -Now ([datetime]'2026-09-25T00:40:00')) '00:40'
    Assert-True (Test-InNightWindow -Now ([datetime]'2026-09-25T06:29:00')) '06:29'
}

# J) veri baglantisi
It 'J) a real directory is not accepted as a data junction' {
    $link = Join-Path $root 'J\data'; New-Item -ItemType Directory -Path $link -Force | Out-Null
    $canonical = Join-Path $root 'J\canonical'; New-Item -ItemType Directory -Path $canonical -Force | Out-Null
    $r = Test-DataLink -LinkPath $link -CanonicalPath $canonical
    Assert-False $r.Healthy 'a plain directory must not pass'
    Assert-True ($r.Reason -like '*real directory*') $r.Reason
}
It 'J2) a missing link path is not healthy' {
    $r = Test-DataLink -LinkPath (Join-Path $root 'J\nope') -CanonicalPath $root
    Assert-False $r.Healthy $r.Reason
}
It 'J3) a junction to the canonical directory is healthy and sees the same file' {
    $canonical = Join-Path $root 'J3\canonical'; New-Item -ItemType Directory -Path $canonical -Force | Out-Null
    'probe-content' | Set-Content -LiteralPath (Join-Path $canonical 'current.json') -Encoding utf8
    $link = Join-Path $root 'J3\link'
    New-Item -ItemType Directory -Path (Split-Path $link -Parent) -Force | Out-Null
    New-Item -ItemType Junction -Path $link -Target $canonical | Out-Null
    $r = Test-DataLink -LinkPath $link -CanonicalPath $canonical -ProbeRelativePath 'current.json'
    Assert-True $r.Healthy $r.Reason
    Assert-True $r.SameFile 'probe must resolve to the same file'
}
It 'J4) a junction pointing somewhere else is rejected' {
    $canonical = Join-Path $root 'J4\canonical'; New-Item -ItemType Directory -Path $canonical -Force | Out-Null
    $other = Join-Path $root 'J4\other'; New-Item -ItemType Directory -Path $other -Force | Out-Null
    $link = Join-Path $root 'J4\link'
    New-Item -ItemType Junction -Path $link -Target $other | Out-Null
    $r = Test-DataLink -LinkPath $link -CanonicalPath $canonical
    Assert-False $r.Healthy $r.Reason
}

# M) atomik son-calistirma yazimi
It 'M) last-run.json is written atomically and reads back' {
    $file = Join-Path $root 'M\last-run.json'
    Write-JsonAtomic -Path $file -Object ([ordered]@{ runId = 'market-auto-1'; classification = 'COMPLETE'; exitCode = 0 })
    $back = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    Assert-Equal 'market-auto-1' $back.runId
    Assert-Equal 0 @(Get-ChildItem -LiteralPath (Split-Path $file -Parent) -Filter '*.tmp-*').Count 'no temp file may survive'
}

# Q) checkpoint okuma
It 'Q) checkpoint states are read from the envelope, not guessed' {
    $runs = Join-Path $root 'Q\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    $dir = New-RunFixture -RunsDir $runs -RunId 'market-auto-q' -State 'RUNNING' -Pending 3 -InProgress 1 -Complete 7 -Failed 2
    $state = Read-WeeklyCheckpoint -RunDir $dir
    Assert-Equal 'RUNNING' $state.State
    Assert-Equal 3 $state.Pending
    Assert-Equal 1 $state.InProgress
    Assert-Equal 7 $state.Complete
    Assert-Equal 2 $state.Failed
    Assert-True (Test-RunResumable $state) 'pending work means resumable'
}
It 'Q2) an unreadable checkpoint is reported, not thrown' {
    $runs = Join-Path $root 'Q2\runs'; $dir = Join-Path $runs 'market-auto-bad'
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    'not json' | Set-Content -LiteralPath (Join-Path $dir 'checkpoint.json') -Encoding utf8
    $state = Read-WeeklyCheckpoint -RunDir $dir
    Assert-Equal 'UNREADABLE' $state.State
    Assert-False (Test-RunResumable $state) 'an unreadable run is never resumed'
}
It 'Q3) a run directory without a checkpoint is ignored' {
    $runs = Join-Path $root 'Q3\runs'; New-Item -ItemType Directory -Path (Join-Path $runs 'empty-run') -Force | Out-Null
    Assert-Equal 0 @(Get-WeeklyRuns -RunsDir $runs).Count
}

# P) komut argumanlari - kostorucu betiginden okunarak dogrulanir
It 'P) the runner builds the documented weekly command' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    foreach ($needle in @("'--mode', 'weekly'", "'--run-id'", "'--all-targets'", "'--pace-mode'", "'--initial-baseline-pages'", "'--port'")) {
        Assert-True ($runner.Contains($needle)) "runner must pass $needle"
    }
    Assert-True ($runner.Contains('--target-limit')) 'runner must support the bounded canary flag'
}
It 'P2) the scheduled task never skips the night window' {
    $install = Get-Content -LiteralPath (Join-Path $scriptsDir 'install-market-schedule.ps1') -Raw
    # Yalnizca goreve verilen ARGUMAN satiri denetlenir; aciklama metninde
    # bayragin adi gecebilir.
    $argLine = ($install -split "`n" | Where-Object { $_ -match '-Argument\s' }) -join ' '
    Assert-True ([bool]$argLine) 'install must build a task action argument line'
    Assert-False ($argLine.Contains('-IgnoreScheduleWindow')) 'the installed action must not pass -IgnoreScheduleWindow'
    Assert-True ($install.Contains('LogonType Interactive')) 'task must run in the interactive session'
    Assert-True ($install.Contains('MultipleInstances IgnoreNew')) 'task must not start a second instance'
}
It 'O) uninstall only removes the task' {
    $uninstall = Get-Content -LiteralPath (Join-Path $scriptsDir 'uninstall-market-schedule.ps1') -Raw
    Assert-True ($uninstall.Contains('Unregister-ScheduledTask')) 'must unregister the task'
    foreach ($forbidden in @('Remove-Item -Recurse', 'rmdir', 'del ', 'Clear-Content')) {
        Assert-False ($uninstall.Contains($forbidden)) "uninstall must not contain '$forbidden'"
    }
}
It 'N) install is idempotent by using -Force on Register-ScheduledTask' {
    $install = Get-Content -LiteralPath (Join-Path $scriptsDir 'install-market-schedule.ps1') -Raw
    Assert-True ($install.Contains('Register-ScheduledTask')) 'must register'
    Assert-True ($install.Contains('-Force')) 'must update in place instead of duplicating'
}
It 'K/L) access wall and precheck failure never launch a crawler' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    $preIdx = $runner.IndexOf("Classification 'PRECHECK_FAILED'")
    $startIdx = $runner.IndexOf('bridge started')
    Assert-True ($preIdx -gt 0 -and $startIdx -gt $preIdx) 'preflight failure must exit before the bridge is started'
    Assert-True ($runner.Contains("'ACCESS_WALL'")) 'access wall must be classified'
    Assert-False ($runner.Contains('Start-Sleep -Seconds 300')) 'there must be no retry loop inside one night'
}

# ------------------------------------------- tek seferlik devralma (bootstrap)

function New-BootstrapConfig {
    param([string] $Path, [string] $RunId, [string] $Status = 'PENDING')
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $obj = [ordered]@{ runId = $RunId }
    if ($Status -ne 'PENDING') { $obj.status = $Status }
    Write-JsonAtomic -Path $Path -Object $obj
    Read-BootstrapRun -Path $Path
}

It 'BS1) no bootstrap config -> normal market-auto behaviour' {
    $runs = Join-Path $root 'BS1\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'RUNNING' -Pending 2398 -Complete 3800 | Out-Null
    $cfg = Read-BootstrapRun -Path (Join-Path $root 'BS1\bootstrap-run.json')
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -Bootstrap $cfg
    Assert-Equal 'NEW' $d.Action
    Assert-True ($d.RunId -like 'market-auto-*') 'must open its own run'
}

It 'BS2) configured bootstrap run that is incomplete -> RESUME_BOOTSTRAP' {
    $runs = Join-Path $root 'BS2\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'RUNNING' -Pending 2398 -Complete 3800 | Out-Null
    $cfg = New-BootstrapConfig -Path (Join-Path $root 'BS2\bootstrap-run.json') -RunId 'market-baseline-6205-2026-09-08'
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -Bootstrap $cfg
    Assert-Equal 'RESUME_BOOTSTRAP' $d.Action
    Assert-Equal 'market-baseline-6205-2026-09-08' $d.RunId
    Assert-True $d.Resumed 'bootstrap adoption is a resume'
}

It 'BS3) bootstrap run COMPLETE -> not resumed, adoption is finished' {
    $runs = Join-Path $root 'BS3\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'COMPLETE' -Complete 6205 | Out-Null
    $cfg = New-BootstrapConfig -Path (Join-Path $root 'BS3\bootstrap-run.json') -RunId 'market-baseline-6205-2026-09-08'
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -Bootstrap $cfg
    Assert-Equal 'BOOTSTRAP_COMPLETED' $d.Action
    Assert-False $d.Resumed 'a completed bootstrap run is never resumed'
}

It 'BS4) an arbitrary manual run is still never adopted, even with a bootstrap config for another run' {
    $runs = Join-Path $root 'BS4\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'COMPLETE' -Complete 6205 | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'someone-elses-run' -State 'RUNNING' -Pending 50 -Complete 5 | Out-Null
    $cfg = New-BootstrapConfig -Path (Join-Path $root 'BS4\bootstrap-run.json') -RunId 'market-baseline-6205-2026-09-08' -Status 'COMPLETED'
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -Bootstrap $cfg
    Assert-Equal 'NEW' $d.Action
    Assert-True ($d.ForeignResumable.RunId -contains 'someone-elses-run') 'the manual run is reported'
}

It 'BS5) completing the adoption is atomic and switches behaviour back' {
    $path = Join-Path $root 'BS5\bootstrap-run.json'
    $runs = Join-Path $root 'BS5\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'COMPLETE' -Complete 6205 | Out-Null
    New-BootstrapConfig -Path $path -RunId 'market-baseline-6205-2026-09-08' | Out-Null
    Complete-BootstrapRun -Path $path -RunId 'market-baseline-6205-2026-09-08'
    $after = Read-BootstrapRun -Path $path
    Assert-Equal 'COMPLETED' $after.Status
    Assert-True ([bool]$after.CompletedAt) 'completion is timestamped'
    Assert-Equal 0 @(Get-ChildItem -LiteralPath (Split-Path $path -Parent) -Filter '*.tmp-*').Count 'atomic write leaves no temp file'
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-27T22:30:00') -Bootstrap $after
    Assert-Equal 'NEW' $d.Action
}

It 'BS6) no fresh market-auto run is opened while the bootstrap run is incomplete' {
    $runs = Join-Path $root 'BS6\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'INCOMPLETE' -Pending 2398 -Complete 3800 | Out-Null
    $cfg = New-BootstrapConfig -Path (Join-Path $root 'BS6\bootstrap-run.json') -RunId 'market-baseline-6205-2026-09-08'
    foreach ($night in @('2026-09-24T22:30:00', '2026-09-27T22:30:00', '2026-09-30T22:30:00')) {
        $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]$night) -Bootstrap $cfg
        Assert-Equal 'RESUME_BOOTSTRAP' $d.Action
        Assert-False ($d.RunId -like 'market-auto-*') "no new auto run on $night"
    }
}

It 'BS7) a configured bootstrap run that does not exist refuses instead of guessing' {
    $runs = Join-Path $root 'BS7\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    $cfg = New-BootstrapConfig -Path (Join-Path $root 'BS7\bootstrap-run.json') -RunId 'no-such-run'
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -Bootstrap $cfg
    Assert-Equal 'BOOTSTRAP_MISSING' $d.Action
}

It 'BS8) a bootstrap run with no pending work and no COMPLETE state refuses' {
    $runs = Join-Path $root 'BS8\runs'; New-Item -ItemType Directory -Path $runs -Force | Out-Null
    New-RunFixture -RunsDir $runs -RunId 'market-baseline-6205-2026-09-08' -State 'INCOMPLETE' -Complete 6199 -Failed 6 | Out-Null
    $cfg = New-BootstrapConfig -Path (Join-Path $root 'BS8\bootstrap-run.json') -RunId 'market-baseline-6205-2026-09-08'
    $d = Get-RunDecision -Runs (Get-WeeklyRuns -RunsDir $runs) -Now ([datetime]'2026-09-24T22:30:00') -Bootstrap $cfg
    Assert-Equal 'BOOTSTRAP_UNUSABLE' $d.Action
}

# ------------------------------------------------- ilerleme tespiti (izleme)

It 'PR1) a resumed run whose checkpoint has not moved counts as NO progress' {
    # Bu, gercek bir hatadan gelen test: devam ettirilen kosunun checkpoint'i
    # zaten RUNNING yaziyordu ve izleyici uzanti hic baglanmadan "ilerliyor" sandi.
    $baseline = [datetime]'2026-09-17T08:59:13'
    $current = [pscustomobject]@{ State = 'RUNNING'; UpdatedAt = [datetime]'2026-09-17T08:59:13' }
    Assert-False (Test-CheckpointProgressed -Baseline $baseline -Current $current) 'same timestamp is not progress'
}

It 'PR2) a newer checkpoint timestamp counts as progress' {
    $baseline = [datetime]'2026-09-17T08:59:13'
    $current = [pscustomobject]@{ State = 'RUNNING'; UpdatedAt = [datetime]'2026-09-25T22:31:00' }
    Assert-True (Test-CheckpointProgressed -Baseline $baseline -Current $current) 'a later write is progress'
}

It 'PR3) a brand new run (no earlier checkpoint) counts its first write as progress' {
    $current = [pscustomobject]@{ State = 'RUNNING'; UpdatedAt = (Get-Date) }
    Assert-True (Test-CheckpointProgressed -Baseline $null -Current $current) 'first checkpoint is progress'
    Assert-False (Test-CheckpointProgressed -Baseline $null -Current $null) 'no checkpoint at all is not progress'
}

It 'PR4) the runner measures progress by timestamp, never by state alone' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    Assert-True ($runner.Contains('Test-CheckpointProgressed -Baseline $baselineUpdatedAt')) 'progress is measured against the baseline timestamp'
    Assert-False ($runner.Contains("if (`$state.State -eq 'RUNNING') { `$sawProgress = `$true }")) 'the old state-only shortcut is gone'
}

It 'PR5) the bridge stop signal is delivered by a separate process' {
    # Zamanlayici kendi gonderdigi CTRL+C ile olduyse kosu siniflandirilamaz.
    $module = Get-Content -LiteralPath (Join-Path $scriptsDir 'MarketScheduler.psm1') -Raw
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    Assert-True ($module.Contains('function Stop-BridgeGracefully')) 'a dedicated stop helper exists'
    Assert-True ($module.Contains('-EncodedCommand')) 'the signal is sent from a separate powershell process'
    Assert-True ($runner.Contains('Stop-BridgeGracefully -ProcessId $proc.Id')) 'the runner uses it'
    Assert-False ($runner.Contains('AttachConsole')) 'the scheduler never attaches to the child console itself'
}

# ----------------------------------------------------------------- chrome

It 'CH1) the automation profile is proven from Chrome own files, or not claimed at all' {
    $profile = Get-ChromeAutomationProfile
    if ($profile) {
        Assert-True ([bool]$profile.ProfileDirectory) 'a profile directory must be named'
        Assert-True ($profile.ExtensionPath -like '*market-refresh-autopilot*') 'must be proven by the extension path'
        Assert-True $profile.Unpacked 'the working extension is loaded unpacked'
        Assert-True ([bool]$profile.ProvenBy) 'the proof must be stated'
    } else {
        Write-Host '        (no automation profile on this machine; scheduler would refuse to start)' -ForegroundColor DarkYellow
    }
}

It 'CH2) an unknown user-data-dir yields no profile instead of a guess' {
    $fake = Join-Path $root 'CH2\no-chrome-here'
    New-Item -ItemType Directory -Path $fake -Force | Out-Null
    Assert-Equal $null (Get-ChromeAutomationProfile -UserDataDir $fake)
}

It 'CH3) a chrome running with a different profile is not treated as automation chrome' {
    $profile = [pscustomobject]@{
        UserDataDir = 'C:\Users\test\AppData\Local\Google\Chrome\User Data'
        ProfileDirectory = 'Profile 9'; LastUsedProfile = 'Default'
    }
    $state = Test-AutomationChromeRunning -Profile $profile
    Assert-False $state.Running 'profile 9 does not exist, so automation chrome is not running'
}

It 'CH4) chrome cleanup only ever targets the pids it was given' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    Assert-True ($runner.Contains('$script:ChromeStartedByScheduler -and')) 'cleanup is gated on ownership'
    Assert-True ($runner.Contains('Stop-SchedulerChrome -ProcessIds $script:ChromePids')) 'cleanup passes only its own pids'
    $module = Get-Content -LiteralPath (Join-Path $scriptsDir 'MarketScheduler.psm1') -Raw
    Assert-False ($module -match 'Stop-Process[^\r\n]*chrome') 'chrome is never force-killed by name'
    Assert-True ($module.Contains('CloseMainWindow')) 'chrome is asked to close, not killed'
}

It 'CH5) a user chrome window is never closed by the scheduler' {
    $module = Get-Content -LiteralPath (Join-Path $scriptsDir 'MarketScheduler.psm1') -Raw
    # Stop-SchedulerChrome yalnizca verilen pid listesini dolasir.
    $fn = [regex]::Match($module, 'function Stop-SchedulerChrome[\s\S]*?\n\}').Value
    Assert-True ($fn.Contains('foreach ($id in @($ProcessIds))')) 'it iterates only the supplied pids'
    Assert-False ($fn.Contains('Get-Process chrome')) 'it never enumerates chrome by name'
}

It 'CH6) the runner classifies a missing extension connection distinctly' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    Assert-True ($runner.Contains("'CHROME_EXTENSION_NOT_CONNECTED'")) 'classification exists'
    Assert-True ($runner.Contains('$extensionDeadline')) 'there is a bounded wait'
    Assert-False ($runner.Contains('while ($true) { Start-Process')) 'no retry spam'
}

It 'CH7) dry run and preflight never launch chrome or the crawler' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    $dryIdx = $runner.IndexOf("Classification 'DRY_RUN'")
    $chromeIdx = $runner.IndexOf('Start-AutomationChrome')
    $bridgeIdx = $runner.IndexOf('bridge started')
    Assert-True ($dryIdx -gt 0) 'dry run exits'
    Assert-True ($chromeIdx -gt $dryIdx) 'chrome launch happens after the dry-run exit'
    Assert-True ($bridgeIdx -gt $dryIdx) 'bridge start happens after the dry-run exit'
    $preIdx = $runner.IndexOf("Classification 'PRECHECK_PASSED'")
    Assert-True ($preIdx -gt 0 -and $chromeIdx -gt $preIdx) 'preflight-only exits before chrome is launched'
}

It 'CH8) preserved behaviour: lock, disk guard and junction checks still gate the run' {
    $runner = Get-Content -LiteralPath (Join-Path $scriptsDir 'scheduled-market-refresh.ps1') -Raw
    foreach ($needle in @('Get-LockDecision', "Classification 'LOW_DISK'", 'data junction (market)', 'data junction (hierarchy)', "Classification 'ACCESS_WALL'", "Classification 'SKIPPED_OUTSIDE_NIGHT_WINDOW'")) {
        Assert-True ($runner.Contains($needle)) "still present: $needle"
    }
}

Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host ("  {0} passed, {1} failed" -f $script:Pass, $script:Fail)
if ($script:Fail -gt 0) {
    Write-Host ''
    foreach ($f in $script:Failures) { Write-Host "  - $f" -ForegroundColor Red }
    exit 1
}
Write-Host ''
exit 0
