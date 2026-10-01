import { LEAKED_JWT_SECRETS, validateEnv } from './env.validation';

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

  it('lists both secrets that were published in the git history', () => {
    expect(LEAKED_JWT_SECRETS).toHaveLength(2);
    expect(LEAKED_JWT_SECRETS).toContain(
      'your-jwt-secret-key-change-in-production',
    );
  });

  it.each(['production', 'development', 'test', undefined])(
    'refuses a leaked secret and asks to rotate it (NODE_ENV=%s)',
    (nodeEnv) => {
      for (const leaked of LEAKED_JWT_SECRETS) {
        for (const value of [leaked, `  ${leaked}\n`]) {
          let error: Error | undefined;
          try {
            validateEnv({ JWT_SECRET: value, NODE_ENV: nodeEnv });
          } catch (e) {
            error = e as Error;
          }
          expect(error).toBeDefined();
          expect(error?.message).toMatch(/Rotate your JWT_SECRET/);
          // The message must not repeat the secret.
          expect(error?.message).not.toContain(leaked);
        }
      }
    },
  );

  it('accepts a real secret', () => {
    const config = { JWT_SECRET: 'a'.repeat(64), NODE_ENV: 'production' };
    expect(validateEnv(config)).toBe(config);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
