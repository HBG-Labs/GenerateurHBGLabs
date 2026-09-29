import type { CreativePlan } from '@motion-engine/creative-core';
import type { MotionSceneSpec, PatternDefinition, Platform, ResolvedStyle } from '@motion-engine/core';
import type {
  SceneBridge,
  VisualDiagnostic,
  VisualEntity,
  VisualPlan,
  VisualPreflightReport,
  VisualScene,
} from '@motion-engine/visual-core';

export const VISUAL_COMPILER_VERSION = '0.1.0';

export interface VisualSceneDirection extends Omit<VisualScene, 'id' | 'source_scene_id' | 'duration_ms'> {
  readonly source_scene_id: string;
}

export interface VisualDirection {
  readonly style_id: string;
  readonly scenes: readonly VisualSceneDirection[];
  readonly bridges: readonly Omit<SceneBridge, 'id'>[];
  readonly motifs: VisualPlan['motifs'];
}

export interface CreativeToVisualOptions {
  readonly direction?: VisualDirection;
  readonly style_id: string;
}

export interface VisualCompileOptions {
  readonly resolved_style: ResolvedStyle;
  readonly pattern: PatternDefinition;
  readonly target_platform: Platform;
  readonly asset_refs?: ReadonlySet<string>;
}

export interface VisualProvenanceEntry {
  readonly creative_scene_id: string;
  readonly visual_scene_id: string;
  readonly visual_entity_id: string;
  readonly motion_scene_id: string;
  readonly motion_layer_id: string;
  readonly patterns: readonly string[];
  readonly phrases: readonly string[];
}

export interface VisualCompileResult {
  readonly ok: boolean;
  readonly motion_spec: MotionSceneSpec | null;
  readonly preflight: VisualPreflightReport;
  readonly diagnostics: readonly VisualDiagnostic[];
  readonly provenance: readonly VisualProvenanceEntry[];
  readonly hashes: {
    readonly visual_plan: string;
    readonly motion_spec: string | null;
    readonly compiler_fingerprint: string;
  };
}

export type { CreativePlan, VisualPlan, VisualEntity };
