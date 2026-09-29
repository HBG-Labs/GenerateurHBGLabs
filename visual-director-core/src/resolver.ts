import { hashCreativeDocument } from '@motion-engine/creative-core';
import type { CreativePlan, SceneIntent } from '@motion-engine/creative-core';
import {
  P32_CAMERA_REGISTRY,
  P32_MOTION_PHRASE_REGISTRY,
  P32_SCENE_BRIDGE_REGISTRY,
  P32_VISUAL_GRAMMAR,
  P32_VISUAL_PATTERN_REGISTRY,
  P32_VISUAL_PLAN_VERSION,
  VisualPlanSchema,
  buildVisualPreflight,
  hashVisualDocument,
  visualStableId,
} from '@motion-engine/visual-core';
import type { VisualEntity, VisualPlan, VisualScene } from '@motion-engine/visual-core';

import type {
  SceneDirection,
  SequenceCoherenceReport,
  VisualDecisionTrace,
  VisualDirectionPlan,
  VisualDirectionPreflightReport,
  VisualDirectorContext,
} from './contracts.ts';
import { buildSequenceCoherenceReport } from './coherence.ts';
import { buildVisualDirectionPreflight } from './preflight.ts';
import {
  DIRECTOR_DEFAULTS,
  MOTION_IDENTITY_REGISTRY,
  TECHNIQUE_COMPOSITION_REGISTRY,
  VISUAL_DIRECTOR_FINGERPRINT,
} from './registry.ts';

export interface VisualDirectionCompileResult {
  readonly ok: boolean;
  readonly direction_plan: VisualDirectionPlan | null;
  readonly direction_preflight: VisualDirectionPreflightReport;
  readonly coherence: SequenceCoherenceReport | null;
  readonly decision_trace: VisualDecisionTrace | null;
  readonly visual_plan: VisualPlan | null;
  readonly visual_preflight: ReturnType<typeof buildVisualPreflight> | null;
  readonly hashes: {
    readonly director: string;
    readonly direction_plan: string | null;
    readonly decision_trace: string | null;
    readonly visual_plan: string | null;
  };
}

const styles = Object.freeze({
  group: { fill: 'background' as const, stroke: 'accent' as const, text: 'foreground' as const },
  text: { fill: 'background' as const, stroke: 'accent' as const, text: 'foreground' as const },
  shape: { fill: 'accent' as const, stroke: 'foreground' as const, text: 'foreground' as const },
  path: { fill: 'background' as const, stroke: 'accent' as const, text: 'foreground' as const },
  mask: { fill: 'accent' as const, stroke: 'accent' as const, text: 'foreground' as const },
});
const transform = { scale: 1, rotate_deg: 0, translate_x: 0, translate_y: 0 };

function displayText(scene: SceneIntent): string {
  return (scene.content.on_screen[0]?.text ?? scene.content.spoken[0]?.text ?? scene.content.semantic_meaning ?? scene.semantic_purpose).slice(0, 240);
}

function textRole(direction: SceneDirection): NonNullable<VisualEntity['text']>['role'] {
  if (direction.focus === 'DATA') return 'DATA';
  if (direction.visual_role === 'HOOK' || direction.focus === 'TYPE') return 'DISPLAY';
  if (direction.visual_role === 'PAYOFF') return 'HEADLINE';
  return 'SUBHEAD';
}

function focusKind(direction: SceneDirection): VisualEntity['kind'] {
  if (direction.focus === 'TYPE' || direction.focus === 'DATA') return 'text';
  if (direction.focus === 'DIAGRAM' || direction.focus === 'PHENOMENON') return 'shape';
  return 'group';
}

