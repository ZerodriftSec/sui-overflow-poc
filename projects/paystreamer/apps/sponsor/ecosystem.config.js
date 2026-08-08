module.exports = {
  apps: [
    {
      name: 'paystreamer-testnet',
      script: 'npm',
      args: 'start',
      cwd: '/path/to/paystreamer-service', // Update this to your droplet path
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        SUI_NETWORK: 'testnet',
        // Add your testnet sponsor key here
      }
    }
  ]
};
