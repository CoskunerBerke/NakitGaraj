import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { LEAKED_JWT_SECRET_SHA256, validateEnv } from './env.validation';

// Stand-in for a leaked secret: the real values are kept out of the current
// source, so the refusal path is tested with this value's digest instead.
const LEAKED_FOR_TEST = 'leaked-secret-for-tests';
const TEST_DIGESTS = [
  createHash('sha256').update(LEAKED_FOR_TEST, 'utf8').digest('hex'),
];

const PM2_RECREATE_BACKEND =
  'pm2 delete nakitgaraj-backend && ' +
  'pm2 start ecosystem.config.js --only nakitgaraj-backend && pm2 save';

describe('validateEnv', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('refuses to start when JWT_SECRET is missing or blank', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET is not set/);
    expect(() => validateEnv({ JWT_SECRET: '   ' })).toThrow(
      /JWT_SECRET is not set/,
    );
  });

  it('refuses the .env.example placeholder in production', () => {
    expect(() =>
      validateEnv({ JWT_SECRET: 'change-me', NODE_ENV: 'production' }),
    ).toThrow(/placeholder/);
  });

  it('only warns about the placeholder outside production', () => {
    const config = { JWT_SECRET: 'change-me', NODE_ENV: 'development' };
    expect(validateEnv(config)).toBe(config);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('placeholder'),
    );
  });

  it('keeps SHA-256 digests (not the values) of both leaked secrets', () => {
    expect(LEAKED_JWT_SECRET_SHA256).toHaveLength(2);
    for (const digest of LEAKED_JWT_SECRET_SHA256) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
    const source = fs.readFileSync(
      path.join(__dirname, 'env.validation.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/secret-key/);
  });

  it.each(['production', 'development', 'test', undefined])(
    'refuses a leaked secret and asks to rotate it (NODE_ENV=%s)',
    (nodeEnv) => {
      for (const leaked of [LEAKED_FOR_TEST]) {
        for (const value of [leaked, `  ${leaked}\n`]) {
          let error: Error | undefined;
          try {
            validateEnv({ JWT_SECRET: value, NODE_ENV: nodeEnv }, TEST_DIGESTS);
          } catch (e) {
            error = e as Error;
          }
          expect(error).toBeDefined();
          expect(error?.message).toMatch(/Rotate your JWT_SECRET/);
          // Editing backend/.env alone does not help when the old secret is
          // still in the PM2 environment, so the message must say so.
          expect(error?.message).toMatch(
            /process or PM2 environment overrides backend\/\.env/,
          );
          expect(error?.message).toContain(PM2_RECREATE_BACKEND);
          // The message must not repeat the secret.
          expect(error?.message).not.toContain(leaked);
        }
      }
    },
  );

  it('names the PM2 app from ecosystem.config.js in the recovery command', () => {
    const ecosystem = fs.readFileSync(
      path.join(__dirname, '../../../ecosystem.config.js'),
      'utf8',
    );
    expect(ecosystem).toContain("name: 'nakitgaraj-backend'");
  });

  it('accepts a real secret', () => {
    const config = { JWT_SECRET: 'a'.repeat(64), NODE_ENV: 'production' };
    expect(validateEnv(config)).toBe(config);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
