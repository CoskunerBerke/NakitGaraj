import { resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret (production secret validation)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    if (originalEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  });

  it('rejects missing JWT_SECRET in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => resolveJwtSecret()).toThrow(/required in production/i);
  });

  it('rejects known placeholder secrets in production', () => {
    process.env.NODE_ENV = 'production';
    for (const known of [
      'your-jwt-secret-key-change-in-production',
      'your_super_secret_random_jwt_key_here',
      'super-secret-key-nakitgaraj-premium-2026',
    ]) {
      process.env.JWT_SECRET = known;
      expect(() => resolveJwtSecret()).toThrow(/placeholder/i);
    }
  });

  it('rejects short secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'short-secret';
    expect(() => resolveJwtSecret()).toThrow(/at least/i);
  });

  it('accepts a strong unique secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(16) + 'unique-strong-suffix';
    expect(resolveJwtSecret()).toBe('a'.repeat(16) + 'unique-strong-suffix');
  });

  it('falls back to an isolated dev secret outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    expect(resolveJwtSecret()).toBe('dev-only-insecure-jwt-secret');
  });
});
