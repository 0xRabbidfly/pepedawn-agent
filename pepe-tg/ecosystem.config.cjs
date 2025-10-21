module.exports = {
  apps: [{
    name: 'pepe-tg',
    script: 'elizaos',
    args: 'start',
    interpreter: '/root/.bun/bin/bun',
    cwd: '/root/pepedawn-agent/pepe-tg',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    // Health monitoring
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    // Kill timeout - if bot doesn't respond to SIGTERM within 10s, force kill
    kill_timeout: 10000,
    // Log settings
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Advanced monitoring
    listen_timeout: 8000,
    // Restart if no logs for 5 minutes (zombie detection)
    kill_retry_time: 100,
    // Force restart every 24 hours to prevent memory leaks
    cron_restart: '0 2 * * *'
  }]
};
