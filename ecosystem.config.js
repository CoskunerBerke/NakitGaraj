module.exports = {
  apps: [
    {
      name: 'nakitgaraj-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start:prod',
      watch: false,
      max_memory_restart: '1G',
      // Sırlar burada TUTULMAZ: JWT_SECRET, DATABASE_URL, ALLOWED_ORIGINS vb.
      // backend/.env dosyasından (ConfigModule) veya makine ortamından gelir.
      env: {
        NODE_ENV: 'production',
        PORT: 3001
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
