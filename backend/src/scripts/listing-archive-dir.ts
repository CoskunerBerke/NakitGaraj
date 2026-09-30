/**
 * Local folder with saved listing pages (one sub-folder per brand) used by the
 * data-import scripts. It lives only on the operator's machine, so its path
 * comes from LISTING_ARCHIVE_DIR (shell environment or backend/.env).
 */
export function getListingArchiveDir(): string {
  if (!process.env.LISTING_ARCHIVE_DIR) {
    try {
      // Scripts run with ts-node from backend/, which does not load .env itself.
      process.loadEnvFile('.env');
    } catch {
      // No .env file: rely on the shell environment.
    }
  }
  const dir = process.env.LISTING_ARCHIVE_DIR;
  if (!dir) {
    console.error(
      'LISTING_ARCHIVE_DIR is not set. Point it at the folder with the saved listing ' +
        'pages (one sub-folder per brand), e.g. in backend/.env.',
    );
    process.exit(1);
  }
  return dir;
}
