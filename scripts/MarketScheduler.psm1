# MARKET REFRESH SCHEDULER - KARAR MANTIGI
#
# Bu modul yalnizca KARAR verir: gece penceresi, resume/new, kilit, veri
# baglantisi, durum okuma. Crawler'i baslatan taraf runner betigidir. Ayrim
# kasitlidir: kararlar boylece crawler baslatmadan test edilebilir.
#
# Kosu durumu tek kaynaktan okunur: weekly checkpoint dosyasi
# (`data/market-refresh/weekly/runs/<runId>/checkpoint.json`). Cikti
# metninden durum TAHMIN EDILMEZ.

Set-StrictMode -Version Latest

$script:SchedulerVersion = '1.0.0'
# Zamanlayici YALNIZCA kendi kosularini yonetir. Elle baslatilmis bir kosuyu
# kendiliginden devralmak, yanlis kosuyu surdurmek demektir.
$script:AutoRunPrefix = 'market-auto-'

function Get-SchedulerVersion { $script:SchedulerVersion }
function Get-AutoRunPrefix { $script:AutoRunPrefix }

function Get-SchedulerPaths {
    <#
      .SYNOPSIS
      Tum yollar tek yerden turetilir; betikler yol birlestirmez.
    #>
    param([Parameter(Mandatory)][string] $RepoRoot)

    $backend = Join-Path $RepoRoot 'backend'
    $weekly = Join-Path $backend 'data\market-refresh\weekly'
    [pscustomobject]@{
        RepoRoot      = $RepoRoot
        Backend       = $backend
        DataRoot      = Join-Path $backend 'data'
        MarketData    = Join-Path $backend 'data\market-refresh'
        HierarchyData = Join-Path $backend 'data\vehicle-hierarchy'
        WeeklyRoot    = $weekly
        RunsDir       = Join-Path $weekly 'runs'
        PublishedDir  = Join-Path $weekly 'published'
        PointerFile   = Join-Path $weekly 'published\current.json'
        TargetState   = Join-Path $weekly 'target-state.json'
        StateDir      = Join-Path $RepoRoot '.local\scheduler'
        LockFile      = Join-Path $RepoRoot '.local\scheduler\scheduler.lock'
        ActiveRunFile = Join-Path $RepoRoot '.local\scheduler\active-run.json'
        LastRunFile   = Join-Path $RepoRoot '.local\scheduler\last-run.json'
        LogDir        = Join-Path $RepoRoot 'logs\scheduled-market'
    }
}

function ConvertTo-MinuteOfDay {
    param([Parameter(Mandatory)][string] $HourMinute)
    if ($HourMinute -notmatch '^(\d{1,2}):(\d{2})$') {
        throw "Expected HH:mm, got '$HourMinute'"
    }
    [int]$Matches[1] * 60 + [int]$Matches[2]
}

function Test-InNightWindow {
    <#
      .SYNOPSIS
      Gece penceresi YALNIZCA BASLATMA icindir; calisan kosuyu durdurmaz.
      Pencere gece yarisini asar (21:30 -> 06:30), bu yuzden sarma mantigi.
    #>
    param(
        [Parameter(Mandatory)][datetime] $Now,
        [string] $Start = '21:30',
        [string] $End = '06:30'
    )
    $minute = $Now.Hour * 60 + $Now.Minute
    $from = ConvertTo-MinuteOfDay $Start
    $to = ConvertTo-MinuteOfDay $End
    if ($from -le $to) { return ($minute -ge $from -and $minute -lt $to) }
    return ($minute -ge $from -or $minute -lt $to)
}

function New-AutoRunId {
    param([Parameter(Mandatory)][datetime] $Now)
    '{0}{1}' -f $script:AutoRunPrefix, $Now.ToString('yyyy-MM-dd-HHmm')
}

