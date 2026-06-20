import { Worker } from 'bullmq';
import { compose } from './composition.js';
import { loadConfig } from './config/config.js';
import { createLogger } from './infrastructure/observability/logger.js';
import { createRedisConnection } from './infrastructure/queue/connection.js';
import {
  EVALUATION_AUTOMATED_QUEUE,
  type AutomatedCheckJob,
} from './infrastructure/queue/evaluationQueue.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const composition = compose(config, logger);

  // BullMQ workers need their own blocking connection, separate from the enqueue side.
  const connection = createRedisConnection(config.REDIS_URL);

  const worker = new Worker<AutomatedCheckJob, void, string>(
    EVALUATION_AUTOMATED_QUEUE,
    async (job) => {
      await composition.evaluationService.runAutomatedChecks(job.data.evaluationId, job.data.correlationId);
    },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, correlationId: job.data.correlationId }, 'automated-check job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'automated-check job failed');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'worker shutting down');
    worker
      .close()
      .then(() => composition.close())
      .then(() => {
        connection.disconnect();
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'error during worker shutdown');
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('evaluation worker started');
}

void main();
