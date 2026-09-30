/**
 * Base URL of the NestJS API.
 *
 * Set NEXT_PUBLIC_API_URL at build time for deployments, e.g. "/api" behind
 * the Nginx reverse proxy from DEPLOYMENT.md (required when the site is served
 * over HTTPS, otherwise browsers block the plain-HTTP API calls). Without it
 * the browser calls port 3001 on the same host, which suits local development.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3001/api`
    : 'http://127.0.0.1:3001/api');
