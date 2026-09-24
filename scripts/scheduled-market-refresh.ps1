<#
  ZAMANLANMIS PIYASA TAZELEME - KOSTURUCU

  Her 3 gunde bir gece calisir. Sirasi:
    gece penceresi -> on kontroller -> kilit -> devam/yeni karari ->
    kopru surecini baslat -> kosu durumunu izle -> nazik durdur -> siniflandir.

  KOSU DURUMU TEK KAYNAKTAN OKUNUR: weekly checkpoint dosyasi. Ciktidaki
  metinden durum tahmin edilmez.

  TARAYICI GERCEGI: haftalik mod bir KOPRUDUR. Sayfalari kullanicinin
  Chrome'undaki `market-refresh-autopilot` uzantisi ceker. Kopru tek basina
  gezinmez; uzanti baglanmazsa kosu ilerlemez. Bu yuzden gorev yalnizca
  kullanici oturum acmisken calisir ve uzanti baglanmazsa kosu bosuna
  gece harcamadan biter.
#>
[CmdletBinding()]
param(
    # Yalnizca on kontroller; karar bile verilmez.
    [switch] $PreflightOnly,
    # Karar + komut yazdirilir, crawler BASLATILMAZ.
    [switch] $DryRun,
    # Gece penceresini atla. Zamanlanmis gorev bunu ASLA kullanmaz.
    [switch] $IgnoreScheduleWindow,
    # Elle baslatilmis bir kosuyu bilerek devralmak icin.
    [string] $AdoptRunId,
    # Kacak kosu korumasi; gece penceresiyle ilgisi yoktur.
    [double] $MaxRuntimeHours = 12,
    # Uzanti bu sure icinde baglanmazsa kosu bosuna beklemez.
    [int] $ExtensionWaitMinutes = 20,
    [int] $Port = 8791,
    [string] $PaceMode = 'overnight',
    [int] $InitialBaselinePages = 20,
    # Duman kosusu icin: yalnizca ilk N hedef.
    [int] $TargetLimit = 0,
    # Chrome kapaliysa acma (crawler'i surukleyen uzanti orada yasar).
    [switch] $NoChromeLaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSScriptRoot 'MarketScheduler.psm1') -Force
$paths = Get-SchedulerPaths -RepoRoot $repoRoot
$canonicalRepo = 'C:\dev\NakitGaraj-market-refresh'
$canonicalData = Join-Path $canonicalRepo 'backend\data'

$startedAt = Get-Date
foreach ($dir in @($paths.LogDir, $paths.StateDir)) {
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}
$logFile = Join-Path $paths.LogDir ($startedAt.ToString('yyyy-MM-dd_HH-mm-ss') + '.log')

function Write-Log {
    param([string] $Message, [string] $Level = 'INFO')
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding utf8
    Write-Host $line
}

$script:Classification = 'INTERRUPTED'
$script:ExitCode = $null
$script:RunId = $null
$script:Resumed = $false
$script:LockTaken = $false

function Complete-Invocation {
    <#
      Her cikis yolu buradan gecer: son durum makine okunur bicimde yazilir,
      kilit yalnizca BIZ aldiysak birakilir.
    #>
    param([string] $Classification, [int] $ExitCode = 0, [string] $Reason = '')
    $endedAt = Get-Date
    if ($Reason) { Write-Log "result: $Classification - $Reason" }
    else { Write-Log "result: $Classification" }

    $record = [ordered]@{
        runId           = $script:RunId
        startedAt       = $startedAt.ToString('o')
        endedAt         = $endedAt.ToString('o')
        classification  = $Classification
        exitCode        = $ExitCode
        durationSeconds = [math]::Round(($endedAt - $startedAt).TotalSeconds)
        resumed         = $script:Resumed
        logPath         = $logFile
        repoSha         = $script:RepoSha
        reason          = $Reason
        schedulerVersion = Get-SchedulerVersion
    }
    Write-JsonAtomic -Path $paths.LastRunFile -Object $record
    if ($script:LockTaken -and (Test-Path -LiteralPath $paths.LockFile)) {
        Remove-Item -LiteralPath $paths.LockFile -Force -ErrorAction SilentlyContinue
        Write-Log 'lock released'
    }
    if (Test-Path -LiteralPath $paths.ActiveRunFile) {
        Remove-Item -LiteralPath $paths.ActiveRunFile -Force -ErrorAction SilentlyContinue
    }
    Write-Log ('log: {0}' -f $logFile)
    exit $ExitCode
}

