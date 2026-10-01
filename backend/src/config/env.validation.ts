/**
 * Validates the process environment when the app boots (ConfigModule.forRoot).
 * The backend refuses to start without a JWT secret instead of silently
 * falling back to a guessable default.
 */
const PLACEHOLDER_SECRETS = new Set([
  'change-me',
  'your_super_secret_random_jwt_key_here',
]);

/**
 * JWT secrets that were committed to this repository in the past (the old PM2
 * config and the old fallback in the auth module). They are public in the git
 * history, so anyone could forge admin tokens with them: they are refused in
 * every environment, not only in production. The error never echoes them.
 */
export const LEAKED_JWT_SECRETS: readonly string[] = [
  'super-secret-key-nakitgaraj-premium-2026',
  'your-jwt-secret-key-change-in-production',
];

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
  if (LEAKED_JWT_SECRETS.includes(secret.trim())) {
    throw new Error(
      'JWT_SECRET is a value that was published in the git history of this ' +
        'repository, so anyone can forge admin tokens with it. ' +
        'Rotate your JWT_SECRET: set a new random value ' +
        '(openssl rand -hex 32) in backend/.env and restart the backend. ' +
        'Refusing to start.',
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
