/**
 * YAYINLANMIS SURUMLER ICIN SINIRLI SAKLAMA.
 *
 * Yayinci her hedef bittiginde TAM anlik goruntu yazar (~155 MB). Hedef
 * sayisiyla carpildiginda dizin denetimsiz buyur: olculen bir kosuda 65 dosya
 * = 9,65 GB, gecmiste 253 GB. Bu modul dizini SINIRLI tutar.
 *
 * KESME DEGIL, KORUMA LISTESI. Once korunacaklar belirlenir, geri kalan
 * silinebilir sayilir. Bir dosya su durumlarda ASLA silinmez:
 *   - `current.json` onu gosteriyorsa (canli surum),
 *   - en yeni N surumden biriyse (yakin geri alma),
 *   - onceki kosuya ait geri donus capasiysa (bkz. `anchorHours`),
 *   - az once yazildiysa (baska bir islem isaretciyi henuz degistirmemis
 *     olabilir),
 *   - adi yayin dosyasi kalibina uymuyorsa (yarim/gecici/yabanci dosya).
 *
 * Isaretci okunamiyorsa HICBIR SEY silinmez: neyin canli oldugunu bilmeden
 * silmek, son-bilinen-iyi surumu kaybetme riskidir.
 */
import * as fs from 'fs';
import * as path from 'path';

/** `2026-09-17T08-56-24-797Z-45c792e2f7b5.json` — yayincinin urettigi ad. */
export const RELEASE_FILE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{12}\.json$/;

/** Isaretcinin `release` alaninda kabul edilen bicim (yayinciyla ayni). */
const POINTER_RELEASE_PATTERN = /^[a-zA-Z0-9._-]+$/;

/**
 * `atomicWrite`'in yarim biraktigi dosya: `<ad>.tmp-<pid>-<8 hex>`. Yayin
 * cokerse bu dosya kalir ve ~155 MB yer kaplar; hicbir zaman yayin sayilmaz.
 */
const TEMP_FILE_PATTERN = /\.tmp-(\d+)-[0-9a-f]{8}$/;

/**
 * Yarim dosyayi yazan surec HALA YASIYOR MU? Ad, yazan surecin kimligini
 * tasir. Yasayan bir surecin dosyasini silmek, o yayini `rename` anda
 * ENOENT ile oldurur; yas olcusune guvenmek yetmez, cunku Windows'ta acik
 * tutamacli dosyanin zaman damgasi yazma boyunca tazelenmez.
 */
function writerIsAlive(file: string): boolean {
  const pid = Number(TEMP_FILE_PATTERN.exec(file)?.[1]);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: surec var ama bize ait degil — yine de YASIYOR sayilir.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export interface RetentionPolicy {
  /** Canli surume EK olarak tutulacak gecmis surum sayisi. */
  keepCount: number;
  /**
   * Bu kadar saatten ESKI en yeni surum ayrica tutulur: bir onceki kosunun
   * son hali. Hedef basina yayin yapildigi icin "en yeni 3" dakikalar
   * icindedir; anlamli geri donus noktasi budur. 0 = kapali.
   */
  anchorHours: number;
  /** Bu sure icinde yazilmis dosyalara dokunulmaz (ucusta olan yayin). */
  graceMs: number;
  /**
   * Bu yastan eski yarim `.tmp-` dosyalari silinir: coken bir yayindan
   * kalmislardir ve her biri bir surum boyutundadir. Daha genc olanlar
   * su an yazilan yayin olabilir; onlara dokunulmaz.
   */
  tempMaxAgeMs: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  keepCount: 3,
  anchorHours: 24,
  graceMs: 10 * 60 * 1000,
  tempMaxAgeMs: 6 * 3600 * 1000,
};

/**
 * BOS DEGER "0" DEGILDIR. `Number('')` sifirdir; bu deger ayarlanmis gibi
 * kabul edilseydi `MARKET_PUBLISHED_PRUNE_GRACE_MINUTES=` (bos) yazan tek bir
 * satir butun koruma pencerelerini kapatir ve henuz isaretcisi degismemis
 * CANLI surumu silinebilir hale getirirdi. Bos/bosluk = ayarlanmamis.
 */
function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

export function resolveRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): RetentionPolicy {
  return {
    keepCount: Math.floor(
      positiveNumber(
        env.MARKET_PUBLISHED_RETENTION_COUNT,
        DEFAULT_RETENTION_POLICY.keepCount,
      ),
    ),
    anchorHours: positiveNumber(
      env.MARKET_PUBLISHED_RETENTION_ANCHOR_HOURS,
      DEFAULT_RETENTION_POLICY.anchorHours,
    ),
    graceMs:
      positiveNumber(
        env.MARKET_PUBLISHED_PRUNE_GRACE_MINUTES,
        DEFAULT_RETENTION_POLICY.graceMs / 60000,
      ) * 60000,
    tempMaxAgeMs:
      positiveNumber(
        env.MARKET_PUBLISHED_TEMP_MAX_AGE_HOURS,
        DEFAULT_RETENTION_POLICY.tempMaxAgeMs / 3600_000,
      ) * 3600_000,
  };
}