# ------------------------------------------------------------------ kimlik
$script:RepoSha = (& git -C $repoRoot rev-parse HEAD 2>$null)
$branch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
Write-Log ('scheduler v{0} starting' -f (Get-SchedulerVersion))
Write-Log ('host={0} user={1} repo={2}' -f $env:COMPUTERNAME, $env:USERNAME, $repoRoot)
Write-Log ('branch={0} sha={1}' -f $branch, $script:RepoSha)
Write-Log ('trigger={0} dryRun={1} preflightOnly={2} ignoreWindow={3}' -f `
    $(if ($env:SCHEDULED_TASK_TRIGGER) { $env:SCHEDULED_TASK_TRIGGER } else { 'manual' }), `
    [bool]$DryRun, [bool]$PreflightOnly, [bool]$IgnoreScheduleWindow)

# ------------------------------------------------------- gece penceresi
$inWindow = Test-InNightWindow -Now $startedAt
Write-Log ('night window 21:30-06:30: {0} (now {1})' -f $(if ($inWindow) { 'inside' } else { 'OUTSIDE' }), $startedAt.ToString('HH:mm'))
if (-not $inWindow -and -not $IgnoreScheduleWindow -and -not $PreflightOnly) {
    Complete-Invocation -Classification 'SKIPPED_OUTSIDE_NIGHT_WINDOW' -ExitCode 0 `
        -Reason 'automatic start is only allowed between 21:30 and 06:30; waiting for the next scheduled night'
}

# ---------------------------------------------------------- on kontroller
$failures = New-Object System.Collections.Generic.List[string]
function Check {
    param([string] $Name, [bool] $Ok, [string] $Detail)
    Write-Log ('preflight {0,-22} {1}  {2}' -f $Name, $(if ($Ok) { 'PASS' } else { 'FAIL' }), $Detail)
    if (-not $Ok) { $failures.Add("$Name - $Detail") }
}

Check 'worktree' (Test-Path -LiteralPath $paths.Backend) $paths.Backend
Check 'backend package.json' (Test-Path -LiteralPath (Join-Path $paths.Backend 'package.json')) 'backend/package.json'
Check 'branch' ($branch -eq 'feature/market-refresh-playwright-v1') "current: $branch"
Check 'weekly cli present' (Test-Path -LiteralPath (Join-Path $paths.Backend 'src\market-refresh\autopilot\autopilot-cli.ts')) 'autopilot-cli.ts'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
Check 'node' ([bool]$nodeCmd) $(if ($nodeCmd) { $nodeCmd.Source } else { 'node not on PATH' })
$tsNodeBin = Join-Path $paths.Backend 'node_modules\ts-node\dist\bin.js'
Check 'node_modules' (Test-Path -LiteralPath $tsNodeBin) 'ts-node reachable'

# Veri baglantilari: kanonik dizine cikmalilar, yoksa crawler BASLAMAZ.
$marketLink = Test-DataLink -LinkPath $paths.MarketData -CanonicalPath (Join-Path $canonicalData 'market-refresh') -ProbeRelativePath 'weekly\published\current.json'
Check 'data junction (market)' $marketLink.Healthy $marketLink.Reason
$hierarchyLink = Test-DataLink -LinkPath $paths.HierarchyData -CanonicalPath (Join-Path $canonicalData 'vehicle-hierarchy') -ProbeRelativePath 'current.json'
Check 'data junction (hierarchy)' $hierarchyLink.Healthy $hierarchyLink.Reason

# Yayin isaretcisi okunabiliyor ve gosterdigi dosya yerinde mi?
$pointerOk = $false; $pointerDetail = 'current.json missing'
if (Test-Path -LiteralPath $paths.PointerFile) {
    try {
        $pointer = Get-Content -LiteralPath $paths.PointerFile -Raw | ConvertFrom-Json
        $releaseFile = Join-Path $paths.PublishedDir (Join-Path 'versions' $pointer.release)
        $pointerOk = Test-Path -LiteralPath $releaseFile
        $pointerDetail = $pointer.release
    } catch { $pointerDetail = "unreadable: $($_.Exception.Message)" }
}
Check 'published pointer' $pointerOk $pointerDetail

# Disk muhafizi: depodaki GERCEK yardimci cagrilir.
$disk = $null
try {
    $disk = Invoke-BackendProbe -BackendDir $paths.Backend -Probe 'disk'
    Check 'disk guard' ([bool]$disk.ok) $disk.message
} catch {
    Check 'disk guard' $false "probe failed: $($_.Exception.Message)"
}

$chromeExe = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(Default)'
Check 'chrome present' ([bool]$chromeExe) $(if ($chromeExe) { $chromeExe } else { 'chrome.exe not found in App Paths' })

$runsReadable = Test-Path -LiteralPath $paths.RunsDir
Check 'run state readable' $runsReadable $paths.RunsDir

# Tekillik: kilit + gercek surec + kopru portu.
$lock = Read-SchedulerLock -LockFile $paths.LockFile
$lockAlive = $false
if ($lock -and $lock.pid) {
    $lockStarted = $null
    if ($lock.startedAt) { try { $lockStarted = [datetime]::Parse($lock.startedAt) } catch { } }
    $lockAlive = if ($lockStarted) { Test-SchedulerProcessAlive -ProcessId ([int]$lock.pid) -StartedAt $lockStarted } else { Test-SchedulerProcessAlive -ProcessId ([int]$lock.pid) }
}
$portBusy = Test-BridgePortBusy -Port $Port
$lockDecision = Get-LockDecision -Lock $lock -ProcessAlive $lockAlive -PortBusy $portBusy
Write-Log ('single instance: {0} - {1} (port {2} busy={3})' -f $lockDecision.Action, $lockDecision.Reason, $Port, $portBusy)

if ($failures.Count -gt 0) {
    foreach ($f in $failures) { Write-Log "precheck failure: $f" 'ERROR' }
    Complete-Invocation -Classification 'PRECHECK_FAILED' -ExitCode 3 -Reason ($failures -join '; ')
}
if ($disk -and -not $disk.ok) {
    Write-Log 'run refused: not enough free disk. Review and free space with: npm run market:published:prune   (then -- --apply)' 'ERROR'
    Complete-Invocation -Classification 'LOW_DISK' -ExitCode 4 -Reason $disk.message
}
if ($PreflightOnly) {
    Complete-Invocation -Classification 'PRECHECK_PASSED' -ExitCode 0 -Reason 'preflight only; no decision taken and no crawler started'
}
if ($lockDecision.Action -eq 'SKIP') {
    Complete-Invocation -Classification 'SKIPPED_ALREADY_RUNNING' -ExitCode 0 -Reason $lockDecision.Reason
}

# ------------------------------------------------------- devam / yeni karari
$runs = Get-WeeklyRuns -RunsDir $paths.RunsDir
foreach ($r in $runs) {
    Write-Log ('run state  {0,-38} {1,-18} pending={2} inProgress={3} complete={4} failed={5}' -f $r.RunId, $r.State, $r.Pending, $r.InProgress, $r.Complete, $r.Failed)
}
$decision = Get-RunDecision -Runs $runs -Now $startedAt -AdoptRunId $AdoptRunId
$script:RunId = $decision.RunId
$script:Resumed = $decision.Resumed
Write-Log ('decision: {0} {1} - {2}' -f $decision.Action, $decision.RunId, $decision.Reason)
foreach ($foreign in @($decision.ForeignResumable)) {
    Write-Log ("note: manual run '{0}' is also resumable (state {1}, {2} pending). It is NOT adopted automatically; pass -AdoptRunId {0} to continue it." -f $foreign.RunId, $foreign.State, $foreign.Pending) 'WARN'
}

# ------------------------------------------------------------------- komut
$cliArgs = @(
    $tsNodeBin
    'src/market-refresh/autopilot/autopilot-cli.ts'
    '--mode', 'weekly'
    '--run-id', $decision.RunId
    '--all-targets'
    '--pace-mode', $PaceMode
    '--initial-baseline-pages', "$InitialBaselinePages"
    '--port', "$Port"
)
if ($TargetLimit -gt 0) { $cliArgs += @('--target-limit', "$TargetLimit") }
Write-Log ('command: node {0}' -f ($cliArgs -join ' '))
Write-Log ('working directory: {0}' -f $paths.Backend)

if ($DryRun) {
    Complete-Invocation -Classification 'DRY_RUN' -ExitCode 0 -Reason 'decision and command printed; nothing started'
}

# -------------------------------------------------------------------- kilit
if ($lockDecision.Action -eq 'RECOVER') { Write-Log ('recovering stale lock: {0}' -f $lockDecision.Reason) 'WARN' }
Write-JsonAtomic -Path $paths.LockFile -Object ([ordered]@{
        pid = $PID; runId = $decision.RunId; startedAt = $startedAt.ToString('o')
        host = $env:COMPUTERNAME; repoSha = $script:RepoSha; scriptVersion = (Get-SchedulerVersion)
    })
$script:LockTaken = $true
Write-Log ('lock acquired by pid {0}' -f $PID)

# ------------------------------------------------------------------ chrome
if (-not $NoChromeLaunch) {
    $chromeRunning = @(Get-Process chrome -ErrorAction SilentlyContinue).Count -gt 0
    if ($chromeRunning) {
        Write-Log 'chrome already running; the autopilot extension should reconnect on its own'
    } elseif ($chromeExe) {
        Write-Log 'chrome is not running; starting it so the autopilot extension can drive the run'
        Start-Process -FilePath $chromeExe | Out-Null
    }
}

# ------------------------------------------------------- kopruyu baslat
$runDir = Join-Path $paths.RunsDir $decision.RunId
$stdoutFile = "$logFile.stdout.txt"
$stderrFile = "$logFile.stderr.txt"
$proc = Start-Process -FilePath $nodeCmd.Source -ArgumentList $cliArgs -WorkingDirectory $paths.Backend `
    -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile -PassThru -WindowStyle Hidden
Write-Log ('bridge started: pid {0}' -f $proc.Id)
Write-JsonAtomic -Path $paths.ActiveRunFile -Object ([ordered]@{
        runId = $decision.RunId; bridgePid = $proc.Id; schedulerPid = $PID
        startedAt = (Get-Date).ToString('o'); logPath = $logFile
    })

# --------------------------------------------------------------- izleme
$deadline = $startedAt.AddHours($MaxRuntimeHours)
$extensionDeadline = $startedAt.AddMinutes($ExtensionWaitMinutes)
$lastState = ''
$lastProgressAt = Get-Date
$sawProgress = $false
$outcome = $null

while ($true) {
    Start-Sleep -Seconds 20
    if ($proc.HasExited) {
        Write-Log ('bridge process exited on its own with code {0}' -f $proc.ExitCode)
        $script:ExitCode = $proc.ExitCode
        break
    }
    $state = Read-WeeklyCheckpoint -RunDir $runDir
    if ($state) {
        if ($state.State -ne $lastState) {
            Write-Log ('state: {0} (complete {1}/{2}, pending {3}, failed {4})' -f $state.State, $state.Complete, $state.Total, $state.Pending, $state.Failed)
            $lastState = $state.State
            $lastProgressAt = Get-Date
            $sawProgress = $true
        }
        if ($state.State -eq 'ACCESS_RESTRICTED') { $outcome = 'ACCESS_WALL'; break }
        if ($state.State -in @('COMPLETE', 'INCOMPLETE', 'SMOKE_LIMIT_REACHED')) { $outcome = $state.State; break }
        if ($state.State -eq 'RUNNING') { $sawProgress = $true }
    }
    if (-not $sawProgress -and (Get-Date) -gt $extensionDeadline) {
        $outcome = 'NO_EXTENSION'; break
    }
    if ((Get-Date) -gt $deadline) { $outcome = 'MAX_RUNTIME'; break }
}

# ------------------------------------------------------- nazik durdurma
if (-not $proc.HasExited) {
    Write-Log 'stopping the bridge (CTRL+C so it writes its summary and exit code)'
    $stopped = $false
    try {
        # SIGINT esdegeri: kopru yalnizca bu sinyalde ozet yazip temiz kapanir.
        Add-Type -Namespace Win32 -Name Console -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint dwProcessId);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool GenerateConsoleCtrlEvent(uint dwCtrlEvent, uint dwProcessGroupId);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
'@ -ErrorAction SilentlyContinue
        [Win32.Console]::FreeConsole() | Out-Null
        if ([Win32.Console]::AttachConsole([uint32]$proc.Id)) {
            [Win32.Console]::SetConsoleCtrlHandler([IntPtr]::Zero, $true) | Out-Null
            [Win32.Console]::GenerateConsoleCtrlEvent(0, 0) | Out-Null
            $stopped = $proc.WaitForExit(120000)
            [Win32.Console]::FreeConsole() | Out-Null
            [Win32.Console]::SetConsoleCtrlHandler([IntPtr]::Zero, $false) | Out-Null
        }
    } catch {
        Write-Log ('graceful stop could not be signalled: {0}' -f $_.Exception.Message) 'WARN'
    }
    if (-not $stopped -and -not $proc.HasExited) {
        # Kosu her hedefte checkpoint yazar; zorla kapatmak kosuyu bozmaz,
        # yalnizca ozet/cikis kodu yazilmadan biter ve kosu DEVAM EDILEBILIR kalir.
        Write-Log 'graceful stop timed out; terminating the bridge (run state stays resumable)' 'WARN'
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $proc.WaitForExit(30000) | Out-Null
    }
    if ($proc.HasExited) { $script:ExitCode = $proc.ExitCode }
}

