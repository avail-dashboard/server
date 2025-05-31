module.exports = {
  apps: [
    {
      name: 'avail-explorer-backend',
      script: 'dist/index.js',
      env_file: '.env.production',
      autorestart: true,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};