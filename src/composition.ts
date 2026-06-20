import { AuthService } from './application/auth/authService.js';
import { systemClock } from './application/auth/ports.js';
import { UserService } from './application/auth/userService.js';
import type { AppConfig } from './config/config.js';
import { createDb, type DbHandle } from './infrastructure/db/client.js';
import { createRefreshTokenRepository } from './infrastructure/db/repositories/refreshTokenRepository.js';
import { createUserRepository } from './infrastructure/db/repositories/userRepository.js';
import { argon2PasswordHasher } from './infrastructure/security/argon2PasswordHasher.js';
import { createAccessTokens } from './infrastructure/security/jwt.js';
import type { Logger } from './infrastructure/observability/logger.js';
import type { AppDeps } from './interface/http/types.js';

export interface Composition {
  deps: AppDeps;
  db: DbHandle;
  close(): Promise<void>;
}

/**
 * Composition root: wires concrete adapters (Drizzle repositories, argon2, JWT) into the application
 * services and assembles the dependency bundle the HTTP layer consumes. The only place that knows
 * about every concrete dependency.
 */
export function compose(config: AppConfig, logger: Logger): Composition {
  const dbHandle = createDb(config.DATABASE_URL);

  const userRepository = createUserRepository(dbHandle.db);
  const refreshTokenRepository = createRefreshTokenRepository(dbHandle.db);
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

  const deps: AppDeps = {
    config,
    logger,
    services: { auth: authService, users: userService },
    verifyAccessToken: (token) => accessTokens.verify(token),
    readinessChecks: [{ name: 'postgres', check: () => dbHandle.ping() }],
  };

  return { deps, db: dbHandle, close: () => dbHandle.close() };
}
