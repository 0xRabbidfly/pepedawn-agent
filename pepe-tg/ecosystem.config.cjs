module.exports = {
  apps: [{
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
      NODE_ENV: 'production',
      // PM2 hands the app whatever PATH the pm2 daemon was started with, and a
      // daemon started from a non-interactive shell has no ~/.bun/bin — so
      // start-bot.sh reached `elizaos start`, the shell could not find it, and
      // the process died four seconds after printing "Starting bot..." with
      // nothing on stderr. It crash-looped 27 times on 2026-08-31 while the
      // same command run by hand in a login shell worked perfectly.
      //
      // Pinning it here means the app no longer depends on how the daemon was
      // launched, or on whoever last restarted it remembering to export it.
      PATH: `/root/.bun/bin:${process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}`
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
  }]
};
