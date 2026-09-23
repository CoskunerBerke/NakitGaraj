/**
 * DISK MUHAFIZI — kosu baslamadan once yer var mi?
 *
 * Tazeleme yazarak ilerler: ham sayfalar, kanit satirlari, yayin anlik
 * goruntusu. Disk kosunun ORTASINDA dolarsa yarim dosyalar ve yarim
 * ilerleyen bir kosu kalir. Bu yuzden kontrol ONCE yapilir.
 *
 * MUHAFIZ HICBIR SEY SILMEZ. Yer yoksa kosuyu reddeder ve ne yapilacagini
 * soyler; veriyi silme karari insanindir.
 */
import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_MIN_FREE_DISK_GB = 20;

const GB = 1024 ** 3;

export interface DiskSpace {
  /** Olcumun yapildigi (var olan) dizin. */
  path: string;
  freeBytes: number;
  totalBytes: number;
}

export interface DiskGuardVerdict extends DiskSpace {
  ok: boolean;
  minFreeBytes: number;
  message: string;
}

export function resolveMinFreeDiskBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.MARKET_MIN_FREE_DISK_GB?.trim();
  if (raw === undefined || raw === '') return DEFAULT_MIN_FREE_DISK_GB * GB;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_MIN_FREE_DISK_GB * GB;
  }
  return value * GB;
}

/** Var olan en yakin ust dizine kadar cikar: kosu dizini henuz olusmamis olabilir. */
function existingAncestor(target: string): string {
  let dir = path.resolve(target);
  for (let up = 0; up < 64; up += 1) {
    if (fs.existsSync(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(target);
}

/**
 * Olcum basarisiz olabilir (eslenmis surucu, izin, kaybolan yol). O zaman
 * ATMAZ: "olcemedim" bilgisi doner ve kosuyu olcum hatasi yuzunden
 * durdurmayiz — muhafizin isi yer yoklugunu bildirmek, altyapi hatasini
 * kosu hatasina cevirmek degil.
 */
export function readDiskSpace(targetPath: string): DiskSpace | null {
  const probe = existingAncestor(targetPath);
  let stat: fs.StatsFsBase<number>;
  try {
    stat = fs.statfsSync(probe);
  } catch {
    return null;
  }
  return {
    path: probe,
    // `bavail`: ayricaliksiz surecin gercekten kullanabilecegi bloklar.
    freeBytes: stat.bsize * Number(stat.bavail),
    totalBytes: stat.bsize * Number(stat.blocks),
  };
}

export function formatGb(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`;
}

/**
 * Olcer ve karar verir; ATMAZ. Cagiran taraf ister uyarir, ister
 * `assertEnoughDisk` ile kosuyu durdurur.
 */
export function checkDisk(
  targetPath: string,
  options: { minFreeBytes?: number; env?: NodeJS.ProcessEnv } = {},
): DiskGuardVerdict {
  const minFreeBytes =
    options.minFreeBytes ?? resolveMinFreeDiskBytes(options.env);
  const measured = readDiskSpace(targetPath);
  if (!measured) {
    return {
      path: targetPath,
      freeBytes: Number.NaN,
      totalBytes: Number.NaN,
      ok: true,
      minFreeBytes,
      message: `disk space could not be measured at ${targetPath}; continuing without the guard`,
    };
  }
  const space = measured;
  // 0 = muhafiz acikca kapatilmis demektir.
  const ok = minFreeBytes === 0 || space.freeBytes >= minFreeBytes;
  return {
    ...space,
    ok,
    minFreeBytes,
    message: ok
      ? minFreeBytes === 0
        ? `disk guard disabled (MARKET_MIN_FREE_DISK_GB=0); ${formatGb(space.freeBytes)} free at ${space.path}`
        : `disk ok: ${formatGb(space.freeBytes)} free at ${space.path} (minimum ${formatGb(minFreeBytes)})`
      : `DISK_GUARD ${formatGb(space.freeBytes)} free at ${space.path}, ` +
        `minimum ${formatGb(minFreeBytes)}. Refusing to start a market run so a ` +
        `half-written run cannot fill the disk. Free space first, for example: ` +
        `npm run market:published:prune -- --dry-run (then without --dry-run), ` +
        `or raise MARKET_MIN_FREE_DISK_GB if this threshold is wrong. ` +
        `Nothing was deleted automatically.`,
  };
}

/** Yer yoksa kosuyu baslatmaz. */
export function assertEnoughDisk(
  targetPath: string,
  options: { minFreeBytes?: number; env?: NodeJS.ProcessEnv } = {},
): DiskGuardVerdict {
  const verdict = checkDisk(targetPath, options);
  if (!verdict.ok) throw new Error(verdict.message);
  return verdict;
}