export type RetainReason =
  'CURRENT' | 'RECENT' | 'ROLLBACK_ANCHOR' | 'IN_FLIGHT' | 'UNRECOGNISED';

export interface ReleaseEntry {
  file: string;
  bytes: number;
  mtimeMs: number;
  /** Dosya adindan turetilen yayin zamani; ad kalibi disindaysa null. */
  publishedAt: string | null;
}

export interface RetainedEntry extends ReleaseEntry {
  reason: RetainReason;
}

export interface RetentionPlan {
  versionsDir: string;
  policy: RetentionPolicy;
  currentRelease: string | null;
  totalFiles: number;
  totalBytes: number;
  retained: RetainedEntry[];
  retainedBytes: number;
  deletable: ReleaseEntry[];
  reclaimableBytes: number;
  /** Silmeyi tumuyle durduran nedenler; doluysa `deletable` bostur. */
  refusals: string[];
}

export interface RetentionOutcome {
  ok: boolean;
  dryRun: boolean;
  plan: RetentionPlan;
  deleted: string[];
  freedBytes: number;
  /** Silinemeyen dosyalar; yayin yine de gecerlidir. */
  failed: { file: string; error: string }[];
  /** Isaretci veya dizin okunamadiginda dolu olur. */
  error: string | null;
}

