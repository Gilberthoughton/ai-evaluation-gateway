import { z } from 'zod';
import { ROLES } from '../../domain/roles.js';

/** Shared Zod schemas reused across routes (validation + OpenAPI source of truth, ADR 0006). */
export const roleSchema = z.enum(ROLES);

export const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: roleSchema,
  status: z.string(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
