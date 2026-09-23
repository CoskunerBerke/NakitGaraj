/**
 * DISK MUHAFIZI — kosuyu reddeder, veri silmez.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_MIN_FREE_DISK_GB,
  assertEnoughDisk,
  checkDisk,
  readDiskSpace,
  resolveMinFreeDiskBytes,
} from './disk-guard';

const GB = 1024 ** 3;

describe('market run disk guard', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-disk-guard-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('L1) enough free disk passes and reports the measurement', () => {
    const verdict = checkDisk(dir, { minFreeBytes: 1 });
    expect(verdict.ok).toBe(true);
    expect(verdict.freeBytes).toBeGreaterThan(0);
    expect(verdict.totalBytes).toBeGreaterThan(verdict.freeBytes);
    expect(verdict.message).toMatch(/disk ok/);
    expect(() => assertEnoughDisk(dir, { minFreeBytes: 1 })).not.toThrow();
  });

  test('L2) low free disk refuses the run and says what to do', () => {
    const impossible = readDiskSpace(dir)!.totalBytes * 10;
    const verdict = checkDisk(dir, { minFreeBytes: impossible });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toMatch(/DISK_GUARD/);
    expect(verdict.message).toMatch(/market:published:prune/);
    expect(verdict.message).toMatch(/Nothing was deleted automatically/);
    expect(() => assertEnoughDisk(dir, { minFreeBytes: impossible })).toThrow(
      /DISK_GUARD/,
    );
  });

  test('L3) the guard deletes nothing when it refuses', () => {
    const file = path.join(dir, 'keep-me.json');
    fs.writeFileSync(file, 'data');
    const impossible = readDiskSpace(dir)!.totalBytes * 10;
    expect(() => assertEnoughDisk(dir, { minFreeBytes: impossible })).toThrow();
    expect(fs.readFileSync(file, 'utf-8')).toBe('data');
    expect(fs.readdirSync(dir)).toEqual(['keep-me.json']);
  });

  test('measures the nearest existing parent when the run directory is new', () => {
    const missing = path.join(dir, 'runs', 'not-created-yet', 'deep');
    const space = readDiskSpace(missing)!;
    expect(fs.existsSync(space.path)).toBe(true);
    expect(space.freeBytes).toBeGreaterThan(0);
  });

  test('MARKET_MIN_FREE_DISK_GB=0 disables the guard, and says so', () => {
    const verdict = checkDisk(dir, { minFreeBytes: 0 });
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toMatch(/disk guard disabled/);
  });

  test('an unknown path still measures the nearest existing volume', () => {
    // Olcum basarisiz olursa muhafiz kosuyu durdurmaz (savunma dali);
    // pratikte var olan en yakin ust dizine cikip olcer.
    const verdict = checkDisk(path.join(dir, 'a', 'b', 'c'), {
      minFreeBytes: 1,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toMatch(/disk ok|could not be measured/);
  });

  test('threshold comes from the environment with a safe default', () => {
    expect(resolveMinFreeDiskBytes({})).toBe(DEFAULT_MIN_FREE_DISK_GB * GB);
    expect(resolveMinFreeDiskBytes({ MARKET_MIN_FREE_DISK_GB: '5' })).toBe(
      5 * GB,
    );
    expect(resolveMinFreeDiskBytes({ MARKET_MIN_FREE_DISK_GB: '0' })).toBe(0);
    // Anlamsiz deger muhafizi kapatmaz; varsayilana duser.
    expect(resolveMinFreeDiskBytes({ MARKET_MIN_FREE_DISK_GB: 'lots' })).toBe(
      DEFAULT_MIN_FREE_DISK_GB * GB,
    );
  });
});