function entity(
  id: string,
  kind: VisualEntity['kind'],
  semanticRole: string,
  hierarchy: VisualEntity['hierarchy'],
  options: {
    text?: string;
    persistentId?: string | null;
    region?: VisualEntity['region'];
    parent?: string | null;
    scale?: number;
    shapeKind?: NonNullable<VisualEntity['shape']>['kind'];
    fill?: VisualEntity['style']['fill'];
  } = {},
): VisualEntity {
  const baseStyle = kind === 'shape' ? styles.shape : kind === 'path' ? styles.path : kind === 'mask' ? styles.mask : kind === 'text' ? styles.text : styles.group;
  return {
    id,
    visual_entity_id: options.persistentId ?? null,
    kind,
    semantic_role: semanticRole,
    hierarchy,
    region: options.region ?? 'center',
    parent_id: options.parent ?? null,
    persistent: (options.persistentId ?? null) !== null,
    safe: kind === 'text',
    text: kind === 'text' ? { value: options.text ?? semanticRole, role: 'HEADLINE', accent_words: [], align: 'center' } : null,
    shape: kind === 'shape' ? { kind: options.shapeKind ?? 'ellipse' } : null,
    path: kind === 'path' ? { points: [{ x: 0.12, y: 0.62 }, { x: 0.48, y: 0.38 }, { x: 0.88, y: 0.54 }], closed: false } : null,
    mask: kind === 'mask' ? { shape: 'ellipse', direction: 'left_to_right' } : null,
    asset_ref: null,
    style: options.fill ? { ...baseStyle, fill: options.fill } : baseStyle,
    transform: options.scale === undefined ? transform : { ...transform, scale: options.scale },
  };
}

function shapeComposition(direction: SceneDirection): {
  kind: NonNullable<VisualEntity['shape']>['kind'];
  region: VisualEntity['region'];
} {
  const layout = direction.layout_id ?? 'CENTER_HERO';
  const kind = ['EDITORIAL_SPLIT', 'FRAME_WITHIN_FRAME', 'GRID_STAGGER', 'DEPTH_STACK', 'LAYERED_POSTER', 'FULL_BLEED'].includes(layout) ? 'rect' as const : 'ellipse' as const;
  if (layout === 'ASYMMETRIC_HERO' || layout === 'EDITORIAL_SPLIT' || layout === 'FRAME_WITHIN_FRAME') return { kind, region: 'right' };
  if (layout === 'DIAGONAL_FLOW' || layout === 'GRID_STAGGER') return { kind, region: 'lower' };
  return { kind, region: 'center' };
}

function baseEntities(scene: SceneIntent, direction: SceneDirection): VisualEntity[] {
  const prefix = visualStableId('director_entity', { scene: scene.id });
  const rootId = `${prefix}_root`;
  const textId = `${prefix}_text`;
  const shapeId = `${prefix}_shape`;
  const pathId = `${prefix}_path`;
  const maskId = `${prefix}_mask`;
  const maskContentId = `${prefix}_mask_content`;
  const focus = focusKind(direction);
  const composition = shapeComposition(direction);
  const textEntity = {
    ...entity(textId, 'text', 'directed_copy', focus === 'text' ? 'HERO' : 'PRIMARY', {
      text: displayText(scene),
      region: direction.layout_id === 'EDITORIAL_SPLIT' || direction.layout_id === 'ASYMMETRIC_HERO' ? 'upper' : 'center',
      parent: rootId,
    }),
    text: {
      value: displayText(scene),
      role: textRole(direction),
      accent_words: displayText(scene).split(/\s+/u).slice(0, 1),
      align: direction.layout_id === 'EDITORIAL_SPLIT' || direction.layout_id === 'ASYMMETRIC_HERO' ? 'start' as const : 'center' as const,
    },
  };
  const entities: VisualEntity[] = [
    entity(rootId, 'group', 'composition_root', focus === 'group' ? 'HERO' : 'PRIMARY', { region: 'full' }),
    entity(shapeId, 'shape', direction.semantic_role.toLowerCase(), focus === 'shape' ? 'HERO' : 'DECORATIVE', {
      region: composition.region,
      parent: rootId,
      scale: focus === 'shape' ? 0.64 : 0.34,
      shapeKind: composition.kind,
      fill: focus === 'shape' ? 'accent' : 'muted',
    }),
    entity(pathId, 'path', 'causal_path', 'SUPPORT', { region: 'center', parent: rootId }),
    entity(maskId, 'mask', 'transition_mask', 'DECORATIVE', { region: 'full', parent: rootId }),
    entity(maskContentId, 'shape', 'masked_field', 'DECORATIVE', { region: 'full', parent: maskId, fill: 'background' }),
  ];
  for (const asset of direction.asset_intents.filter((entry) => entry.availability === 'AVAILABLE')) {
    const assetId = visualStableId('asset_entity', { scene: scene.id, asset: asset.id });
    const hierarchy = asset.role === 'HERO' ? 'PRIMARY' as const : asset.role === 'BACKGROUND' ? 'BACKGROUND' as const : 'SUPPORT' as const;
    const region = asset.role === 'FOREGROUND' ? 'foreground' as const : asset.role === 'BACKGROUND' ? 'background' as const : asset.role === 'DEVICE_FRAME' ? 'right' as const : 'center' as const;
    if (asset.type === 'UI_SURFACE') {
      entities.push(entity(assetId, 'group', asset.role.toLowerCase(), hierarchy, { region, parent: rootId, scale: 0.74 }));
      entities.push(entity(`${assetId}_surface`, 'shape', 'app_screen', 'SUPPORT', { region: 'center', parent: assetId, scale: 0.72, shapeKind: 'rect', fill: 'muted' }));
      entities.push(entity(`${assetId}_card`, 'shape', 'ui_card', 'SECONDARY', { region: 'upper', parent: assetId, scale: 0.42, shapeKind: 'rect', fill: 'accent' }));
    } else {
      entities.push(entity(assetId, 'shape', asset.role.toLowerCase(), hierarchy, {
        region,
        parent: rootId,
        scale: asset.role === 'BACKGROUND' ? 0.82 : 0.32,
        shapeKind: asset.role === 'BACKGROUND' ? 'rect' : composition.kind,
        fill: asset.role === 'BACKGROUND' ? 'muted' : 'accent',
      }));
    }
  }
  entities.push(textEntity);
  return entities;
}

