const pino = require('pino')

const isDev = process.env.NODE_ENV !== 'production'

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  redact: {
    paths: ['req.headers.authorization', 'passwordHash', '*.passwordHash', 'password', '*.password'],
    censor: '[redacted]',
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
})

// ─── Sentry (optional, activated when SENTRY_DSN is set) ────────────────
let Sentry = null
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    })
    logger.info('[Sentry] initialized')
  } catch (err) {
    logger.warn('[Sentry] init failed: ' + err.message)
    Sentry = null
  }
}

function captureException(err, context = {}) {
  logger.error({ err, ...context }, err?.message || 'exception')
  if (Sentry) Sentry.captureException(err, { extra: context })
}

module.exports = { logger, Sentry, captureException }