function Read-WeeklyCheckpoint {
    <#
      .SYNOPSIS
      Checkpoint zarfini okur (checksum + payload) ve kosunun ozetini verir.
      Bozuk/eksik dosya HATA DEGIL: okunamadi bilgisi doner, cagiran karar verir.
    #>
    param([Parameter(Mandatory)][string] $RunDir)

    $file = Join-Path $RunDir 'checkpoint.json'
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    try {
        $envelope = Get-Content -LiteralPath $file -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return [pscustomobject]@{
            RunId = Split-Path $RunDir -Leaf; State = 'UNREADABLE'; UpdatedAt = $null
            Total = 0; Pending = 0; InProgress = 0; Complete = 0; Failed = 0
            Readable = $false; Path = $file
        }
    }
    $payload = $envelope.payload
    if (-not $payload) {
        return [pscustomobject]@{
            RunId = Split-Path $RunDir -Leaf; State = 'UNREADABLE'; UpdatedAt = $null
            Total = 0; Pending = 0; InProgress = 0; Complete = 0; Failed = 0
            Readable = $false; Path = $file
        }
    }
    $items = @($payload.items)
    $count = { param($status) @($items | Where-Object { $_.status -eq $status }).Count }
    [pscustomobject]@{
        RunId      = $payload.runId
        State      = $payload.state
        UpdatedAt  = if ($payload.updatedAt) { [datetime]::Parse($payload.updatedAt).ToLocalTime() } else { $null }
        Total      = $items.Count
        Pending    = & $count 'PENDING'
        InProgress = & $count 'IN_PROGRESS'
        Complete   = & $count 'COMPLETE'
        Failed     = & $count 'INCOMPLETE'
        Readable   = $true
        Path       = $file
    }
}

function Get-WeeklyRuns {
    param([Parameter(Mandatory)][string] $RunsDir)
    if (-not (Test-Path -LiteralPath $RunsDir)) { return @() }
    $runs = foreach ($dir in Get-ChildItem -LiteralPath $RunsDir -Directory -ErrorAction SilentlyContinue) {
        $state = Read-WeeklyCheckpoint -RunDir $dir.FullName
        if ($state) { $state }
    }
    # Bos liste $null olarak doner; cagiranlar @() ile sarar (Get-RunDecision
    # dahil). Virgulle sarmak bos durumu "bir elemanli" gosterirdi.
    @($runs) | Sort-Object -Property @{ Expression = { $_.UpdatedAt } } -Descending
}

function Test-RunResumable {
    <#
      .SYNOPSIS
      Devam edilebilir mi? COMPLETE terminal; duman kosusu kasitli kirpiktir;
      bekleyen isi kalmamis bir kosuyu "devam ettirmek" sonsuz donguye doner.
    #>
    param([Parameter(Mandatory)] $Run)
    if (-not $Run.Readable) { return $false }
    if ($Run.State -in @('COMPLETE', 'SMOKE_LIMIT_REACHED')) { return $false }
    return (($Run.Pending + $Run.InProgress) -gt 0)
}

function Get-RunDecision {
    <#
      .SYNOPSIS
      Once DEVAM, sonra YENI. Yalnizca zamanlayicinin kendi kosulari (auto
      oneki) devralinir; elle baslatilmis kosular RAPORLANIR ama otomatik
      surdurulmez - yanlis kosuyu surdurmek veriyi sessizce karistirirdi.
    #>
    param(
        $Runs,
        [Parameter(Mandatory)][datetime] $Now,
        [string] $AdoptRunId
    )
    # `@($null)` tek elemanli bir dizidir; bos girdi null eleman birakmasin.
    $all = @($Runs | Where-Object { $null -ne $_ })
    $foreign = @($all | Where-Object { $_.RunId -notlike "$script:AutoRunPrefix*" -and (Test-RunResumable $_) })

    if ($AdoptRunId) {
        $adopted = $all | Where-Object { $_.RunId -eq $AdoptRunId } | Select-Object -First 1
        if (-not $adopted) { throw "Run '$AdoptRunId' not found under the weekly runs directory" }
        if (-not (Test-RunResumable $adopted)) { throw "Run '$AdoptRunId' is not resumable (state $($adopted.State), pending $($adopted.Pending))" }
        return [pscustomobject]@{
            Action = 'RESUME'; RunId = $adopted.RunId; Resumed = $true
            Reason = "explicitly adopted by -AdoptRunId (state $($adopted.State), $($adopted.Pending) pending)"
            ForeignResumable = $foreign
        }
    }

    $auto = @($all | Where-Object { $_.RunId -like "$script:AutoRunPrefix*" })
    $resumable = @($auto | Where-Object { Test-RunResumable $_ }) | Select-Object -First 1
    if ($resumable) {
        return [pscustomobject]@{
            Action = 'RESUME'; RunId = $resumable.RunId; Resumed = $true
            Reason = "previous automation run is incomplete (state $($resumable.State), $($resumable.Pending) pending, $($resumable.InProgress) in progress)"
            ForeignResumable = $foreign
        }
    }
    $newest = $auto | Select-Object -First 1
    $reason = if ($newest) { "previous automation run $($newest.RunId) is terminal (state $($newest.State))" } else { 'no previous automation run' }
    [pscustomobject]@{
        Action = 'NEW'; RunId = (New-AutoRunId -Now $Now); Resumed = $false
        Reason = $reason; ForeignResumable = $foreign
    }
}