function parameters(patternId: string): Record<string, string | number | boolean> {
  switch (patternId) {
    case 'TYPE_TRACKING_BURST': return { from_em: -0.065, to_em: -0.035 };
    case 'TYPE_WEIGHT_PULSE': return { from: 420, to: 500 };
    case 'TYPE_WIDTH_EXPANSION': return { from: 78, to: 82 };
    case 'WORD_TO_MASK': case 'SHAPE_TO_MASK': return { direction: 'outward' };
    case 'FRAME_EXPANSION': case 'CIRCLE_TO_PORTAL': return { scale: 6 };
    case 'STAGGER_GRID_REVEAL': return { direction: 'up', cascade: 'semantic' };
    case 'DIAGRAM_CAUSAL_FLOW': case 'VECTOR_ASSEMBLY': return { order: 'semantic' };
    case 'DEPTH_PARALLAX_HERO': return { depth: 'layered' };
    case 'FOREGROUND_OCCLUSION': return { foreground: true };
    default: return {};
  }
}

function selectTargetIds(entities: readonly VisualEntity[], allowed: readonly VisualEntity['kind'][], maximum = 1): string[] {
  const targets = entities.filter((entry) => allowed.includes(entry.kind)).slice(0, maximum).map((entry) => entry.id);
  return targets.length > 0 ? targets : [entities[0]!.id];
}

function resolvedSelections(direction: SceneDirection, plan: VisualDirectionPlan): { patterns: string[]; phrases: string[]; camera: string | null } {
  const composition = TECHNIQUE_COMPOSITION_REGISTRY.get(direction.technique_composition_id)!;
  const identity = MOTION_IDENTITY_REGISTRY.get(plan.motion_identity.id)!;
  const patternLimit = plan.restraint_level === 'HIGH' ? 1 : plan.restraint_level === 'BALANCED' ? 2 : 3;
  const identityTypePatterns = direction.focus === 'TYPE' && identity.typography_intensity === 'HIGH' ? ['TYPE_TRACKING_BURST'] : [];
  const patterns = direction.pattern_ids.length > 0 ? [...direction.pattern_ids] : [...new Set([...composition.preferred_patterns, ...identityTypePatterns])].slice(0, patternLimit);
  const phrases = direction.phrase_ids.length > 0 ? [...direction.phrase_ids] : [...new Set([composition.compatible_phrases[0], ...identity.preferred_phrases, ...composition.compatible_phrases].filter((entry): entry is string => entry !== undefined))].slice(0, 3);
  const dynamic = patterns.some((id) => ['TYPE_TRACKING_BURST', 'TYPE_WEIGHT_PULSE', 'TYPE_WIDTH_EXPANSION', 'WORD_TO_MASK'].includes(id))
    || phrases.some((id) => ['TYPE_TRACKING_IMPACT', 'TYPE_AXIS_PULSE', 'WORD_MASK_BRIDGE'].includes(id));
  if (dynamic) for (const required of ['TYPE_TRACKING_BURST', 'TYPE_WEIGHT_PULSE', 'TYPE_WIDTH_EXPANSION']) if (!patterns.includes(required)) patterns.push(required);
  let camera: string | null = null;
  if (direction.camera_mode === 'SELECT') camera = direction.camera_id;
  else if (direction.camera_mode === 'INHERIT') camera = identity.preferred_cameras[0] ?? composition.preferred_cameras[0] ?? null;
  return { patterns, phrases, camera };
}

