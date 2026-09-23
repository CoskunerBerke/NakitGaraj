/**
 * BUDAMA ARACININ ARGUMANLARI — yanlis yazim sessizce silmeye donusmemeli.
 */
import { PruneArgs, parseArgs } from './published-prune-cli';

describe('published prune CLI arguments', () => {
  const parse = (argv: string[]): PruneArgs => parseArgs(argv);

  test('deleting is never the default', () => {
    expect(parse([]).apply).toBe(false);
    expect(parse(['--dry-run']).apply).toBe(false);
    expect(parse(['--json']).apply).toBe(false);
  });

  test('--apply is the only way to delete', () => {
    expect(parse(['--apply']).apply).toBe(true);
  });

  test('--apply and --dry-run together are rejected', () => {
    expect(() => parse(['--apply', '--dry-run'])).toThrow(/contradict/);
  });

  test('an unknown or mistyped flag is rejected, not ignored', () => {
    expect(() => parse(['--aply'])).toThrow(/unknown argument "--aply"/);
    expect(() => parse(['--force'])).toThrow(/unknown argument/);
    expect(() => parse(['oops'])).toThrow(/unknown argument "oops"/);
  });

  test('a flag with a missing value is rejected instead of becoming undefined', () => {
    expect(() => parse(['--root'])).toThrow(/--root needs a value/);
    expect(() => parse(['--root', '--json'])).toThrow(/--root needs a value/);
    expect(() => parse(['--retain'])).toThrow(/--retain needs a value/);
  });

  test('--retain only accepts a non-negative number', () => {
    expect(parse(['--retain', '5']).keepCount).toBe(5);
    expect(parse(['--keep', '0']).keepCount).toBe(0);
    expect(() => parse(['--retain', '-1'])).toThrow(/non-negative/);
    expect(() => parse(['--retain', 'many'])).toThrow(/non-negative/);
  });

  test('--root is taken verbatim, including Windows paths', () => {
    expect(parse(['--root', 'C:\\dev\\published']).root).toBe(
      'C:\\dev\\published',
    );
  });

  test('the default root is the weekly published directory', () => {
    expect(parse([]).root).toMatch(/market-refresh[\\/]weekly[\\/]published$/);
  });
});
