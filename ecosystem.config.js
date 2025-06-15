module.exports = {
  apps: [
    {
      name: 'avail-explorer-backend',
      script: 'npm start',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      pre_deploy: 'npm run build'
    }
  ]
};