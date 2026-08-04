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
        JWT_SECRET: 'super-secret-key-nakitgaraj-premium-2026',
        CORS_ORIGIN: 'http://localhost:3000'
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