function Write-JsonAtomic {
    <#
      .SYNOPSIS
      Once gecici dosya, sonra yer degistirme: yarim yazilmis durum dosyasi
      okuyan tarafta "bozuk" degil, ya eski ya yeni halidir.
    #>
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)] $Object
    )
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = "$Path.tmp-$PID-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    ($Object | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $tmp -Encoding utf8
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Test-SchedulerProcessAlive {
    <#
      .SYNOPSIS
      PID yasiyor mu? Kimlik icin baslangic zamani da karsilastirilir: PID'ler
      geri donusur ve baska bir surec ayni numarayi almis olabilir.
    #>
    param(
        [Parameter(Mandatory)][int] $ProcessId,
        [datetime] $StartedAt
    )
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($StartedAt) {
        # 5 dakikadan fazla sapma: PID geri donusmus, bu bizim surecimiz degil.
        if ([math]::Abs(($proc.StartTime - $StartedAt).TotalMinutes) -gt 5) { return $false }
    }
    return $true
}

function Test-BridgePortBusy {
    param([Parameter(Mandatory)][int] $Port)
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $false
    } catch {
        return $true
    } finally {
        if ($listener) { try { $listener.Stop() } catch { } }
    }
}

function Read-SchedulerLock {
    param([Parameter(Mandatory)][string] $LockFile)
    if (-not (Test-Path -LiteralPath $LockFile)) { return $null }
    try { Get-Content -LiteralPath $LockFile -Raw | ConvertFrom-Json } catch {
        [pscustomobject]@{ pid = 0; runId = 'UNREADABLE'; startedAt = $null; host = $null; repoSha = $null; scriptVersion = $null }
    }
}

function Get-LockDecision {
    <#
      .SYNOPSIS
      Iki seviyeli tekillik: kilit dosyasi VE gercek calisan surec/port.
      Kilit koru korune silinmez - yalnizca surec olu VE kopru portu bossa
      bayat sayilir.
    #>
    param(
        $Lock,
        [Parameter(Mandatory)][bool] $ProcessAlive,
        [Parameter(Mandatory)][bool] $PortBusy
    )
    if (-not $Lock) {
        if ($PortBusy) {
            return [pscustomobject]@{ Action = 'SKIP'; Reason = 'bridge port is already in use by another process (crawler may be running without a lock)' }
        }
        return [pscustomobject]@{ Action = 'PROCEED'; Reason = 'no lock present' }
    }
    if ($ProcessAlive) {
        return [pscustomobject]@{ Action = 'SKIP'; Reason = "lock held by live pid $($Lock.pid) (run $($Lock.runId))" }
    }
    if ($PortBusy) {
        return [pscustomobject]@{ Action = 'SKIP'; Reason = "lock pid $($Lock.pid) is gone but the bridge port is still in use; refusing to assume it is stale" }
    }
    [pscustomobject]@{ Action = 'RECOVER'; Reason = "stale lock from dead pid $($Lock.pid) (run $($Lock.runId)); port free" }
}

