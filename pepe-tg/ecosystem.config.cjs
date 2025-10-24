module.exports = {
  apps: [
    {
      name: 'pepe-tg',
      script: 'bun',
      args: 'run start',
      cwd: '/root/pepedawn-agent/pepe-tg',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production'
      },
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 10000,
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      listen_timeout: 8000,
      kill_retry_time: 100,
      cron_restart: '0 2 * * *'
    },
    {
      name: 'embedding-service',
      script: 'main.py',
      interpreter: '/root/pepedawn-agent/pepe-tg/embedding-service/.venv/bin/python',
      cwd: '/root/pepedawn-agent/pepe-tg/embedding-service',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        PORT: '8001'
      },
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      log_file: './logs/embedding-combined.log',
      out_file: './logs/embedding-out.log',
      error_file: './logs/embedding-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
