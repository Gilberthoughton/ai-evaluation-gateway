import { pino, type Logger as PinoLogger, type LoggerOptions } from 'pino';
import type { AppConfig } from '../../config/config.js';

export type Logger = PinoLogger;

/**
 * Builds the application logger. Emits one JSON object per line in non-development environments
 * (ready for log ingestion); pretty-prints in development. Sensitive fields are redacted so tokens,
 * passwords, and API keys never reach the logs (ADR 0008).
 */
export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    base: { service: 'ai-evaluation-gateway' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.tokenHash',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  };

  if (config.NODE_ENV === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    };
  }

  return pino(options);
}