function Get-ReparseTarget {
    <#
      .SYNOPSIS
      Junction/symlink hedefi. Duz klasor icin $null doner - cagiran taraf
      "gercek klasor" ile "baglanti" arasini boylece ayirir.
    #>
    param([Parameter(Mandatory)][string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $item = Get-Item -LiteralPath $Path -Force
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $null }
    if ($item.PSObject.Properties.Name -contains 'Target' -and $item.Target) {
        return @($item.Target)[0]
    }
    # PS 5.1 bazi durumlarda Target vermez; fsutil kesin yaniti verir.
    $out = & cmd /c "fsutil reparsepoint query `"$Path`"" 2>$null
    $line = $out | Where-Object { $_ -match 'Print Name:\s*(.+)$' } | Select-Object -First 1
    if ($line -and $line -match 'Print Name:\s*(.+)$') { return $Matches[1].Trim() }
    return $null
}

function Test-DataLink {
    <#
      .SYNOPSIS
      Zamanlayici veri yolu GERCEKTEN kanonik dizine mi cikiyor? Yalnizca
      hedef metnine bakilmaz: iki yoldan gorunen bilinen bir dosyanin AYNI
      dosya oldugu (boyut + son yazma + icerik ozeti) dogrulanir.
    #>
    param(
        [Parameter(Mandatory)][string] $LinkPath,
        [Parameter(Mandatory)][string] $CanonicalPath,
        [string] $ProbeRelativePath
    )
    $result = [pscustomobject]@{
        LinkPath = $LinkPath; CanonicalPath = $CanonicalPath
        Exists = (Test-Path -LiteralPath $LinkPath)
        IsReparsePoint = $false; Target = $null; TargetMatches = $false
        ProbeFile = $null; SameFile = $null; Healthy = $false; Reason = ''
    }
    if (-not $result.Exists) { $result.Reason = 'link path does not exist'; return $result }
    $target = Get-ReparseTarget -Path $LinkPath
    $result.IsReparsePoint = [bool]$target
    $result.Target = $target
    if (-not $target) { $result.Reason = 'path is a real directory, not a junction'; return $result }

    $normalise = { param($p) ($p -replace '^\\\\\?\\', '').TrimEnd('\') }
    $result.TargetMatches = ((& $normalise $target) -ieq (& $normalise $CanonicalPath))
    if (-not $result.TargetMatches) { $result.Reason = "junction points at '$target', expected '$CanonicalPath'"; return $result }

    if ($ProbeRelativePath) {
        $viaLink = Join-Path $LinkPath $ProbeRelativePath
        $viaCanonical = Join-Path $CanonicalPath $ProbeRelativePath
        $result.ProbeFile = $ProbeRelativePath
        if (-not (Test-Path -LiteralPath $viaLink) -or -not (Test-Path -LiteralPath $viaCanonical)) {
            $result.Reason = "probe file '$ProbeRelativePath' is not visible through both paths"
            return $result
        }
        $a = Get-Item -LiteralPath $viaLink
        $b = Get-Item -LiteralPath $viaCanonical
        $sameMeta = ($a.Length -eq $b.Length) -and ($a.LastWriteTimeUtc -eq $b.LastWriteTimeUtc)
        $sameHash = (Get-FileHash -LiteralPath $viaLink -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $viaCanonical -Algorithm SHA256).Hash
        $result.SameFile = ($sameMeta -and $sameHash)
        if (-not $result.SameFile) { $result.Reason = 'probe file differs between the two paths'; return $result }
    }
    $result.Healthy = $true
    $result.Reason = 'junction resolves to the canonical data directory'
    $result
}

function Invoke-BackendProbe {
    <#
      .SYNOPSIS
      Depodaki GERCEK yardimcilari (disk muhafizi, saklama plani) ts-node ile
      cagirir. Disk esigi ve saklama mantigi burada YENIDEN YAZILMAZ; tek
      dogruluk kaynagi backend kodudur.
    #>
    param(
        [Parameter(Mandatory)][string] $BackendDir,
        [Parameter(Mandatory)][ValidateSet('disk', 'published')] [string] $Probe
    )
    $script = switch ($Probe) {
        'disk' {
            "const {checkDisk}=require('./src/market-refresh/weekly/disk-guard');" +
            "const v=checkDisk(require('path').join(process.cwd(),'data','market-refresh'));" +
            "console.log(JSON.stringify({ok:v.ok,freeBytes:v.freeBytes,minFreeBytes:v.minFreeBytes,path:v.path,message:v.message}));"
        }
        'published' {
            "const {planPublishedRetention,resolveRetentionPolicy}=require('./src/market-refresh/weekly/published-retention');" +
            "const {resolveWeeklyMarketArtifactRoot}=require('./src/market-refresh/weekly/artifact-publisher');" +
            "const p=planPublishedRetention(resolveWeeklyMarketArtifactRoot(),resolveRetentionPolicy());" +
            "console.log(JSON.stringify({totalFiles:p.totalFiles,totalBytes:p.totalBytes,retained:p.retained.length,retainedBytes:p.retainedBytes,deletable:p.deletable.length,reclaimableBytes:p.reclaimableBytes,currentRelease:p.currentRelease,refusals:p.refusals}));"
        }
    }
    $previous = Get-Location
    try {
        Set-Location -LiteralPath $BackendDir
        $raw = & node -r ts-node/register/transpile-only -e $script 2>&1
        $text = ($raw | Out-String).Trim()
        $jsonLine = ($text -split "`n" | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1)
        if (-not $jsonLine) { throw "probe '$Probe' produced no JSON: $text" }
        return $jsonLine | ConvertFrom-Json
    } finally {
        Set-Location -LiteralPath $previous
    }
}

Export-ModuleMember -Function *
