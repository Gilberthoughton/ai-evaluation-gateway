import type { AppConfig } from '../../config/config.js';
import type { AuthService } from '../../application/auth/authService.js';
import type { UserService } from '../../application/auth/userService.js';
import type { PromptService } from '../../application/prompts/promptService.js';
import type { RubricService } from '../../application/rubrics/rubricService.js';
import type { Role } from '../../domain/roles.js';
import type { Logger } from '../../infrastructure/observability/logger.js';

/** A named readiness probe; a throw means "not ready". */
export interface ReadinessCheck {
  name: string;
  check(): Promise<void>;
}

/** Application services exposed to the HTTP layer (wired at the composition root). */
export interface Services {
  auth: AuthService;
  users: UserService;
  prompts: PromptService;
  rubrics: RubricService;
}

/** Everything the HTTP layer needs, injected at the composition root (ADR 0004). */
export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  services: Services;
  verifyAccessToken: (token: string) => { sub: string; role: Role };
  readinessChecks?: ReadinessCheck[];
}