function strategyLayout(plan: VisualDirectionPlan, direction: SceneDirection, index: number): VisualScene['layout'] {
  if (direction.layout_id) return direction.layout_id;
  if (plan.sequence_strategy.id === 'BUILD_ESCALATE_BREATH_PAYOFF') return index % 2 === 0 ? 'CENTER_HERO' : 'DEPTH_STACK';
  if (plan.sequence_strategy.id === 'QUESTION_DISCOVERY_EXPLANATION_REVEAL') return index === 0 ? 'ASYMMETRIC_HERO' : index % 2 === 0 ? 'RADIAL_FOCUS' : 'DIAGONAL_FLOW';
  if (plan.sequence_strategy.id === 'PRODUCT_REVEAL_FEATURES_PAYOFF') return index === 0 ? 'FRAME_WITHIN_FRAME' : 'DEPTH_STACK';
  if (plan.sequence_strategy.id === 'PROBLEM_TENSION_SOLUTION_PROOF') return index < Math.ceil(plan.scenes.length / 2) ? 'GRID_STAGGER' : 'ASYMMETRIC_HERO';
  if (plan.sequence_strategy.id === 'EDITORIAL_STATEMENT_CONTRAST_PAYOFF') return index % 2 === 0 ? 'ASYMMETRIC_HERO' : 'EDITORIAL_SPLIT';
  return DIRECTOR_DEFAULTS.layout_by_focus[direction.focus] as VisualScene['layout'];
}

function addPersistentEntities(
  plan: VisualDirectionPlan,
  sceneId: string,
  entities: VisualEntity[],
): void {
  const keys = new Set(plan.bridges.flatMap((bridge) => [
    bridge.source_scene_id === sceneId ? bridge.persistent_entity_key ?? plan.motif.id : null,
    bridge.destination_scene_id === sceneId ? bridge.persistent_entity_key ?? plan.motif.id : null,
  ]).filter((entry): entry is string => entry !== null));
  for (const key of keys) {
    const visualEntityId = visualStableId('visual_entity', { key });
    entities.push(entity(visualStableId('persistent_local', { scene: sceneId, key }), 'shape', key, 'SECONDARY', {
      persistentId: visualEntityId,
      region: 'lower',
      scale: 0.18,
      shapeKind: plan.motif.category === 'FRAME' || plan.motif.category === 'CARD' || plan.motif.category === 'GRID' ? 'rect' : 'ellipse',
    }));
  }
}

