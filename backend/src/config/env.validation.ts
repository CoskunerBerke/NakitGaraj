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
    // Old ecosystem.config.js files put the leaked secret into the PM2
    // environment. PM2 keeps that environment across restarts and process.env
    // wins over backend/.env, so editing backend/.env alone is not enough.
    throw new Error(
      'JWT_SECRET is a value that was published in the git history of this ' +
        'repository, so anyone can forge admin tokens with it. ' +
        'Refusing to start. ' +
        'Rotate your JWT_SECRET: set a new random value ' +
        '(openssl rand -hex 32) in backend/.env. ' +
        'A JWT_SECRET in the process or PM2 environment overrides ' +
        'backend/.env, and PM2 keeps the environment a process was first ' +
        'started with (pm2 restart does not remove it). Under PM2, remove ' +
        'any old JWT_SECRET from the shell or server environment, then ' +
        'recreate the backend from the project root: ' +
        'pm2 delete nakitgaraj-backend && ' +
        'pm2 start ecosystem.config.js --only nakitgaraj-backend && ' +
        'pm2 save (see DEPLOYMENT.md).',
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
