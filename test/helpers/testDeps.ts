import { createLogger } from '../../src/infrastructure/observability/logger.js';
import type { AppDeps, Services } from '../../src/interface/http/types.js';
import { testConfig } from './testConfig.js';

/** Minimal deps for HTTP tests that do not exercise the application services (e.g. health probes). */
export function buildTestDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    config: testConfig,
    logger: createLogger(testConfig),
    services: {} as Services,
    verifyAccessToken: () => {
      throw new Error('access-token verification not configured in this test');
    },
    readinessChecks: [],
    ...overrides,
  };
}