foreach ($capture in @(@{ f = $stdoutFile; n = 'stdout' }, @{ f = $stderrFile; n = 'stderr' })) {
    if (Test-Path -LiteralPath $capture.f) {
        $tail = Get-Content -LiteralPath $capture.f -Tail 40 -ErrorAction SilentlyContinue
        if ($tail) {
            Write-Log ("--- bridge {0} (last {1} lines) ---" -f $capture.n, @($tail).Count)
            foreach ($line in $tail) { Add-Content -LiteralPath $logFile -Value "    $line" -Encoding utf8 }
        }
    }
}

# ---------------------------------------------------------- siniflandirma
$final = Read-WeeklyCheckpoint -RunDir $runDir
if ($final) {
    Write-Log ('final state: {0} (complete {1}/{2}, pending {3}, failed {4})' -f $final.State, $final.Complete, $final.Total, $final.Pending, $final.Failed)
}
$exit = if ($null -ne $script:ExitCode) { [int]$script:ExitCode } else { 0 }
$duration = [math]::Round(((Get-Date) - $startedAt).TotalMinutes)

switch ($outcome) {
    'ACCESS_WALL' {
        Complete-Invocation -Classification 'ACCESS_WALL' -ExitCode $exit `
            -Reason 'the source refused access (captcha/403/429); the run state is preserved and no retry happens tonight'
    }
    'NO_EXTENSION' {
        Complete-Invocation -Classification 'PRECHECK_FAILED' -ExitCode 5 `
            -Reason "the Chrome autopilot extension did not connect within $ExtensionWaitMinutes minute(s); the bridge cannot crawl on its own"
    }
    'MAX_RUNTIME' {
        Complete-Invocation -Classification 'INTERRUPTED' -ExitCode $exit `
            -Reason "max runtime of $MaxRuntimeHours h reached after $duration min; the run stays resumable"
    }
    'COMPLETE' { Complete-Invocation -Classification 'COMPLETE' -ExitCode $exit -Reason "finished in $duration min" }
    'SMOKE_LIMIT_REACHED' { Complete-Invocation -Classification 'COMPLETE' -ExitCode $exit -Reason "bounded smoke run finished in $duration min" }
    'INCOMPLETE' { Complete-Invocation -Classification 'INCOMPLETE_RESUMABLE' -ExitCode $exit -Reason "queue drained with unfinished targets after $duration min" }
    default {
        if ($final -and $final.State -eq 'COMPLETE') {
            Complete-Invocation -Classification 'COMPLETE' -ExitCode $exit -Reason "finished in $duration min"
        }
        if ($final -and (Test-RunResumable $final)) {
            Complete-Invocation -Classification 'INCOMPLETE_RESUMABLE' -ExitCode $exit -Reason "bridge exited after $duration min with work still pending"
        }
        Complete-Invocation -Classification 'FAILED' -ExitCode $exit -Reason "bridge exited with code $exit after $duration min"
    }
}
