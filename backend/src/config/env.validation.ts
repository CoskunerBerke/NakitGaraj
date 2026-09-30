/**
 * Validates the process environment when the app boots (ConfigModule.forRoot).
 * The backend refuses to start without a JWT secret instead of silently
 * falling back to a guessable default.
 */
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'your_super_secret_random_jwt_key_here',
]);

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const secret = config.JWT_SECRET;
  if (typeof secret !== 'string' || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start the backend. ' +
        'Set JWT_SECRET in backend/.env or in the server environment ' +
        '(generate one with: openssl rand -hex 32).',
    );
  }
  if (PLACEHOLDER_SECRETS.has(secret.trim())) {
    const message =
      'JWT_SECRET still has the placeholder value from .env.example. ' +
      'Replace it with a random value (openssl rand -hex 32).';
    // Anyone who has read .env.example could forge admin tokens with a
    // placeholder secret, so production refuses it; development only warns.
    if (config.NODE_ENV === 'production') {
      throw new Error(`${message} Refusing to start in production.`);
    }
    console.warn(`WARNING: ${message}`);
  }
  return config;
}
