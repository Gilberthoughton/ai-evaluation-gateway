import { loadConfig } from './config/config.js';
import { createLogger } from './infrastructure/observability/logger.js';
import { buildApp } from './interface/http/app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const app = await buildApp({ config, logger });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'error during shutdown');
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
