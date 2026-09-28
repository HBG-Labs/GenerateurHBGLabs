import { z } from 'zod';

import { hashCreativeDocument } from '@motion-engine/creative-core';

export const OPENAI_PROVIDER_ADAPTER_VERSION = '0.1.0' as const;
export const OPENAI_PLANNING_PROMPT_VERSION = 'creative_planning_prompt@0.1.1' as const;
export const OPENAI_RESOLUTION_PROMPT_VERSION = 'creative_resolution_prompt@0.1.7' as const;
export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna' as const;

export const OpenAIProviderConfigSchema = z.strictObject({
  model: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/).default(DEFAULT_OPENAI_MODEL),
  reasoning_effort: z.enum(['none', 'low', 'medium', 'high']).default('low'),
  max_output_tokens: z.number().int().min(512).max(32_768).default(8_192),
  timeout_ms: z.number().int().min(1_000).max(120_000).default(60_000),
  max_transport_retries: z.number().int().min(0).max(2).default(1),
  max_provider_calls: z.number().int().min(2).max(8).default(4),
});
export type OpenAIProviderConfig = z.infer<typeof OpenAIProviderConfigSchema>;

export const OpenAIProviderFingerprintSchema = z.strictObject({
  schema: z.literal('openai-provider-config-fingerprint'),
  schema_version: z.literal('0.1.0'),
  adapter_version: z.literal(OPENAI_PROVIDER_ADAPTER_VERSION),
  provider_id: z.literal('openai'),
  model: z.string(),
  prompts: z.strictObject({
    planning: z.literal(OPENAI_PLANNING_PROMPT_VERSION),
    resolution: z.literal(OPENAI_RESOLUTION_PROMPT_VERSION),
  }),
  generation: z.strictObject({
    reasoning_effort: z.enum(['none', 'low', 'medium', 'high']),
    max_output_tokens: z.number().int(),
    max_transport_retries: z.number().int(),
    max_provider_calls: z.number().int(),
  }),
  output_schema_version: z.literal('0.1.0'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type OpenAIProviderFingerprint = z.infer<typeof OpenAIProviderFingerprintSchema>;

export function resolveOpenAIProviderConfig(input: Partial<OpenAIProviderConfig> = {}): OpenAIProviderConfig {
  return OpenAIProviderConfigSchema.parse(input);
}

export function createOpenAIProviderFingerprint(config: OpenAIProviderConfig): OpenAIProviderFingerprint {
  const payload = {
    schema: 'openai-provider-config-fingerprint' as const,
    schema_version: '0.1.0' as const,
    adapter_version: OPENAI_PROVIDER_ADAPTER_VERSION,
    provider_id: 'openai' as const,
    model: config.model,
    prompts: {
      planning: OPENAI_PLANNING_PROMPT_VERSION,
      resolution: OPENAI_RESOLUTION_PROMPT_VERSION,
    },
    generation: {
      reasoning_effort: config.reasoning_effort,
      max_output_tokens: config.max_output_tokens,
      max_transport_retries: config.max_transport_retries,
      max_provider_calls: config.max_provider_calls,
    },
    output_schema_version: '0.1.0' as const,
  };
  return OpenAIProviderFingerprintSchema.parse({ ...payload, sha256: hashCreativeDocument(payload) });
}

export interface OpenAIProviderLogEvent {
  readonly request_id: string;
  readonly stage: 'planning' | 'resolution';
  readonly provider: 'openai';
  readonly model: string;
  readonly attempt: number;
  readonly latency_ms: number;
  readonly result: 'accepted' | 'failed';
  readonly failure_kind?: string;
}

export type OpenAIProviderLogger = (event: OpenAIProviderLogEvent) => void;
