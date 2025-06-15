module.exports = {
  apps: [
    {
      name: 'avail-explorer-backend',
      script: 'npm start',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        ENV_FILE: '.env.production'
      },
      pre_deploy: 'npm run build'
    }
  ]
};