function resolveScene(source: SceneIntent, direction: SceneDirection, plan: VisualDirectionPlan, index: number): VisualScene {
  const entities = baseEntities(source, direction);
  addPersistentEntities(plan, source.id, entities);
  const selected = resolvedSelections(direction, plan);
  const focus = focusKind(direction);
  const focusEntity = entities.find((entry) => entry.kind === focus) ?? entities[0]!;
  const patterns = selected.patterns.map((patternId) => {
    const definition = P32_VISUAL_PATTERN_REGISTRY.get(patternId)!;
    return { id: visualStableId('pattern_instance', { scene: source.id, patternId }), pattern_id: patternId, version: definition.version, target_ids: selectTargetIds(entities, definition.allowed_targets), parameters: parameters(patternId) };
  });
  const phrases = selected.phrases.map((phraseId) => {
    const definition = P32_MOTION_PHRASE_REGISTRY.get(phraseId)!;
    return { id: visualStableId('phrase_instance', { scene: source.id, phraseId }), phrase_id: phraseId, version: definition.version, target_ids: selectTargetIds(entities, definition.compatible_targets, Math.min(3, definition.max_targets)), intensity: direction.motion_intensity, direction: direction.semantic_role === 'PHENOMENON' ? 'radial' as const : index % 2 === 0 ? 'up' as const : 'right' as const };
  });
  const cameraDefinition = selected.camera === null ? null : P32_CAMERA_REGISTRY.get(selected.camera)!;
  const cameraMoves = cameraDefinition ? [{ id: visualStableId('camera_move', { scene: source.id, camera: cameraDefinition.id }), camera_id: cameraDefinition.id, version: cameraDefinition.version, target_id: entities.find((entry) => entry.kind === 'group')!.id, intensity: DIRECTOR_DEFAULTS.camera_intensity[direction.motion_intensity], phase: direction.visual_role === 'PAYOFF' ? 'SETTLE' as const : 'ENTER' as const }] : [];
  const persistent = entities.filter((entry) => entry.visual_entity_id !== null);
  const anchors = persistent.flatMap((entry) => [
    { id: visualStableId('anchor_entry', { scene: source.id, entity: entry.visual_entity_id }), entity_id: entry.id, visual_entity_id: entry.visual_entity_id!, property: 'position' as const, visible_ms: 500 },
    { id: visualStableId('anchor_exit', { scene: source.id, entity: entry.visual_entity_id }), entity_id: entry.id, visual_entity_id: entry.visual_entity_id!, property: 'position' as const, visible_ms: 500 },
  ]);
  const depthLayers = direction.depth_intent === 'FLAT' ? [] : [
    { entity_id: entities[0]!.id, plane: 'BACKGROUND' as const, parallax_factor: DIRECTOR_DEFAULTS.depth_parallax.BACKGROUND, occludes: [] },
    { entity_id: entities.find((entry) => entry.kind === 'shape')!.id, plane: 'MIDGROUND' as const, parallax_factor: DIRECTOR_DEFAULTS.depth_parallax.MIDGROUND, occludes: [] },
    { entity_id: entities.find((entry) => entry.kind === 'text')!.id, plane: 'FOREGROUND' as const, parallax_factor: DIRECTOR_DEFAULTS.depth_parallax.FOREGROUND, occludes: direction.depth_intent === 'FOREGROUND_OCCLUSION' ? [entities.find((entry) => entry.kind === 'shape')!.id] : [] },
  ];
  const actionId = phrases[0]?.phrase_id ?? patterns[0]?.pattern_id;
  return {
    id: visualStableId('vscene', { direction: plan.direction_plan_id, source: source.id }),
    source_scene_id: source.id,
    narrative_role: source.narrative_role,
    duration_ms: Math.round((source.pacing?.desired_duration?.preferred_seconds ?? 3) * 1_000),
    layout: strategyLayout(plan, direction, index),
    visual_focus_id: focusEntity.id,
    entry_anchor_id: anchors[0]?.id ?? null,
    exit_anchor_id: anchors.at(-1)?.id ?? null,
    complexity: direction.complexity,
    motion_intensity: direction.motion_intensity,
    information_density: direction.visual_density === 'SPARSE' ? 'SPARSE' : direction.visual_density === 'DENSE' ? 'DENSE' : 'BALANCED',
    background_role: 'background',
    entities, relations: [], patterns, motion_phrases: phrases, camera_moves: cameraMoves, anchors, depth_layers: depthLayers,
    choreography: actionId ? [{ id: visualStableId('choreography', { scene: source.id, actionId }), phase: 'ENTER', target_id: focusEntity.id, action_id: actionId, trigger: { relation: 'at_phase_start', event_id: null } }] : [],
    reserved_regions: plan.art_direction.negative_space === 'GENEROUS' ? [{ id: visualStableId('reserved_region', { scene: source.id }), region: index % 2 === 0 ? 'lower' : 'upper', reason: 'Negative space dirigé par ArtDirectionIntent.' }] : [],
    morph_chains: [], motion_events: [], causal_relations: [], layout_transitions: [], effects: [],
  };
}

