// pm2 ecosystem file — start with: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [{
    name:        'easyride-api',
    script:      'src/index.js',
    cwd:         __dirname,
    instances:   1,              // bump when Redis Socket.io adapter is added
    exec_mode:   'fork',         // 'cluster' requires sticky sessions for Socket.io
    watch:       false,
    max_memory_restart: '600M',
    kill_timeout:       10000,
    listen_timeout:     10000,
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    },
    // Log paths — pm2 default is ~/.pm2/logs
    out_file: './logs/out.log',
    error_file: './logs/err.log',
    merge_logs: true,
    time: true,
  }],
}
