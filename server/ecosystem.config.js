module.exports = {
  apps: [{
    name: 'genesis-error-terminal',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3777,
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    time: true,
  }],
};
