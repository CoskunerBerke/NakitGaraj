/**
 * HAFTALIK KOSU BAYRAK GUVENLIGI.
 *
 * `--deadline` ve `--window` yalnizca YAPI kosusunda baglanmistir; `runWeekly`
 * ikisini de okumaz. Sessizce yok saymak, operatore var olmayan bir kesme
 * saati oldugunu dusundururdu — bu yuzden haftalik kosuda ACIKCA reddedilir.
 *
 * Dogrulama `parseArgs` icinde, yani KOPRU BASLAMADAN once gerceklesir; bu
 * testler hicbir ag/kopru islemi baslatmaz.
 */
import { parseArgs } from './autopilot-cli';

const weekly = (...extra: string[]): string[] => [
  '--mode',
  'weekly',
  '--run-id',
  'flag-safety',
  '--all-targets',
  '--target-limit',
  '25',
  '--pace-mode',
  'overnight',
  '--initial-baseline-pages',
  '20',
  ...extra,
];

const structure = (...extra: string[]): string[] => [
  '--mode',
  'structure',
  '--run-id',
  'flag-safety-structure',
  ...extra,
];

describe('haftalik kosu zaman bayraklarini REDDEDER', () => {
  // CASE A
  it('A: weekly + --deadline reddedilir', () => {
    expect(() => parseArgs(weekly('--deadline', '08:00'))).toThrow(
      /--deadline is not supported by --mode weekly/,
    );
  });

  // CASE B
  it('B: weekly + --window reddedilir', () => {
    expect(() => parseArgs(weekly('--window', '22:00-08:00'))).toThrow(
      /--window is not supported by --mode weekly/,
    );
  });

  it('hata mesaji NEDENINI ve dogru yolu soyler', () => {
    let message = '';
    try {
      parseArgs(weekly('--deadline', '08:00'));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('would be silently ignored');
    expect(message).toContain('--target-limit');
    expect(message).toContain('--run-id');
    expect(message).toContain('--mode structure');
  });

  it('tek hedefli haftalik kosuda da reddedilir', () => {
    expect(() =>
      parseArgs([
        '--mode',
        'weekly',
        '--run-id',
        'one',
        '--target-id',
        'audi/a3/a3-sportback/35-tfsi/advanced',
        '--deadline',
        '08:00',
      ]),
    ).toThrow(/not supported by --mode weekly/);
  });
});

describe('yapi kosusunun davranisi DEGISMEZ', () => {
  // CASE C
  it('C: structure + --deadline kabul edilir', () => {
    const args = parseArgs(structure('--deadline', '08:00'));
    expect(args.mode).toBe('structure');
    expect(args.deadline).toBe('08:00');
  });

  // CASE D
  it('D: structure + --window kabul edilir', () => {
    const args = parseArgs(structure('--window', '22:00-08:00'));
    expect(args.mode).toBe('structure');
    expect(args.windowSpec).toBe('22:00-08:00');
  });

  it('--deadline ve --window birlikte hala reddedilir (mevcut kural)', () => {
    expect(() =>
      parseArgs(structure('--deadline', '08:00', '--window', '22:00-08:00')),
    ).toThrow(/alternatives/);
  });
});

describe('normal haftalik komut etkilenmez', () => {
  // CASE E
  it('E: zaman bayragi olmayan haftalik komut normal sekilde ayrisir', () => {
    const args = parseArgs(weekly());
    expect(args.mode).toBe('weekly');
    expect(args.runId).toBe('flag-safety');
    expect(args.allTargets).toBe(true);
    expect(args.targetLimit).toBe(25);
    expect(args.paceMode).toBe('OVERNIGHT');
    expect(args.initialBaselinePages).toBe(20);
    expect(args.deadline).toBeNull();
    expect(args.windowSpec).toBeNull();
  });

  it('mevcut haftalik dogrulamalar korunur', () => {
    // --target-limit yalnizca genis kosuyu sinirlar
    expect(() =>
      parseArgs([
        '--mode',
        'weekly',
        '--run-id',
        'x',
        '--target-id',
        'a/b/c',
        '--target-limit',
        '5',
      ]),
    ).toThrow(/--target-limit only bounds --all-targets/);
    // gecersiz sinir sessizce duzeltilmez
    expect(() => parseArgs(weekly().concat())).not.toThrow();
    expect(() =>
      parseArgs([
        '--mode',
        'weekly',
        '--run-id',
        'x',
        '--all-targets',
        '--target-limit',
        '0',
      ]),
    ).toThrow(/--target-limit must be >= 1/);
  });
});
