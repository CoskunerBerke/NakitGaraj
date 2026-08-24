/**
 * Tek yetkili JWT sırrı çözücüsü.
 *
 * Üretimde (NODE_ENV=production) JWT_SECRET zorunludur; bilinen/yerleşik
 * örnek değerler ve kısa sırlar reddedilir — uygulama açılışta durur.
 * Geliştirmede ise sabit bir dev sırrı kullanılır ki yerel akış bozulmasın.
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'your-jwt-secret-key-change-in-production',
  'your_super_secret_random_jwt_key_here',
  'super-secret-key-nakitgaraj-premium-2026',
  'dev-only-insecure-jwt-secret',
]);

const MIN_PRODUCTION_SECRET_LENGTH = 24;

export function resolveJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret) {
      throw new Error(
        'JWT_SECRET is required in production. Refusing to start with no secret configured.',
      );
    }
    if (KNOWN_PLACEHOLDER_SECRETS.has(secret)) {
      throw new Error(
        'JWT_SECRET is set to a known placeholder value. Refusing to start in production.',
      );
    }
    if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
      );
    }
    return secret;
  }

  return secret || 'dev-only-insecure-jwt-secret';
}
