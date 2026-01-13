type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProd = process.env.NODE_ENV === 'production';

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
  if (isProd) {
    console.log(JSON.stringify(payload));
  } else {
    console.log(`[${level}]`, message, meta ?? '');
  }
}
