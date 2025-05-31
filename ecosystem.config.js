module.exports = {
  apps: [
    {
      name: 'avail-explorer-backend',
      script: 'dist/index.js',
      env_file: '.env.production',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      pre_deploy: 'npm run build'
    }
  ]
};