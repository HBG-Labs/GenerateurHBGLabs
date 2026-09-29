import { z } from 'zod';

export const EngineLimitsSchema = z.strictObject({
  max_duration_frames: z.number().int().positive(),
  max_scenes: z.number().int().positive(),
  max_layers: z.number().int().positive(),
  max_text_length: z.number().int().positive(),
  max_keyframes: z.number().int().positive(),
  max_asset_dimensions: z.number().int().positive(),
  max_asset_bytes: z.number().int().positive(),
  max_assets: z.number().int().positive(),
  max_fonts: z.number().int().positive(),
  max_audio_cues: z.number().int().positive(),
  max_subtitle_segments: z.number().int().positive(),
  max_dynamic_typography_tracks: z.number().int().positive(),
  max_dynamic_axes_per_run: z.number().int().positive().max(2),
  max_dynamic_typography_critical_states: z.number().int().positive().max(128),
});
export type EngineLimits = z.infer<typeof EngineLimitsSchema>;

/** Central P1.5 denial-of-service budget. Its enumerable shape is historically certified. */
export const DEFAULT_ENGINE_LIMITS: Readonly<EngineLimits> = Object.freeze({
  max_duration_frames: 18_000,
  max_scenes: 64,
  max_layers: 512,
  max_text_length: 20_000,
  max_keyframes: 20_000,
  max_asset_dimensions: 16_384,
  max_asset_bytes: 64 * 1024 * 1024,
  max_assets: 128,
  max_fonts: 64,
  max_audio_cues: 1_024,
  max_subtitle_segments: 1_024,
} as EngineLimits);

/** Additive P1.7 budgets kept separate so DEFAULT_ENGINE_LIMITS remains byte-for-byte compatible. */
export const P17_DYNAMIC_TYPOGRAPHY_LIMITS = Object.freeze({
  max_dynamic_typography_tracks: 128,
  max_dynamic_axes_per_run: 2,
  max_dynamic_typography_critical_states: 96,
});

export function resolveEngineLimits(overrides: Partial<EngineLimits> = {}): EngineLimits {
  return EngineLimitsSchema.parse({ ...DEFAULT_ENGINE_LIMITS, ...P17_DYNAMIC_TYPOGRAPHY_LIMITS, ...overrides });
}
