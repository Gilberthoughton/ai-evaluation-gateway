import { AuthService } from './application/auth/authService.js';
import { systemClock } from './application/auth/ports.js';
import { UserService } from './application/auth/userService.js';
import { EvaluationService } from './application/evaluations/evaluationService.js';
import { PromptService } from './application/prompts/promptService.js';
import { RubricService } from './application/rubrics/rubricService.js';
import type { AppConfig } from './config/config.js';
import { createDb, type DbHandle } from './infrastructure/db/client.js';
import { createEvaluationRepository } from './infrastructure/db/repositories/evaluationRepository.js';
import { createPromptRepository } from './infrastructure/db/repositories/promptRepository.js';
import { createRubricRepository } from './infrastructure/db/repositories/rubricRepository.js';
import { createRefreshTokenRepository } from './infrastructure/db/repositories/refreshTokenRepository.js';
import { createSubmissionRepository } from './infrastructure/db/repositories/submissionRepository.js';
import { createUserRepository } from './infrastructure/db/repositories/userRepository.js';
import { createRedisConnection } from './infrastructure/queue/connection.js';
import { createEvaluationQueue, type EvaluationQueue } from './infrastructure/queue/evaluationQueue.js';
import { argon2PasswordHasher } from './infrastructure/security/argon2PasswordHasher.js';
import { createAccessTokens } from './infrastructure/security/jwt.js';
import type { Logger } from './infrastructure/observability/logger.js';
import type { Redis } from 'ioredis';
import type { AppDeps } from './interface/http/types.js';

export interface Composition {
  deps: AppDeps;
  db: DbHandle;
  redis: Redis;
  evaluationQueue: EvaluationQueue;
  /** Exposed so the worker process can drive the pipeline using the same wiring. */
  evaluationService: EvaluationService;
  close(): Promise<void>;
}

/**
 * Composition root: wires concrete adapters (Drizzle repositories, Redis/BullMQ, argon2, JWT) into
 * the application services and assembles the dependency bundle the HTTP layer consumes. The only
 * place that knows about every concrete dependency.
 */
export function compose(config: AppConfig, logger: Logger): Composition {
  const dbHandle = createDb(config.DATABASE_URL);
  const redis = createRedisConnection(config.REDIS_URL);
  const evaluationQueue = createEvaluationQueue(redis);

  const userRepository = createUserRepository(dbHandle.db);
  const refreshTokenRepository = createRefreshTokenRepository(dbHandle.db);
  const submissionRepository = createSubmissionRepository(dbHandle.db);
  const rubricRepository = createRubricRepository(dbHandle.db);
  const evaluationRepository = createEvaluationRepository(dbHandle.db);
  const accessTokens = createAccessTokens(config.JWT_ACCESS_SECRET, config.JWT_ACCESS_TTL);

  const authService = new AuthService(
    userRepository,
    refreshTokenRepository,
    argon2PasswordHasher,
    accessTokens.issuer,
    systemClock,
    { refreshSecret: config.JWT_REFRESH_SECRET, refreshTtlSeconds: config.JWT_REFRESH_TTL },
  );
  const userService = new UserService(userRepository, argon2PasswordHasher);
  const promptService = new PromptService(createPromptRepository(dbHandle.db), submissionRepository);
  const rubricService = new RubricService(rubricRepository);
  const evaluationService = new EvaluationService(
    evaluationRepository,
    submissionRepository,
    rubricRepository,
    evaluationQueue.adapter,
  );

  const deps: AppDeps = {
    config,
    logger,
    services: {
      auth: authService,
      users: userService,
      prompts: promptService,
      rubrics: rubricService,
      evaluations: evaluationService,
    },
    verifyAccessToken: (token) => accessTokens.verify(token),
    readinessChecks: [
      { name: 'postgres', check: () => dbHandle.ping() },
      {
        name: 'redis',
        check: async () => {
          await redis.ping();
        },
      },
    ],
  };

  return {
    deps,
    db: dbHandle,
    redis,
    evaluationQueue,
    evaluationService,
    close: async () => {
      await evaluationQueue.close();
      await dbHandle.close();
      redis.disconnect();
    },
  };
}
