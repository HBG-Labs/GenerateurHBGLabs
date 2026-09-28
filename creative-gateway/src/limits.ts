import { z } from 'zod';

export const GatewayLimitsSchema = z.strictObject({
  max_request_json_bytes: z.number().int().positive(),
  max_response_json_bytes: z.number().int().positive(),
  max_depth: z.number().int().positive(),
  max_nodes: z.number().int().positive(),
  max_string_characters: z.number().int().positive(),
  max_repair_attempts: z.number().int().min(0).max(8),
  max_content_resolutions: z.number().int().positive(),
  max_asset_descriptions: z.number().int().positive(),
  max_timeout_ms: z.number().int().positive(),
});
export type GatewayLimits = z.infer<typeof GatewayLimitsSchema>;

export const DEFAULT_GATEWAY_LIMITS: Readonly<GatewayLimits> = Object.freeze({
  max_request_json_bytes: 131_072,
  max_response_json_bytes: 262_144,
  max_depth: 16,
  max_nodes: 10_000,
  max_string_characters: 20_000,
  max_repair_attempts: 3,
  max_content_resolutions: 128,
  max_asset_descriptions: 64,
  max_timeout_ms: 120_000,
});
