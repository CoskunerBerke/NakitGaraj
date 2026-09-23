/**
 * SAKLAMA DAVRANISI — silinmemesi gerekenler once.
 *
 * Bu testlerin cogu "sildi mi?" degil "SILMEDI mi?" diye sorar: canli surum,
 * yarim dosya, yabanci ad ve kuru calisma. Yanlis silme geri alinamaz.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_RETENTION_POLICY,
  RELEASE_FILE_PATTERN,
  RetentionPolicy,
  planPublishedRetention,
  prunePublishedReleases,
  resolveRetentionPolicy,
} from './published-retention';

const policy = (over: Partial<RetentionPolicy> = {}): RetentionPolicy => ({
  ...DEFAULT_RETENTION_POLICY,
  anchorHours: 0,
  graceMs: 0,
  ...over,
});

describe('published release retention', () => {
  let root: string;
  let versions: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-retention-'));
    versions = path.join(root, 'versions');
    fs.mkdirSync(versions, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  /** `index` buyudukce daha YENI bir surum adi uretir. */
  const releaseName = (index: number): string =>
    `2026-09-${String(10 + index).padStart(2, '0')}T08-00-00-000Z-${String(index).padStart(12, '0')}`.replace(
      /(\d{12})$/,
      (m) => m.replace(/\d/g, (d) => (d === '0' ? 'a' : d)),
    ) + '.json';

  /**
   * Varsayilan olarak birkac saniye ESKI yazilir: dosya sistemi zaman
   * damgasi cozunurlugu "az once yazildi" korumasini testlerde tetiklemesin.
   * Ucus korumasini sinayan test yasi acikca 0 verir.
   */
  const write = (name: string, size = 16, ageMs = 5_000): string => {
    const file = path.join(versions, name);
    fs.writeFileSync(file, 'x'.repeat(size));
    if (ageMs > 0) {
      const when = new Date(Date.now() - ageMs);
      fs.utimesSync(file, when, when);
    }
    return file;
  };

  const pointTo = (name: string): void =>
    fs.writeFileSync(
      path.join(root, 'current.json'),
      JSON.stringify({
        version: 'weekly-market-pointer-v1',
        release: name,
        sha256: 'x'.repeat(64),
        publishedAt: '2026-09-17T08:00:00.000Z',
        hierarchyVersion: 'h',
      }),
    );

  const names = (dir: string): string[] => fs.readdirSync(dir).sort();

  test('A) empty versions directory is safe to prune', () => {
    pointTo(releaseName(1));
    const outcome = prunePublishedReleases(root, { policy: policy() });
    expect(outcome.deleted).toEqual([]);
    expect(outcome.plan.totalFiles).toBe(0);
    // Isaretci var ama dosya yok: karar vermeyi reddeder, yine de patlamaz.
    expect(outcome.plan.refusals.length).toBeGreaterThan(0);
    expect(fs.existsSync(versions)).toBe(true);
  });

  test('A2) missing versions directory does not throw', () => {
    fs.rmSync(versions, { recursive: true, force: true });
    const outcome = prunePublishedReleases(root, { policy: policy() });
    expect(outcome.ok).toBe(true);
    expect(outcome.deleted).toEqual([]);
  });

  test('B) the only release is the live one and is never deleted', () => {
    const only = releaseName(1);
    write(only);
    pointTo(only);
    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
    });
    expect(outcome.deleted).toEqual([]);
    expect(names(versions)).toEqual([only]);
    expect(outcome.plan.retained.map((entry) => entry.reason)).toEqual([
      'CURRENT',
    ]);
  });

  test('C) 10 releases with retention 3 keeps current plus the 3 newest', () => {
    const all = Array.from({ length: 10 }, (_, index) =>
      releaseName(index + 1),
    );
    all.forEach((name) => write(name, 100));
    const current = all[all.length - 1];
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 3 }),
    });

    expect(names(versions)).toEqual([...all.slice(6)].sort());
    expect(outcome.deleted.sort()).toEqual(all.slice(0, 6).sort());
    expect(outcome.freedBytes).toBe(600);
    expect(
      outcome.plan.retained.filter((entry) => entry.reason === 'CURRENT'),
    ).toHaveLength(1);
    expect(
      outcome.plan.retained.filter((entry) => entry.reason === 'RECENT'),
    ).toHaveLength(3);
  });

  test('D) the live release is kept even when it is the oldest file', () => {
    const all = Array.from({ length: 6 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name, 10));
    const oldest = all[0];
    pointTo(oldest);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 2 }),
    });

    expect(outcome.deleted).not.toContain(oldest);
    expect(fs.existsSync(path.join(versions, oldest))).toBe(true);
    // current + en yeni 2 kalir; kalan 3'u silinir.
    expect(names(versions)).toEqual([oldest, all[4], all[5]].sort());
  });

  test('E) a half-written temp file is ignored and left alone', () => {
    const current = releaseName(5);
    write(current);
    write(releaseName(1));
    const tmp = `${releaseName(9)}.tmp-1234-abcd`;
    write(tmp);
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
    });

    expect(fs.existsSync(path.join(versions, tmp))).toBe(true);
    expect(outcome.deleted).not.toContain(tmp);
    expect(
      outcome.plan.retained.find((entry) => entry.file === tmp)?.reason,
    ).toBe('UNRECOGNISED');
  });

  test('E2) a release written moments ago is protected by the grace window', () => {
    const current = releaseName(1);
    write(current, 10, 60 * 60 * 1000);
    const fresh = releaseName(2);
    write(fresh, 10, 0);
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0, graceMs: 10 * 60 * 1000 }),
    });

    expect(outcome.deleted).toEqual([]);
    expect(
      outcome.plan.retained.find((entry) => entry.file === fresh)?.reason,
    ).toBe('IN_FLIGHT');
  });

  /** Calismayan bir surec kimligi: yazici olu sayilsin diye. */
  const DEAD_PID = 999_999_999;

  test('E3) a stale half-written temp file is deleted; a fresh one is kept', () => {
    const current = releaseName(4);
    write(current, 10, 60 * 60 * 1000);
    const crashed = `${releaseName(3)}.tmp-${DEAD_PID}-deadbeef`;
    write(crashed, 999, 12 * 60 * 60 * 1000);
    const inFlight = `${releaseName(5)}.tmp-${DEAD_PID}-cafebabe`;
    write(inFlight, 999, 0);
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 3, tempMaxAgeMs: 6 * 60 * 60 * 1000 }),
    });

    expect(outcome.deleted).toEqual([crashed]);
    expect(fs.existsSync(path.join(versions, inFlight))).toBe(true);
    expect(fs.existsSync(path.join(versions, current))).toBe(true);
    expect(outcome.freedBytes).toBe(999);
  });

  test('E3b) an old temp file whose writer is still running is left alone', () => {
    const current = releaseName(4);
    write(current, 10, 60 * 60 * 1000);
    // Bu testi calistiran surecin kimligi: yazici kesinlikle YASIYOR.
    const stillWriting = `${releaseName(3)}.tmp-${process.pid}-deadbeef`;
    write(stillWriting, 999, 12 * 60 * 60 * 1000);
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 3, tempMaxAgeMs: 60 * 1000 }),
    });

    expect(outcome.deleted).toEqual([]);
    expect(fs.existsSync(path.join(versions, stillWriting))).toBe(true);
  });

  test('E4) a temp file is never deleted while the pointer is unreadable', () => {
    const crashed = `${releaseName(3)}.tmp-${DEAD_PID}-deadbeef`;
    write(crashed, 10, 12 * 60 * 60 * 1000);
    fs.writeFileSync(path.join(root, 'current.json'), 'not json at all');

    const outcome = prunePublishedReleases(root, { policy: policy() });

    expect(outcome.deleted).toEqual([]);
    expect(fs.existsSync(path.join(versions, crashed))).toBe(true);
  });

  test('F) files whose names are not release files are never touched', () => {
    const current = releaseName(3);
    write(current);
    const strangers = [
      'README.md',
      'current.json.bak',
      'notes.json',
      '2026-09-11.json',
    ];
    strangers.forEach((name) => write(name));
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
    });

    for (const name of strangers) {
      expect(fs.existsSync(path.join(versions, name))).toBe(true);
      expect(outcome.deleted).not.toContain(name);
      expect(RELEASE_FILE_PATTERN.test(name)).toBe(false);
    }
  });

  test('F2) a subdirectory inside versions/ is never entered or deleted', () => {
    const current = releaseName(2);
    write(current);
    const nested = path.join(versions, 'archive');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, releaseName(1)), 'x');
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
    });

    expect(fs.existsSync(path.join(nested, releaseName(1)))).toBe(true);
    expect(outcome.plan.totalFiles).toBe(1);
  });

  test('G) dry run changes nothing on disk', () => {
    const all = Array.from({ length: 5 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name, 50));
    pointTo(all[4]);
    const before = names(versions);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 1 }),
      dryRun: true,
    });

    expect(names(versions)).toEqual(before);
    expect(outcome.deleted).toEqual([]);
    expect(outcome.freedBytes).toBe(0);
    expect(outcome.plan.deletable).toHaveLength(3);
    expect(outcome.plan.reclaimableBytes).toBe(150);
  });

  test('H) an unreadable pointer refuses to delete anything', () => {
    const all = Array.from({ length: 4 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name));
    fs.writeFileSync(path.join(root, 'current.json'), '{ not json');

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
    });

    expect(outcome.deleted).toEqual([]);
    expect(outcome.plan.deletable).toEqual([]);
    expect(outcome.plan.refusals.join(' ')).toMatch(/unreadable/);
    expect(names(versions)).toEqual([...all].sort());
  });

  test('H2) a pointer naming a missing release refuses to delete anything', () => {
    const all = Array.from({ length: 3 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name));
    pointTo(releaseName(99));

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
    });

    expect(outcome.deleted).toEqual([]);
    expect(outcome.plan.refusals.join(' ')).toMatch(/missing from/);
    expect(names(versions)).toEqual([...all].sort());
  });

  test('H3) a delete failure leaves the pointer and the live release intact', () => {
    const all = Array.from({ length: 4 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name));
    const current = all[3];
    pointTo(current);
    const pointerBefore = fs.readFileSync(
      path.join(root, 'current.json'),
      'utf-8',
    );
    // Kilitli dosya: silme EBUSY verir (canli sistemde virus tarayici, acik tutamac).
    const stubborn = all[0];

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0 }),
      remove: (file) => {
        if (path.basename(file) === stubborn)
          throw new Error('EBUSY: file is locked');
        fs.unlinkSync(file);
      },
    });

    // Bir dosya silinemese bile digerleri silinir ve yayin gecerli kalir.
    expect(outcome.failed.map((failure) => failure.file)).toEqual([stubborn]);
    expect(outcome.ok).toBe(false);
    expect(outcome.deleted.sort()).toEqual([all[1], all[2]].sort());
    expect(fs.readFileSync(path.join(root, 'current.json'), 'utf-8')).toBe(
      pointerBefore,
    );
    expect(fs.existsSync(path.join(versions, current))).toBe(true);
  });

  test('H4) no pointer at all refuses to delete anything, including temp files', () => {
    const all = Array.from({ length: 4 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name, 10, 60 * 60 * 1000));
    const crashed = `${releaseName(9)}.tmp-${DEAD_PID}-deadbeef`;
    write(crashed, 10, 12 * 60 * 60 * 1000);
    // current.json HIC yok: neyin canli oldugu bilinmiyor.

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0, tempMaxAgeMs: 60 * 1000 }),
    });

    expect(outcome.deleted).toEqual([]);
    expect(outcome.plan.deletable).toEqual([]);
    expect(outcome.plan.refusals.join(' ')).toMatch(/no current\.json/);
    expect(names(versions)).toHaveLength(5);
  });

  test('in-flight protection is bounded: a fast publish rate cannot grow the directory', () => {
    // Canli surum + ondan ESKI 19 dosya, hepsi ucus penceresi icinde.
    const all = Array.from({ length: 20 }, (_, index) =>
      releaseName(index + 1),
    );
    all.forEach((name, index) => write(name, 100, (20 - index) * 1000));
    const current = all[all.length - 1];
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 3, graceMs: 10 * 60 * 1000 }),
    });

    // Sure penceresi her dosyayi degil, yalnizca canliden YENI olanlari korur.
    expect(outcome.plan.retained).toHaveLength(4);
    expect(outcome.deleted).toHaveLength(16);
    expect(names(versions)).toHaveLength(4);
  });

  test('a release newer than the live one is protected as an in-flight publish', () => {
    const current = releaseName(1);
    write(current, 10, 60 * 1000);
    // Dosyasi yazilmis, isaretcisi henuz degismemis yayin.
    const pending = releaseName(2);
    write(pending, 10, 0);
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 0, graceMs: 10 * 60 * 1000 }),
    });

    expect(outcome.deleted).toEqual([]);
    expect(
      outcome.plan.retained.find((entry) => entry.file === pending)?.reason,
    ).toBe('IN_FLIGHT');
  });

  test('the anchor is measured from the live release, so a weekly cadence keeps the previous run', () => {
    const day = 24 * 60 * 60 * 1000;
    // Tek gercek onceki-kosu dosyasi + ayni kosudan dakikalar arayla 4 dosya.
    const previousRun = releaseName(1);
    write(previousRun, 10, 9 * day);
    const sameRun = [2, 3, 4, 5].map((index) => releaseName(index));
    sameRun.forEach((name, index) =>
      write(name, 10, 7 * day + (4 - index) * 60 * 1000),
    );
    const current = sameRun[sameRun.length - 1];
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 2, anchorHours: 24 }),
    });

    expect(
      outcome.plan.retained.find((entry) => entry.reason === 'ROLLBACK_ANCHOR')
        ?.file,
    ).toBe(previousRun);
    expect(fs.existsSync(path.join(versions, previousRun))).toBe(true);
  });

  test('rollback anchor keeps the newest release from the previous run', () => {
    const day = 24 * 60 * 60 * 1000;
    const older = releaseName(1);
    const previousRun = releaseName(2);
    const recent = releaseName(3);
    const current = releaseName(4);
    write(older, 10, 4 * day);
    write(previousRun, 10, 2 * day);
    write(recent, 10, 30 * 1000);
    write(current, 10, 20 * 1000);
    pointTo(current);

    const outcome = prunePublishedReleases(root, {
      policy: policy({ keepCount: 1, anchorHours: 24 }),
    });

    expect(outcome.deleted).toEqual([older]);
    expect(
      outcome.plan.retained.find((entry) => entry.file === previousRun)?.reason,
    ).toBe('ROLLBACK_ANCHOR');
  });

  test('plan reports totals and reasons without touching the disk', () => {
    const all = Array.from({ length: 4 }, (_, index) => releaseName(index + 1));
    all.forEach((name) => write(name, 25));
    pointTo(all[3]);

    const plan = planPublishedRetention(root, policy({ keepCount: 1 }));

    expect(plan.totalFiles).toBe(4);
    expect(plan.totalBytes).toBe(100);
    expect(plan.retainedBytes).toBe(50);
    expect(plan.reclaimableBytes).toBe(50);
    expect(plan.currentRelease).toBe(all[3]);
    expect(names(versions)).toHaveLength(4);
  });

  test('policy comes from the environment with a safe default', () => {
    expect(resolveRetentionPolicy({}).keepCount).toBe(3);
    expect(
      resolveRetentionPolicy({ MARKET_PUBLISHED_RETENTION_COUNT: '7' })
        .keepCount,
    ).toBe(7);
    // Anlamsiz deger sessizce varsayilana duser; kosu durmaz.
    expect(
      resolveRetentionPolicy({ MARKET_PUBLISHED_RETENTION_COUNT: 'abc' })
        .keepCount,
    ).toBe(3);
    expect(
      resolveRetentionPolicy({ MARKET_PUBLISHED_RETENTION_COUNT: '-2' })
        .keepCount,
    ).toBe(3);
    expect(
      resolveRetentionPolicy({ MARKET_PUBLISHED_PRUNE_GRACE_MINUTES: '5' })
        .graceMs,
    ).toBe(5 * 60 * 1000);
    expect(
      resolveRetentionPolicy({ MARKET_PUBLISHED_RETENTION_ANCHOR_HOURS: '0' })
        .anchorHours,
    ).toBe(0);
    expect(
      resolveRetentionPolicy({ MARKET_PUBLISHED_TEMP_MAX_AGE_HOURS: '2' })
        .tempMaxAgeMs,
    ).toBe(2 * 60 * 60 * 1000);
  });

  /**
   * BOS DEGER = AYARLANMAMIS. `Number('')` sifirdir; bos birakilmis tek bir
   * satir butun koruma pencerelerini kapatsaydi, dosyasi yazilmis ama
   * isaretcisi henuz degismemis CANLI surum silinebilir hale gelirdi.
   */
  test('an empty or whitespace env value falls back to the default, not to zero', () => {
    for (const blank of ['', '   ', '\t']) {
      expect(
        resolveRetentionPolicy({
          MARKET_PUBLISHED_RETENTION_COUNT: blank,
          MARKET_PUBLISHED_RETENTION_ANCHOR_HOURS: blank,
          MARKET_PUBLISHED_PRUNE_GRACE_MINUTES: blank,
          MARKET_PUBLISHED_TEMP_MAX_AGE_HOURS: blank,
        }),
      ).toEqual(DEFAULT_RETENTION_POLICY);
    }
  });

  test('a bad root directory is reported, never thrown', () => {
    const outcome = prunePublishedReleases(undefined as unknown as string, {
      policy: policy(),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
    expect(outcome.deleted).toEqual([]);
  });
});
