import type { z } from 'zod';

import {
  deriveCreativeId,
  hashCreativeDocument,
  sortCreativeDiagnostics,
  type CreativeDiagnostic,
} from '@motion-engine/creative-core';

import {
  CREATIVE_GENERATION_REQUEST_VERSION,
  CreativeGenerationRequestSchema,
  type CreativeGenerationRequest,
} from './contracts.ts';
import type { GatewayLimits } from './limits.ts';
import { DEFAULT_GATEWAY_LIMITS } from './limits.ts';
import { inspectGatewayInput } from './security.ts';

export type CreateCreativeGenerationRequestInput = Omit<
  CreativeGenerationRequest,
  'schema' | 'schema_version' | 'request_id' | 'idempotency_key'
>;

function identityPayload(input: CreateCreativeGenerationRequestInput) {
  return {
    idea: input.idea,
    creative_goal: input.creative_goal,
    target_duration_ms: input.target_duration_ms,
    target_format: input.target_format,
    audience: input.audience,
    language: input.language,
    locale: input.locale,
    tone: input.tone,
    desired_reaction: input.desired_reaction,
    factual_mode: input.factual_mode,
    cta: input.cta,
    constraints: input.constraints,
  };
}

export function createCreativeGenerationRequest(input: CreateCreativeGenerationRequestInput): CreativeGenerationRequest {
  const idempotencyKey = hashCreativeDocument(identityPayload(input));
  return CreativeGenerationRequestSchema.parse({
    schema: 'creative-generation-request',
    schema_version: CREATIVE_GENERATION_REQUEST_VERSION,
    request_id: deriveCreativeId('creative_request', idempotencyKey),
    idempotency_key: idempotencyKey,
    ...input,
  });
}

function pathFor(issue: z.core.$ZodIssue): string {
  return issue.path.reduce<string>((path, part) => typeof part === 'number' ? `${path}[${part}]` : `${path}.${String(part)}`, '$');
}

export interface RequestValidationResult {
  readonly ok: boolean;
  readonly value: CreativeGenerationRequest | null;
  readonly diagnostics: readonly CreativeDiagnostic[];
}

export function validateCreativeGenerationRequest(
  input: unknown,
  limits: GatewayLimits = DEFAULT_GATEWAY_LIMITS,
): RequestValidationResult {
  const diagnostics = inspectGatewayInput(input, 'request', limits);
  if (diagnostics.some((entry) => entry.severity === 'error')) {
    return { ok: false, value: null, diagnostics: sortCreativeDiagnostics(diagnostics) };
  }
  const parsed = CreativeGenerationRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issues: CreativeDiagnostic[] = parsed.error.issues.map((issue) => ({
      code: issue.code === 'unrecognized_keys' ? 'gateway.request.unknown_field' : 'gateway.request.schema_invalid',
      severity: 'error', path: pathFor(issue), message: issue.message,
      suggested_action: 'Corriger la requête selon CreativeGenerationRequest 0.1.0.',
    }));
    return { ok: false, value: null, diagnostics: sortCreativeDiagnostics(issues) };
  }
  const value = parsed.data;
  const semantic: CreativeDiagnostic[] = [];
  if (!value.locale.toLowerCase().startsWith(`${value.language.toLowerCase()}-`) && value.locale !== value.language) {
    semantic.push({
      code: 'gateway.request.locale_language_mismatch', severity: 'error', path: '$.locale',
      message: 'La locale ne correspond pas à la langue de la requête.',
      suggested_action: 'Aligner language et locale sans demander au provider de traduire implicitement.',
    });
  }
  const expectedKey = hashCreativeDocument(identityPayload(value));
  const expectedId = deriveCreativeId('creative_request', expectedKey);
  if (value.idempotency_key !== expectedKey || value.request_id !== expectedId) {
    semantic.push({
      code: 'gateway.request.identity_mismatch', severity: 'error', path: '$.request_id',
      message: 'L’identité déterministe de la requête ne correspond pas à son contenu.',
      suggested_action: 'Reconstruire la requête avec createCreativeGenerationRequest().',
    });
  }
  return { ok: semantic.length === 0, value: semantic.length === 0 ? value : null, diagnostics: sortCreativeDiagnostics(semantic) };
}