/** Yayin dosyasi adindaki zaman damgasini ISO bicimine cevirir. */
function publishedAtOf(file: string): string | null {
  if (!RELEASE_FILE_PATTERN.test(file)) return null;
  const stamp = file.slice(0, 24);
  const iso = `${stamp.slice(0, 10)}T${stamp.slice(11, 13)}:${stamp.slice(14, 16)}:${stamp.slice(17, 19)}.${stamp.slice(20, 23)}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function readCurrentRelease(rootDir: string): {
  release: string | null;
  error: string | null;
} {
  const pointerFile = path.join(rootDir, 'current.json');
  if (!fs.existsSync(pointerFile)) return { release: null, error: null };
  try {
    const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf-8')) as {
      release?: unknown;
    };
    if (
      typeof pointer.release !== 'string' ||
      !POINTER_RELEASE_PATTERN.test(pointer.release)
    ) {
      return {
        release: null,
        error: `current.json has no usable release name (${pointerFile})`,
      };
    }
    return { release: pointer.release, error: null };
  } catch (error) {
    return {
      release: null,
      error: `current.json is unreadable (${pointerFile}): ${String(error)}`,
    };
  }
}

/**
 * Silme YAPMAZ. Neyin neden tutuldugunu ve ne kadar yer kazanilabilecegini
 * hesaplar; hem kuru calisma hem gercek budama ayni plani kullanir.
 *
 * `now` dosya sistemi zaman damgalariyla karsilastirilir, bu yuzden GERCEK
 * saat olmalidir; sahte bir saat her dosyayi "az once yazildi" gosterir.
 */
export function planPublishedRetention(
  rootDir: string,
  policy: RetentionPolicy = resolveRetentionPolicy(),
  now: () => Date = () => new Date(),
): RetentionPlan {
  const versionsDir = path.join(rootDir, 'versions');
  const refusals: string[] = [];
  const entries: ReleaseEntry[] = [];
  const unrecognised: ReleaseEntry[] = [];

  if (fs.existsSync(versionsDir)) {
    for (const item of fs.readdirSync(versionsDir, { withFileTypes: true })) {
      // Alt dizine inilmez, baglantilar izlenmez: yalnizca duz dosyalar.
      if (!item.isFile()) continue;
      const full = path.join(versionsDir, item.name);
      let bytes = 0;
      let mtimeMs = 0;
      try {
        const stat = fs.lstatSync(full);
        if (!stat.isFile()) continue;
        bytes = stat.size;
        mtimeMs = stat.mtimeMs;
      } catch {
        continue;
      }
      const entry: ReleaseEntry = {
        file: item.name,
        bytes,
        mtimeMs,
        publishedAt: publishedAtOf(item.name),
      };
      if (RELEASE_FILE_PATTERN.test(item.name)) entries.push(entry);
      else unrecognised.push(entry);
    }
  }

  const { release: currentRelease, error: pointerError } =
    readCurrentRelease(rootDir);
  if (pointerError) refusals.push(pointerError);
  else if (!currentRelease && entries.length + unrecognised.length > 0) {
    refusals.push(
      'no current.json pointer: refusing to decide which release is live',
    );
  } else if (
    currentRelease &&
    !entries.some((entry) => entry.file === currentRelease) &&
    !unrecognised.some((entry) => entry.file === currentRelease)
  ) {
    refusals.push(
      `current release ${currentRelease} is missing from ${versionsDir}`,
    );
  }

  // En yeniden eskiye: yayin zamani (ad), esitlikte dosya zamani.
  const ordered = [...entries].sort((a, b) => {
    const byStamp = (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    return byStamp !== 0 ? byStamp : b.mtimeMs - a.mtimeMs;
  });

  const cutoff = now().getTime() - policy.graceMs;
  const currentEntry = ordered.find((entry) => entry.file === currentRelease);
  /**
   * CAPA CANLI SURUME GORE OLCULUR, SAATE GORE DEGIL.
   *
   * Haftalik tempoda dizindeki her dosya "24 saatten eski" olur; saate gore
   * olculseydi capa AYNI kosunun dakikalar onceki dosyasina duser ve gercek
   * geri donus noktasi (onceki kosunun son hali) silinirdi. Olculdu: canli
   * dizinde 08:43'lu dosya "onceki kosu" diye etiketleniyor, tek gercek
   * onceki-kosu dosyasi (bir gun oncesi) silinebilir listesine dusuyordu.
   */
  const anchorBefore =
    policy.anchorHours > 0 && currentEntry
      ? currentEntry.mtimeMs - policy.anchorHours * 3600_000
      : null;

  /**
   * Yarim kalmis yazimlar: yeterince eskiyse silinebilir (coken yayin),
   * degilse su an yaziliyor olabilir. Ikisi de yayin SAYILMAZ.
   */
  const staleTemp: ReleaseEntry[] = [];
  const otherFiles: ReleaseEntry[] = [];
  for (const entry of unrecognised) {
    const isTemp = TEMP_FILE_PATTERN.test(entry.file);
    const old = entry.mtimeMs <= now().getTime() - policy.tempMaxAgeMs;
    if (
      isTemp &&
      old &&
      entry.file !== currentRelease &&
      !writerIsAlive(entry.file)
    ) {
      staleTemp.push(entry);
    } else otherFiles.push(entry);
  }

  const retained: RetainedEntry[] = otherFiles.map((entry) => ({
    ...entry,
    reason: 'UNRECOGNISED' as const,
  }));
  const retainedNames = new Set(retained.map((entry) => entry.file));
  const keep = (entry: ReleaseEntry, reason: RetainReason): void => {
    if (retainedNames.has(entry.file)) return;
    retainedNames.add(entry.file);
    retained.push({ ...entry, reason });
  };

  /**
   * UCUS KORUMASI SAYILIDIR, SURE DEGIL.
   *
   * Korunmasi gereken tek sey "dosyasi yazilmis ama isaretcisi henuz
   * degismemis" yayindir; bu da yalnizca CANLI surumden YENI dosyalar olabilir
   * ve es zamanli yayinci sayisi kadardir. Her dosyaya sure penceresi
   * uygulansaydi sinir `keepCount` degil `yayin hizi x pencere` olurdu:
   * olculen tempoda (~71 sn'de bir yayin) 10 dakikalik pencere kosu boyunca
   * ~9 fazla dosya (~1,4 GB) tutuyordu.
   */
  const MAX_IN_FLIGHT = 4;
  let inFlight = 0;
  let recent = 0;
  for (const entry of ordered) {
    if (entry.file === currentRelease) {
      keep(entry, 'CURRENT');
      continue;
    }
    const newerThanLive =
      !currentEntry || entry.mtimeMs >= currentEntry.mtimeMs;
    if (entry.mtimeMs > cutoff && newerThanLive && inFlight < MAX_IN_FLIGHT) {
      keep(entry, 'IN_FLIGHT');
      inFlight += 1;
      continue;
    }
    if (recent < policy.keepCount) {
      keep(entry, 'RECENT');
      recent += 1;
    }
  }

  if (anchorBefore !== null) {
    const anchor = ordered.find(
      (entry) =>
        !retainedNames.has(entry.file) &&
        entry.file !== currentRelease &&
        entry.mtimeMs <= anchorBefore,
    );
    if (anchor) keep(anchor, 'ROLLBACK_ANCHOR');
  }

  const deletable = refusals.length
    ? []
    : [
        ...ordered.filter((entry) => !retainedNames.has(entry.file)),
        ...staleTemp,
      ];

  const sum = (list: { bytes: number }[]): number =>
    list.reduce((total, entry) => total + entry.bytes, 0);

  return {
    versionsDir,
    policy,
    currentRelease,
    totalFiles: entries.length + unrecognised.length,
    totalBytes: sum(entries) + sum(unrecognised),
    retained,
    retainedBytes: sum(retained),
    deletable,
    reclaimableBytes: sum(deletable),
    refusals,
  };
}

/**
 * Plani uygular. Her silme oncesi isaretci YENIDEN okunur: plan ile silme
 * arasinda baska bir islem yayin yapmissa, yeni canli surum silinmez.
 */
export function prunePublishedReleases(
  rootDir: string,
  options: {
    policy?: RetentionPolicy;
    dryRun?: boolean;
    now?: () => Date;
    /** Silme islemi; testler kilitli dosyayi burada taklit eder. */
    remove?: (file: string) => void;
  } = {},
): RetentionOutcome {
  const policy = options.policy ?? resolveRetentionPolicy();
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? (() => new Date());
  const remove = options.remove ?? ((file: string) => fs.unlinkSync(file));

  let plan: RetentionPlan;
  try {
    plan = planPublishedRetention(rootDir, policy, now);
  } catch (error) {
    // Hata yolu, hata veren cagriyi TEKRARLAMAZ: gecersiz bir `rootDir`
    // burada ikinci kez atip fonksiyondan disari kacardi.
    return {
      ok: false,
      dryRun,
      plan: {
        versionsDir: `${String(rootDir)}${path.sep}versions`,
        policy,
        currentRelease: null,
        totalFiles: 0,
        totalBytes: 0,
        retained: [],
        retainedBytes: 0,
        deletable: [],
        reclaimableBytes: 0,
        refusals: [String(error)],
      },
      deleted: [],
      freedBytes: 0,
      failed: [],
      error: String(error),
    };
  }

  const deleted: string[] = [];
  const failed: { file: string; error: string }[] = [];
  let freedBytes = 0;

  if (!dryRun) {
    for (const entry of plan.deletable) {
      const full = path.join(plan.versionsDir, entry.file);
      try {
        // Son kontroller: ad kalibi, dizin sinirlari, duz dosya ve canlilik.
        if (
          !RELEASE_FILE_PATTERN.test(entry.file) &&
          !TEMP_FILE_PATTERN.test(entry.file)
        ) {
          continue;
        }
        if (
          path.dirname(path.resolve(full)) !== path.resolve(plan.versionsDir)
        ) {
          continue;
        }
        const live = readCurrentRelease(rootDir);
        if (live.error) {
          failed.push({ file: entry.file, error: live.error });
          break;
        }
        if (live.release === entry.file) continue;
        const stat = fs.lstatSync(full);
        if (!stat.isFile()) continue;
        /**
         * Plan ile silme arasinda dosya DEGISTIYSE dokunma: yarim bir yazim
         * devam ediyor olabilir. Yasayan bir yazicinin dosyasi da atlanir.
         */
        if (stat.mtimeMs !== entry.mtimeMs) continue;
        if (TEMP_FILE_PATTERN.test(entry.file) && writerIsAlive(entry.file)) {
          continue;
        }
        remove(full);
        deleted.push(entry.file);
        freedBytes += entry.bytes;
      } catch (error) {
        failed.push({ file: entry.file, error: String(error) });
      }
    }
  }

  return {
    ok: failed.length === 0,
    dryRun,
    plan,
    deleted,
    freedBytes,
    failed,
    error: null,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

const REASON_TEXT: Record<RetainReason, string> = {
  CURRENT: 'live release (current.json)',
  RECENT: 'recent history',
  ROLLBACK_ANCHOR: 'rollback anchor (previous run)',
  IN_FLIGHT: 'written moments ago',
  UNRECOGNISED: 'not a release file — never touched',
};

/** Okunabilir ozet; hem yayin sonrasi hem kuru calisma ayni bicimi kullanir. */
export function formatRetentionSummary(outcome: RetentionOutcome): string {
  const { plan } = outcome;
  const lines: string[] = [];
  const byReason = new Map<RetainReason, RetainedEntry[]>();
  for (const entry of plan.retained) {
    byReason.set(entry.reason, [...(byReason.get(entry.reason) ?? []), entry]);
  }

  lines.push(`Versions directory  ${plan.versionsDir}`);
  lines.push(
    `Total               ${plan.totalFiles} release(s), ${formatBytes(plan.totalBytes)}`,
  );
  lines.push(`Current release     ${plan.currentRelease ?? '(none)'}`);
  lines.push(
    `Retention           keep ${plan.policy.keepCount} historical release(s)` +
      (plan.policy.anchorHours > 0
        ? ` + newest release older than ${plan.policy.anchorHours}h`
        : ''),
  );
  lines.push(
    `Retained            ${plan.retained.length} file(s), ${formatBytes(plan.retainedBytes)}`,
  );
  for (const [reason, entries] of byReason) {
    lines.push(`  ${REASON_TEXT[reason]}:`);
    for (const entry of entries) {
      lines.push(`    ${entry.file}  ${formatBytes(entry.bytes)}`);
    }
  }
  if (plan.refusals.length) {
    lines.push('Refused to delete anything:');
    for (const refusal of plan.refusals) lines.push(`  ${refusal}`);
  }
  lines.push(
    `${outcome.dryRun ? 'Deletable' : 'Deleted'}           ${
      outcome.dryRun ? plan.deletable.length : outcome.deleted.length
    } release(s), ${formatBytes(outcome.dryRun ? plan.reclaimableBytes : outcome.freedBytes)}`,
  );
  if (outcome.failed.length) {
    lines.push(`Failed              ${outcome.failed.length} file(s):`);
    for (const failure of outcome.failed) {
      lines.push(`    ${failure.file}: ${failure.error}`);
    }
  }
  lines.push(
    outcome.dryRun
      ? `Directory would be  ${formatBytes(plan.totalBytes - plan.reclaimableBytes)} ` +
          `(now ${formatBytes(plan.totalBytes)})`
      : `Directory after     ${formatBytes(plan.totalBytes - outcome.freedBytes)}`,
  );
  return lines.join('\n');
}
