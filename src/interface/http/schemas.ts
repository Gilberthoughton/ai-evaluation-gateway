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

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().optional(),
});

export const promptApiSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  language: z.string(),
  difficulty: z.string().nullable(),
  tags: z.array(z.string()),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const submissionApiSchema = z.object({
  id: z.string().uuid(),
  promptId: z.string().uuid(),
  modelName: z.string(),
  modelVersion: z.string().nullable(),
  output: z.string(),
  metadata: z.record(z.unknown()),
  submittedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});
