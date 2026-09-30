import { validateEnv } from './env.validation';

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

  it('accepts a real secret', () => {
    const config = { JWT_SECRET: 'a'.repeat(64), NODE_ENV: 'production' };
    expect(validateEnv(config)).toBe(config);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