function buildTrace(plan: VisualDirectionPlan, scenes: readonly VisualScene[]): VisualDecisionTrace {
  const entries: VisualDecisionTrace['entries'][number][] = [
    { decision_id: visualStableId('decision', { plan: plan.direction_plan_id, kind: 'strategy' }), scope: 'GLOBAL', target_id: plan.direction_plan_id, source: 'SEQUENCE_STRATEGY', selected: plan.sequence_strategy.id, reason: 'PACING', resolved_output_ids: scenes.map((scene) => scene.id), override: false },
    { decision_id: visualStableId('decision', { plan: plan.direction_plan_id, kind: 'identity' }), scope: 'GLOBAL', target_id: plan.direction_plan_id, source: 'MOTION_IDENTITY', selected: plan.motion_identity.id, reason: 'HIERARCHY', resolved_output_ids: scenes.flatMap((scene) => [...scene.patterns.map((entry) => entry.id), ...scene.motion_phrases.map((entry) => entry.id), ...scene.camera_moves.map((entry) => entry.id)]), override: false },
  ];
  plan.scenes.forEach((direction, index) => {
    const resolved = scenes[index]!;
    entries.push({ decision_id: visualStableId('decision', { scene: direction.scene_id, kind: 'technique' }), scope: 'SCENE', target_id: direction.id, source: 'TECHNIQUE_COMPOSITION', selected: direction.technique_composition_id, reason: direction.reason, resolved_output_ids: [...resolved.patterns.map((entry) => entry.id), ...resolved.motion_phrases.map((entry) => entry.id)], override: false });
    entries.push({ decision_id: visualStableId('decision', { scene: direction.scene_id, kind: 'explicit' }), scope: 'SCENE', target_id: direction.id, source: 'EXPLICIT_SCENE_DIRECTION', selected: `${resolved.layout}:${direction.focus}:${direction.camera_mode}`, reason: direction.reason, resolved_output_ids: [resolved.visual_focus_id, ...resolved.camera_moves.map((entry) => entry.id)], override: direction.layout_id !== undefined || direction.pattern_ids.length > 0 || direction.phrase_ids.length > 0 || direction.camera_mode !== 'INHERIT' });
  });
  return { schema: 'visual-decision-trace', schema_version: '0.1.0', direction_plan_id: plan.direction_plan_id, precedence: ['ENGINE_CONSTRAINT', 'EXPLICIT_SCENE_DIRECTION', 'TECHNIQUE_COMPOSITION', 'MOTION_IDENTITY', 'SEQUENCE_STRATEGY'], entries };
}

