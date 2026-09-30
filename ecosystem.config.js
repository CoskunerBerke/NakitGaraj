module.exports = {
  apps: [
    {
      name: 'nakitgaraj-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start:prod',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_URL: 'file:./dev.db',
        // JWT_SECRET is intentionally not set here: PM2 passes through the
        // server environment and the backend also reads backend/.env.
        // The backend refuses to start if JWT_SECRET is missing.
        // Allowed browser origins for the API (comma-separated). Set it on the
        // server, e.g. CORS_ORIGIN=https://your-domain.com; unset allows any.
        CORS_ORIGIN: process.env.CORS_ORIGIN
      }
    },
    {
      name: 'nakitgaraj-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run start',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
