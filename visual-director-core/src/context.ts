import { hashCreativeDocument } from '@motion-engine/creative-core';
import type { CreativePlan } from '@motion-engine/creative-core';
import {
  P32_CAMERA_DEFINITIONS,
  P32_MOTION_PHRASE_DEFINITIONS,
  P32_SCENE_BRIDGE_DEFINITIONS,
  P32_VISUAL_PATTERN_DEFINITIONS,
  hashVisualDocument,
} from '@motion-engine/visual-core';

import { VisualDirectorContextSchema } from './contracts.ts';
import type { VisualDirectorContext } from './contracts.ts';
import { DIRECTOR_REGISTRY_FINGERPRINTS } from './registry.ts';

export interface VisualDirectorContextOptions {
  readonly narrative_archetype: VisualDirectorContext['narrative_archetype'];
  readonly style_id: string;
  readonly canvas?: VisualDirectorContext['canvas'];
  readonly available_asset_types?: VisualDirectorContext['available_asset_types'];
  readonly supported_materials?: VisualDirectorContext['supported_materials'];
}

function capabilityMap(): Record<string, 'SUPPORTED' | 'SIMPLIFIED' | 'FUTURE'> {
  const entries: [string, 'SUPPORTED' | 'SIMPLIFIED' | 'FUTURE'][] = [];
  for (const definition of [...P32_VISUAL_PATTERN_DEFINITIONS, ...P32_CAMERA_DEFINITIONS, ...P32_SCENE_BRIDGE_DEFINITIONS]) {
    entries.push([definition.id, definition.support === 'supported' ? 'SUPPORTED' : definition.support === 'compatible_simplified' ? 'SIMPLIFIED' : 'FUTURE']);
    for (const capability of definition.required_capabilities) entries.push([capability, capability.startsWith('FUTURE_') ? 'FUTURE' : 'SUPPORTED']);
  }
  for (const definition of P32_MOTION_PHRASE_DEFINITIONS) {
    entries.push([definition.id, 'SUPPORTED']);
    for (const capability of definition.required_capabilities) entries.push([capability, capability.startsWith('FUTURE_') ? 'FUTURE' : 'SUPPORTED']);
  }
  return Object.fromEntries(entries);
}

export function createVisualDirectorContext(plan: CreativePlan, options: VisualDirectorContextOptions): VisualDirectorContext {
  return VisualDirectorContextSchema.parse({
    schema: 'visual-director-context', schema_version: '0.1.0',
    creative_plan_id: plan.plan_id,
    creative_plan_sha256: hashCreativeDocument(plan),
    scene_ids: plan.scenes.map((scene) => scene.id),
    narrative_archetype: options.narrative_archetype,
    canvas: options.canvas ?? '9:16',
    style_id: options.style_id,
    capabilities: capabilityMap(),
    available_asset_types: options.available_asset_types ?? ['PROCEDURAL_VECTOR', 'UI_SURFACE'],
    supported_materials: options.supported_materials ?? ['FLAT', 'GRADIENT', 'LUMINOUS'],
    registry_fingerprints: DIRECTOR_REGISTRY_FINGERPRINTS,
    limits: {
      max_scenes: 16,
      max_technique_compositions_per_scene: 1,
      max_patterns_per_scene: 4,
      max_asset_intents_per_scene: 6,
      max_bridges: 15,
      max_high_complexity_scenes: 5,
    },
  });
}

export function hashVisualDirectorContext(context: VisualDirectorContext): string {
  return hashVisualDocument(context);
}