function buildVisualPlan(plan: VisualDirectionPlan, creativePlan: CreativePlan): { visualPlan: VisualPlan; trace: VisualDecisionTrace } {
  const creativeById = new Map(creativePlan.scenes.map((scene) => [scene.id, scene]));
  const scenes = plan.scenes.map((direction, index) => resolveScene(creativeById.get(direction.scene_id)!, direction, plan, index));
  const visualSceneBySource = new Map(scenes.map((scene) => [scene.source_scene_id, scene]));
  const bridges = plan.bridges.map((direction) => {
    const source = visualSceneBySource.get(direction.source_scene_id)!;
    const destination = visualSceneBySource.get(direction.destination_scene_id)!;
    const key = direction.persistent_entity_key ?? plan.motif.id;
    const visualEntityId = visualStableId('visual_entity', { key });
    const sourceAnchor = source.anchors.find((anchor) => anchor.visual_entity_id === visualEntityId && anchor.id.includes('anchor_exit')) ?? source.anchors.find((anchor) => anchor.visual_entity_id === visualEntityId)!;
    const destinationAnchor = destination.anchors.find((anchor) => anchor.visual_entity_id === visualEntityId && anchor.id.includes('anchor_entry')) ?? destination.anchors.find((anchor) => anchor.visual_entity_id === visualEntityId)!;
    const definition = P32_SCENE_BRIDGE_REGISTRY.get(direction.bridge_id)!;
    return { id: direction.id, bridge_id: direction.bridge_id, version: definition.version, source_scene_id: source.id, destination_scene_id: destination.id, source_anchor_id: sourceAnchor.id, destination_anchor_id: destinationAnchor.id, visual_entity_id: visualEntityId, duration_ms: 600, easing: 'PRECISE' as const, fallback_policy: definition.support === 'compatible_simplified' ? 'compatible_simplified' as const : 'exact_only' as const };
  });
  const cameraContinuities = plan.bridges.filter((bridge) => bridge.camera_continuity).map((bridge) => {
    const source = visualSceneBySource.get(bridge.source_scene_id)!;
    const destination = visualSceneBySource.get(bridge.destination_scene_id)!;
    return { id: visualStableId('camera_continuity', { bridge: bridge.id }), source_scene_id: source.id, destination_scene_id: destination.id, source_camera_id: source.camera_moves[0]!.id, destination_camera_id: destination.camera_moves[0]!.id, energy: 'inward' as const, velocity_intent: 'carry' as const, scale_momentum: 'preserve' as const };
  });
  const visualPlan = VisualPlanSchema.parse({
    schema: 'visual-plan', schema_version: P32_VISUAL_PLAN_VERSION,
    plan_id: visualStableId('visual_plan', { direction: plan.direction_plan_id, director: VISUAL_DIRECTOR_FINGERPRINT }),
    source: { creative_plan_id: creativePlan.plan_id, creative_plan_sha256: hashCreativeDocument(creativePlan), pipeline_path: 'visual_directed' },
    grammar: { version: P32_VISUAL_GRAMMAR.version, fingerprints: { grammar: P32_VISUAL_GRAMMAR.fingerprint, ...P32_VISUAL_GRAMMAR.registry_fingerprints } },
    target: { format: 'vertical_short_form', duration_ms: scenes.reduce((sum, scene) => sum + scene.duration_ms, 0) },
    style_id: plan.style_id,
    scenes, bridges,
    motifs: [{ id: plan.motif.id, kind: plan.motif.category === 'LIGHT_RAY' || plan.motif.category === 'LINE' ? 'line' : plan.motif.category === 'CARD' || plan.motif.category === 'FRAME' ? 'shape' : 'visual_entity', entity_id: visualStableId('visual_entity', { key: plan.bridges.find((bridge) => bridge.persistent_entity_key !== null)?.persistent_entity_key ?? plan.motif.id }), scene_ids: scenes.filter((_, index) => plan.scenes[index]?.motif_state !== 'ABSENT').map((scene) => scene.id) }],
    camera_continuities: cameraContinuities,
  });
  return { visualPlan, trace: buildTrace(plan, scenes) };
}

export function compileVisualDirectionPlan(
  candidate: unknown,
  creativePlan: CreativePlan,
  context: VisualDirectorContext,
): VisualDirectionCompileResult {
  const directionPreflight = buildVisualDirectionPreflight(candidate, creativePlan, context);
  if (!directionPreflight.eligible_for_resolution) return { ok: false, direction_plan: null, direction_preflight: directionPreflight, coherence: null, decision_trace: null, visual_plan: null, visual_preflight: null, hashes: { director: VISUAL_DIRECTOR_FINGERPRINT, direction_plan: directionPreflight.direction_plan_sha256, decision_trace: null, visual_plan: null } };
  const plan = candidate as VisualDirectionPlan;
  const coherence = buildSequenceCoherenceReport(plan);
  const resolved = buildVisualPlan(plan, creativePlan);
  const visualPreflight = buildVisualPreflight(resolved.visualPlan);
  const ok = visualPreflight.summary.errors === 0;
  return { ok, direction_plan: plan, direction_preflight: directionPreflight, coherence, decision_trace: resolved.trace, visual_plan: resolved.visualPlan, visual_preflight: visualPreflight, hashes: { director: VISUAL_DIRECTOR_FINGERPRINT, direction_plan: hashVisualDocument(plan), decision_trace: hashVisualDocument(resolved.trace), visual_plan: hashVisualDocument(resolved.visualPlan) } };
}

export function resolveVisualDirectionPlan(plan: VisualDirectionPlan, creativePlan: CreativePlan, context: VisualDirectorContext): VisualPlan {
  const result = compileVisualDirectionPlan(plan, creativePlan, context);
  if (!result.ok || !result.visual_plan) throw new Error(`visual_direction.resolution_failed:${JSON.stringify(result.direction_preflight.diagnostics)}`);
  return result.visual_plan;
}
