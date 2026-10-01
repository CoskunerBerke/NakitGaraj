import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS settings for the API.
 *
 * - CORS_ORIGIN set (comma-separated, e.g. https://example.com): only those
 *   browser origins may call the API from another site.
 * - CORS_ORIGIN unset in production (NODE_ENV=production): no cross-origin
 *   requests at all. The site and the API share one origin behind Nginx
 *   (/api, see DEPLOYMENT.md), so same-origin requests keep working.
 * - CORS_ORIGIN unset outside production: every origin is allowed, so the
 *   Next.js dev server on :3000 can call the API on :3001.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv): CorsOptions {
  const origins = (env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    return { origin: origins, credentials: true };
  }
  if (env.NODE_ENV === 'production') {
    return { origin: false };
  }
  return { origin: true, credentials: true };
}
