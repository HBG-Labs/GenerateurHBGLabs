import { z } from 'zod';

export const VisualEngineLimitsSchema = z.strictObject({
  max_patterns_per_scene: z.number().int().min(1).max(32),
  max_phrases_per_scene: z.number().int().min(1).max(32),
  max_bridges: z.number().int().min(0).max(32),
  max_anchors: z.number().int().min(0).max(64),
  max_depth_layers_per_scene: z.number().int().min(0).max(24),
  max_camera_moves_per_scene: z.number().int().min(0).max(12),
  max_persistent_entities: z.number().int().min(0).max(64),
  max_relations_per_scene: z.number().int().min(0).max(128),
  max_total_entities: z.number().int().min(1).max(384),
  max_json_bytes: z.number().int().min(1_024).max(10_000_000),
});
export type VisualEngineLimits = z.infer<typeof VisualEngineLimitsSchema>;

export const DEFAULT_VISUAL_LIMITS: Readonly<VisualEngineLimits> = Object.freeze({
  max_patterns_per_scene: 8,
  max_phrases_per_scene: 8,
  max_bridges: 15,
  max_anchors: 64,
  max_depth_layers_per_scene: 12,
  max_camera_moves_per_scene: 4,
  max_persistent_entities: 32,
  max_relations_per_scene: 64,
  max_total_entities: 192,
  max_json_bytes: 1_000_000,
});
