import {
  CreativeCompileProvenanceSchema,
  CreativeCompileReportSchema,
  CreativeResolutionSchema,
  MOTION_SPEC_TARGET_VERSION,
  type CompilationProfile,
  type CreativeCompileProvenance,
  type CreativeCompileReport,
  type CreativeResolution,
  type ResolvedAssetSlot,
  type ResolvedAudioEvent,
  type ResolvedContentSlot,
  type VisualLayoutStrategy,
} from './contracts.ts';
import { CompilationProfileSchema, CREATIVE_COMPILER_VERSION } from './contracts.ts';
import { compilationProfileFingerprint } from './profile.ts';

import {
  deriveCreativeId,
  hashCreativeDocument,
  reportStatus,
  sortCreativeDiagnostics,
  summarizeDiagnostics,
  validateCreativePlan,
  type CreativeDiagnostic,
  type CreativePlan,
  type SceneIntent,
} from '@motion-engine/creative-core';
import {
  MotionSceneSpecSchema,
  P14_BEHAVIOR_REGISTRY,
  hashDocument,
  validateSpec,
  type BehaviorInstance,
  type Layer,
  type MotionSceneSpec,
  type PatternDefinition,
  type Platform,
  type ResolvedStyle,
  type Scene,
  type StyleBinding,
  type TextRun,
} from '@motion-engine/core';

export interface CreativeCompileOptions {
  readonly resolution: CreativeResolution;
  readonly profile: CompilationProfile;
  readonly resolved_style: ResolvedStyle;
  readonly pattern: PatternDefinition;
  readonly platform?: Platform;
}

export interface CreativeCompileResult {
  readonly ok: boolean;
  readonly motion_spec: MotionSceneSpec | null;
  readonly provenance: CreativeCompileProvenance | null;
  readonly compiler_fingerprint: string | null;
  readonly report: CreativeCompileReport;
}

interface CompileState {
  readonly diagnostics: CreativeDiagnostic[];
  readonly plan: CreativePlan;
  readonly resolution: CreativeResolution;
  readonly profile: CompilationProfile;
  readonly style: ResolvedStyle;
  readonly durations: readonly number[];
  readonly contentByScene: ReadonlyMap<string, readonly ResolvedContentSlot[]>;
  readonly assetBySlot: ReadonlyMap<string, ResolvedAssetSlot>;
  readonly audioByEvent: ReadonlyMap<string, ResolvedAudioEvent>;
  readonly voiceSegments: Array<{ id: string; text: string; gap_after: null; emphasis: string[] }>;
  readonly provenanceScenes: Array<CreativeCompileProvenance['scenes'][number]>;
  readonly provenanceLayers: Array<CreativeCompileProvenance['layers'][number]>;
}

const MAX_TEXT_RUN = 160;
const MAX_VOICE_SEGMENT = 400;

function diagnostic(input: CreativeDiagnostic): CreativeDiagnostic {
  return input;
}

function styleBinding(style: ResolvedStyle): StyleBinding {
  if (style.mode === 'brand' && style.sources.brand) {
    return { kind: 'brand', id: style.sources.brand.id, version: style.sources.brand.version };
  }
  if (style.mode === 'series' && style.sources.series) {
    return { kind: 'series', id: style.sources.series.id, version: style.sources.series.version };
  }
  return { kind: 'style', id: style.sources.style.id, version: style.sources.style.version };
}

function splitAtWords(text: string, maximum: number): string[] {
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maximum) {
    const candidate = remaining.slice(0, maximum + 1);
    const split = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
    const at = split > maximum * 0.45 ? split : maximum;
    result.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function durationAllocation(plan: CreativePlan, diagnostics: CreativeDiagnostic[]): number[] {
  const targetMs = Math.round(plan.target.duration.preferred_seconds * 1_000);
  if (targetMs < plan.scenes.length * 200) {
    diagnostics.push(diagnostic({
      code: 'creative_compile.duration_impossible', severity: 'error', path: '$.target.duration',
      message: 'La durée cible ne permet pas une durée positive et exploitable pour chaque scène.',
      context: { target_ms: targetMs, scenes: plan.scenes.length, minimum_scene_ms: 200 },
      suggested_action: 'Augmenter la durée cible ou réduire le nombre de scènes.',
    }));
    return [];
  }
  const weights = plan.scenes.map((scene) => Math.max(1, Math.round((scene.pacing?.desired_duration?.preferred_seconds ?? 1) * 1_000)));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const raw = weights.map((weight) => targetMs * weight / weightTotal);
  const allocated = raw.map((value) => Math.floor(value));
  let remainder = targetMs - allocated.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value), id: plan.scenes[index]!.id }))
    .sort((left, right) => right.fraction - left.fraction || left.id.localeCompare(right.id));
  for (let index = 0; index < remainder; index += 1) allocated[order[index % order.length]!.index]! += 1;
  remainder = targetMs - allocated.reduce((sum, value) => sum + value, 0);
  if (remainder !== 0) allocated[allocated.length - 1]! += remainder;
  return allocated;
}

function quantizedScenes(plan: CreativePlan, durations: readonly number[], profile: CompilationProfile) {
  let elapsedMs = 0;
  return plan.scenes.map((scene, index) => {
    const durationMs = durations[index]!;
    const fromFrame = Math.round(elapsedMs * profile.fps / 1_000);
    elapsedMs += durationMs;
    return {
      creative_scene_id: scene.id,
      motion_scene_id: scene.id,
      duration_ms: durationMs,
      from_frame: fromFrame,
      to_frame: Math.round(elapsedMs * profile.fps / 1_000),
    };
  });
}

function contentByScene(resolution: CreativeResolution): ReadonlyMap<string, readonly ResolvedContentSlot[]> {
  const result = new Map<string, ResolvedContentSlot[]>();
  for (const slot of resolution.content_slots) result.set(slot.scene_id, [...(result.get(slot.scene_id) ?? []), slot]);
  return result;
}

function roleForContent(scene: SceneIntent, slot?: ResolvedContentSlot): string {
  if (slot?.role === 'statistic') return 'statistic';
  if (slot?.role === 'cta') return 'cta';
  if (scene.narrative_role === 'hook') return 'headline';
  if (scene.visual?.mode === 'quote') return 'quote';
  return scene.typography?.treatments[0]?.role ?? 'body';
}

function textRuns(scene: SceneIntent, slots: readonly ResolvedContentSlot[], diagnostics: CreativeDiagnostic[]): { runs: TextRun[]; sourceIds: string[]; role: string } {
  const entries: Array<{ id: string; text: string; role: string }> = scene.content.on_screen.map((entry) => ({
    id: entry.id, text: entry.text, role: scene.typography?.treatments.find((item) => item.content_id === entry.id)?.role ?? roleForContent(scene),
  }));
  for (const slot of slots) {
    if (slot.status !== 'resolved' || !slot.channels.includes('on_screen')) continue;
    if (entries.some((entry) => entry.text === slot.text)) continue;
    entries.push({ id: slot.content_id, text: slot.text, role: roleForContent(scene, slot) });
  }
  const runs: TextRun[] = [];
  const sourceIds: string[] = [];
  for (const entry of entries) {
    const chunks = splitAtWords(entry.text, MAX_TEXT_RUN);
    if (chunks.length + runs.length > 24) {
      diagnostics.push(diagnostic({
        code: 'creative_compile.text_runs_exceeded', severity: 'error', path: `$.scenes.${scene.id}.content.on_screen`,
        node_id: entry.id, scene_id: scene.id, message: 'Le texte dépasse la capacité maximale des runs MotionSpec.',
        context: { runs: chunks.length + runs.length, maximum: 24 }, suggested_action: 'Réduire ou répartir le texte sur plusieurs scènes.',
      }));
      continue;
    }
    chunks.forEach((text, index) => runs.push({
      id: deriveCreativeId('run', { scene_id: scene.id, content_id: entry.id, index }),
      text,
      role: index === 0 && scene.narrative_role === 'hook' ? 'accent' : 'base',
      ...(index < chunks.length - 1 ? { break_after: true } : {}),
    }));
    sourceIds.push(entry.id);
  }
  return { runs, sourceIds, role: entries[0]?.role ?? roleForContent(scene) };
}

function addVoiceSegments(state: CompileState, scene: SceneIntent, slots: readonly ResolvedContentSlot[]): string[] {
  const entries = scene.content.spoken.map((entry) => ({ id: entry.id, text: entry.text }));
  for (const slot of slots) {
    if (slot.status !== 'resolved' || !slot.channels.includes('spoken')) continue;
    if (!entries.some((entry) => entry.text === slot.text)) entries.push({ id: slot.content_id, text: slot.text });
  }
  const result: string[] = [];
  for (const entry of entries) {
    splitAtWords(entry.text, MAX_VOICE_SEGMENT).forEach((text, index) => {
      const id = deriveCreativeId('voice_segment', { scene_id: scene.id, content_id: entry.id, index });
      state.voiceSegments.push({ id, text, gap_after: null, emphasis: [] });
      result.push(id);
    });
  }
  return result;
}

function behavior(id: string, behaviorId: string, durationMs: number, params?: Readonly<Record<string, string | number | boolean>>): BehaviorInstance {
  return {
    id,
    behavior: behaviorId,
    version: '1.0.0',
    ...(params === undefined ? {} : { params: { ...params } }),
    at: { semantic: 'SCENE_START' },
    duration: { ms: durationMs },
  };
}

function placement(strategy: VisualLayoutStrategy, kind: 'text' | 'image') {
  if (kind === 'image') {
    if (strategy === 'split' || strategy === 'comparison' || strategy === 'diagram') return { col: 1, row: 1, col_span: 6, row_span: 6 };
    return { col: 1, row: 1, col_span: 6, row_span: 12 };
  }
  if (strategy === 'split' || strategy === 'comparison' || strategy === 'diagram') return { col: 1, row: 7, col_span: 6, row_span: 6 };
  if (strategy === 'image_hero') return { col: 1, row: 7, col_span: 6, row_span: 5 };
  return { col: 1, row: 3, col_span: 6, row_span: 7 };
}

function imageLayer(
  state: CompileState,
  scene: SceneIntent,
  asset: Extract<ResolvedAssetSlot, { status: 'resolved' }>,
  strategy: VisualLayoutStrategy,
  revealBehavior: string | null,
): Layer {
  const imageId = deriveCreativeId('image_layer', { scene_id: scene.id, asset: asset.asset_intent_id });
  const motion = state.profile.motion_characters[scene.motion?.character ?? state.plan.global_intents.motion?.character ?? 'restrained'];
  const duration = Math.min(1_500, Math.max(300, Math.round(state.durations[state.plan.scenes.findIndex((item) => item.id === scene.id)]! * 0.18)));
  const imageBehaviors: BehaviorInstance[] = [];
  if (motion?.image_behavior === 'CAMERA_PUSH') {
    const intensity = (scene.motion?.intensity ?? 0.5) * motion.intensity_scale;
    imageBehaviors.push(behavior(deriveCreativeId('behavior', { image: imageId, kind: 'camera_push' }), 'CAMERA_PUSH', duration, {
      scale: 1 + Math.min(0.08, Math.max(0.01, intensity * 0.08)),
    }));
  } else if (motion?.image_behavior === 'FOCUS_REGION') {
    if (asset.focus && 'region' in asset.focus) {
      imageBehaviors.push(behavior(deriveCreativeId('behavior', { image: imageId, kind: 'focus_region' }), 'FOCUS_REGION', duration, {
        region: asset.focus.region,
        scale: 1.08,
      }));
    } else {
      state.diagnostics.push(diagnostic({
        code: 'creative_compile.focus_region_unresolved', severity: 'warning', path: '$.resolution.asset_slots',
        node_id: asset.asset_intent_id, scene_id: scene.id,
        message: 'L’intention FOCUS_REGION est ignorée car aucune région sémantique résolue n’est fournie.',
        suggested_action: 'Fournir une région sémantique dans la résolution d’asset.',
      }));
    }
  }
  const image: Layer = {
    id: imageId,
    primitive: 'image',
    slot: 'composition.primary',
    placement: placement(strategy, 'image'),
    must_be_safe: true,
    asset: asset.asset_ref,
    fit: strategy === 'image_hero' ? 'cover' : 'contain',
    ...(asset.focus === undefined ? {} : { focus: asset.focus }),
    behaviors: imageBehaviors,
  };
  state.provenanceLayers.push({
    creative_scene_id: scene.id, motion_scene_id: scene.id, motion_layer_id: imageId,
    source_kind: 'asset', source_id: asset.asset_intent_id, hierarchy: 'primary',
  });
  if (revealBehavior !== 'MASK_WIPE') return image;
  const maskId = deriveCreativeId('mask_layer', { scene_id: scene.id, asset: asset.asset_intent_id });
  state.provenanceLayers.push({
    creative_scene_id: scene.id, motion_scene_id: scene.id, motion_layer_id: maskId,
    source_kind: 'compiler_structure', source_id: scene.id, hierarchy: 'primary',
  });
  return {
    id: maskId,
    primitive: 'mask',
    slot: 'composition.primary',
    placement: placement(strategy, 'image'),
    must_be_safe: true,
    clip: { shape: 'rect', radius: 'space.md', mode: 'wipe', direction: 'left_to_right' },
    behaviors: [behavior(deriveCreativeId('behavior', { mask: maskId, kind: 'wipe' }), 'MASK_WIPE', Math.min(1_000, duration), { direction: 'left_to_right' })],
    children: [{ ...image, placement: undefined }],
  };
}

function compileScene(state: CompileState, scene: SceneIntent, index: number): Scene {
  const slots = state.contentByScene.get(scene.id) ?? [];
  const visualMode = scene.visual?.mode ?? state.plan.global_intents.visual?.mode ?? 'text_dominant';
  const strategy = state.profile.visual_modes[visualMode] ?? 'text_stack';
  const transitionKind = scene.transition_out?.kind ?? state.plan.global_intents.transitions?.kind ?? 'cut';
  const transition = state.profile.transitions[transitionKind];
  const assetResolutions = scene.asset_slots.flatMap((slot) => {
    const resolution = state.assetBySlot.get(slot);
    return resolution?.status === 'resolved' ? [resolution] : [];
  });
  const layers: Layer[] = [];
  for (const asset of assetResolutions) layers.push(imageLayer(state, scene, asset, strategy, transition?.scene_reveal_behavior ?? null));

  const text = textRuns(scene, slots, state.diagnostics);
  if (text.runs.length > 0) {
    const textId = deriveCreativeId('text_layer', { scene_id: scene.id, sources: text.sourceIds });
    const motion = state.profile.motion_characters[scene.motion?.character ?? state.plan.global_intents.motion?.character ?? 'restrained'];
    const type = state.profile.typography_roles[text.role];
    const duration = Math.min(1_200, Math.max(250, Math.round(state.durations[index]! * 0.12)));
    layers.push({
      id: textId,
      primitive: 'text',
      slot: assetResolutions.length > 0 ? 'composition.supporting' : 'composition.primary',
      placement: placement(strategy, 'text'),
      must_be_safe: true,
      content: { runs: text.runs, break_policy: 'balance' },
      style: {
        type: type ?? 'type.body',
        color: assetResolutions.length > 0 && strategy === 'image_hero' ? 'color.text.inverse' : 'color.text.primary',
        accent_color: 'color.accent',
        align: state.style.style.composition_personality.alignment === 'mixed'
          ? 'center'
          : state.style.style.composition_personality.alignment,
      },
      fit: { max_lines: 6, allow_role_downgrade: true },
      behaviors: motion ? [behavior(
        deriveCreativeId('behavior', { layer: textId, kind: 'text_enter' }),
        motion.text_behavior,
        duration,
        { unit: 'line', stagger: scene.pacing?.character === 'fast' || scene.pacing?.character === 'aggressive' ? 'tight' : 'style' },
      )] : [],
    });
    text.sourceIds.forEach((sourceId) => state.provenanceLayers.push({
      creative_scene_id: scene.id, motion_scene_id: scene.id, motion_layer_id: textId,
      source_kind: 'content', source_id: sourceId, hierarchy: assetResolutions.length > 0 ? 'secondary' : 'primary',
    }));
  }

  if (layers.length === 0) {
    const shapeId = deriveCreativeId('shape_layer', { scene_id: scene.id, purpose: scene.semantic_purpose });
    layers.push({
      id: shapeId, primitive: 'shape', slot: 'composition.primary',
      placement: { col: 2, row: 4, col_span: 4, row_span: 4 }, must_be_safe: true,
      shape: 'ellipse', stroke: { color: 'color.accent', weight: 'stroke.emphasis' }, behaviors: [],
    });
    state.provenanceLayers.push({
      creative_scene_id: scene.id, motion_scene_id: scene.id, motion_layer_id: shapeId,
      source_kind: 'visual_intent', source_id: scene.visual?.focal_element ?? scene.id, hierarchy: 'primary',
    });
  }

  const voiceIds = addVoiceSegments(state, scene, slots);
  const rootId = deriveCreativeId('group_layer', { scene_id: scene.id });
  state.provenanceLayers.push({
    creative_scene_id: scene.id, motion_scene_id: scene.id, motion_layer_id: rootId,
    source_kind: 'compiler_structure', source_id: scene.id, hierarchy: null,
  });
  const contentSlotIds = slots.filter((slot) => slot.status === 'resolved').map((slot) => slot.slot_id);
  const assetIntentIds = assetResolutions.map((asset) => asset.asset_intent_id);
  state.provenanceScenes.push({
    creative_scene_id: scene.id,
    motion_scene_id: scene.id,
    narrative_role: scene.narrative_role,
    source_content_slot_ids: contentSlotIds,
    source_asset_intent_ids: assetIntentIds,
    motion_layer_ids: [rootId, ...layers.map((layer) => layer.id)],
  });
  const next = state.plan.scenes[index + 1];
  const soundOverrides = (scene.audio?.events ?? []).flatMap((event) => {
    const resolved = state.audioByEvent.get(event.id);
    if (resolved?.status !== 'resolved') return [];
    if (event.relation) state.diagnostics.push(diagnostic({
      code: 'creative_compile.audio_anchor_degraded_to_scene_start', severity: 'info', path: '$.scenes.audio.events',
      node_id: event.id, scene_id: scene.id,
      message: 'L’ancre audio créative est ramenée au début de scène, seule ancre P1 fiable sans asset audio temporel.',
      suggested_action: 'Fournir ultérieurement un alignement audio réel si nécessaire.',
    }));
    return [{ cue: resolved.cue, at: { event: 'scene.start' as const }, ...(resolved.gain_db === undefined ? {} : { gain_db: resolved.gain_db }) }];
  });
  return {
    id: scene.id,
    pattern: { id: state.profile.system.id, version: state.profile.system.version, variation: {
      layout_variant: strategy,
      motion_variant: scene.motion?.character ?? state.plan.global_intents.motion?.character,
      energy: (scene.motion?.intensity ?? 0.5) >= 0.7 ? 'high' : (scene.motion?.intensity ?? 0.5) >= 0.4 ? 'medium' : 'low',
    } },
    purpose: state.profile.scene_purposes[scene.narrative_role] ?? 'proof',
    locks: [],
    timing: { anchor: { duration: { ms: state.durations[index]! } }, min_hold: text.runs.length > 0 ? 'reading' : { ms: 200 } },
    background: { fill: 'color.surface.primary' },
    layers: [{ id: rootId, primitive: 'group', slot: 'composition.root', must_be_safe: true, behaviors: [], children: layers }],
    events: [],
    sound: { derive_from_events: false, overrides: soundOverrides },
    subtitles: voiceIds.length > 0 && (scene.subtitles?.required ?? state.plan.global_intents.subtitles?.required ?? false)
      ? { mode: 'auto' }
      : { mode: 'off', reason: voiceIds.length === 0 ? 'aucun contenu parlé résolu' : 'sous-titres non requis' },
    ...(next && transition ? { transition_out: { behavior: transition.boundary_behavior, version: '1.0.0', to: next.id } } : {}),
  };
}

function preflight(
  plan: CreativePlan,
  resolution: CreativeResolution,
  profile: CompilationProfile,
  style: ResolvedStyle,
  pattern: PatternDefinition,
): CreativeDiagnostic[] {
  const diagnostics: CreativeDiagnostic[] = [];
  if (resolution.plan_id !== plan.plan_id) diagnostics.push(diagnostic({
    code: 'creative_compile.resolution_plan_mismatch', severity: 'error', path: '$.resolution.plan_id',
    node_id: resolution.plan_id, message: 'La résolution ne cible pas le CreativePlan compilé.',
    context: { expected: plan.plan_id, actual: resolution.plan_id }, suggested_action: 'Recréer la résolution pour ce CreativePlan.',
  }));
  if (pattern.id !== profile.system.id || pattern.version !== profile.system.version) diagnostics.push(diagnostic({
    code: 'creative_compile.profile_pattern_mismatch', severity: 'error', path: '$.profile.system',
    message: 'Le PatternDefinition fourni ne correspond pas au système du profil de compilation.',
    context: { expected: `${profile.system.id}@${profile.system.version}`, actual: `${pattern.id}@${pattern.version}` },
    suggested_action: 'Fournir le PatternDefinition déclaré par le profil.',
  }));
  const sceneIds = new Set(plan.scenes.map((scene) => scene.id));
  const audioEvents = new Map(plan.scenes.flatMap((scene) => (scene.audio?.events ?? []).map((event) => [event.id, { event, scene }] as const)));
  const planAssetIntents = new Map(plan.asset_intents.map((asset) => [asset.slot, asset]));
  const resolutionAssetSlots = new Set<string>();
  for (const slot of resolution.content_slots) {
    if (!sceneIds.has(slot.scene_id)) diagnostics.push(diagnostic({
      code: 'creative_compile.provenance_scene_missing', severity: 'error', path: '$.resolution.content_slots',
      node_id: slot.slot_id, scene_id: slot.scene_id, message: 'Le slot de contenu cible une scène CreativePlan absente.',
      suggested_action: 'Corriger le scene_id de la résolution.',
    }));
    if (slot.status === 'unresolved' && slot.required) diagnostics.push(diagnostic({
      code: 'creative_compile.content_required_unresolved', severity: 'error', path: '$.resolution.content_slots',
      node_id: slot.slot_id, scene_id: slot.scene_id, message: `Le contenu requis « ${slot.role} » reste non résolu.`,
      suggested_action: 'Fournir explicitement le contenu avant compilation.',
    }));
    if (slot.status === 'resolved' && [...slot.text].length > slot.max_characters) diagnostics.push(diagnostic({
      code: 'creative_compile.content_limit_exceeded', severity: 'error', path: '$.resolution.content_slots',
      node_id: slot.slot_id, scene_id: slot.scene_id, message: 'Le contenu résolu dépasse sa limite déclarée.',
      context: { actual: [...slot.text].length, limit: slot.max_characters }, suggested_action: 'Réduire le contenu sans en changer le sens.',
    }));
    if (slot.status === 'resolved' && slot.factual_requirement === 'source_required' && !slot.source_slot) diagnostics.push(diagnostic({
      code: 'creative_compile.source_required_unresolved', severity: 'error', path: '$.resolution.content_slots',
      node_id: slot.slot_id, scene_id: slot.scene_id, message: 'Le contenu factuel résolu exige un slot de source.',
      suggested_action: 'Associer un source_slot sans inventer de source.',
    }));
  }
  for (const asset of resolution.asset_slots) {
    resolutionAssetSlots.add(asset.asset_slot);
    const intent = planAssetIntents.get(asset.asset_slot);
    if (!intent || intent.id !== asset.asset_intent_id) diagnostics.push(diagnostic({
      code: 'creative_compile.asset_provenance_mismatch', severity: 'error', path: '$.resolution.asset_slots',
      node_id: asset.asset_intent_id, message: 'La résolution d’asset ne correspond à aucun AssetIntent du CreativePlan.',
      context: { asset_slot: asset.asset_slot }, suggested_action: 'Résoudre l’AssetIntent exact du plan.',
    }));
    if (asset.status === 'unresolved' && asset.required) diagnostics.push(diagnostic({
      code: 'creative_compile.asset_required_unresolved', severity: 'error', path: '$.resolution.asset_slots',
      node_id: asset.asset_intent_id, message: 'Un asset requis reste non résolu.',
      context: { asset_slot: asset.asset_slot }, suggested_action: 'Fournir une référence locale/content-addressed avant compilation.',
    }));
  }
  for (const audio of resolution.audio_events) {
    if (!audioEvents.has(audio.creative_event_id)) diagnostics.push(diagnostic({
      code: 'creative_compile.audio_provenance_mismatch', severity: 'error', path: '$.resolution.audio_events',
      node_id: audio.creative_event_id, message: 'La résolution audio ne correspond à aucun AudioEventIntent.',
      suggested_action: 'Résoudre un événement audio présent dans le CreativePlan.',
    }));
  }
  plan.asset_intents.filter((asset) => asset.required && !resolutionAssetSlots.has(asset.slot)).forEach((asset) => diagnostics.push(diagnostic({
    code: 'creative_compile.asset_resolution_missing', severity: 'error', path: '$.asset_intents', node_id: asset.id,
    message: 'Un AssetIntent requis ne possède aucune entrée de résolution.', context: { asset_slot: asset.slot },
    suggested_action: 'Ajouter une résolution explicite pour cet asset.',
  })));
  for (const scene of plan.scenes) {
    const visualMode = scene.visual?.mode ?? plan.global_intents.visual?.mode ?? 'text_dominant';
    if (!profile.visual_modes[visualMode]) diagnostics.push(diagnostic({
      code: 'creative_compile.visual_intent_unsupported', severity: 'error', path: '$.scenes.visual.mode',
      node_id: scene.visual?.focal_element, scene_id: scene.id, message: `VisualIntent « ${visualMode} » non supporté par le profil.`,
      suggested_action: 'Étendre explicitement le profil de compilation.',
    }));
    const motion = scene.motion?.character ?? plan.global_intents.motion?.character;
    if (motion && !profile.motion_characters[motion]) diagnostics.push(diagnostic({
      code: 'creative_compile.motion_intent_unsupported', severity: 'error', path: '$.scenes.motion.character',
      scene_id: scene.id, message: `MotionIntent « ${motion} » non supporté par le profil.`,
      suggested_action: 'Ajouter un mapping vers un behavior P1 existant.',
    }));
    const transition = scene.transition_out?.kind ?? plan.global_intents.transitions?.kind;
    if (transition && !profile.transitions[transition]) diagnostics.push(diagnostic({
      code: 'creative_compile.transition_unsupported', severity: 'error', path: '$.scenes.transition_out.kind',
      scene_id: scene.id, message: `TransitionIntent « ${transition} » non supporté par le profil.`,
      suggested_action: 'Ajouter une stratégie de transition P1 explicite.',
    }));
    if (transition && profile.transitions[transition]?.fidelity === 'degraded') diagnostics.push(diagnostic({
      code: 'creative_compile.transition_degraded_to_cut', severity: 'warning', path: '$.scenes.transition_out.kind',
      scene_id: scene.id, message: `La transition « ${transition} » est préservée comme CUT explicite, faute de transition inter-scène équivalente P1.`,
      context: { transition, boundary_behavior: 'CUT' }, suggested_action: 'Conserver ce fallback ou ajouter ultérieurement une primitive inter-scène dédiée.',
    }));
    const narration = scene.audio?.narration ?? plan.global_intents.audio?.narration;
    const hasSpoken = scene.content.spoken.length > 0 || resolution.content_slots.some((slot) => slot.scene_id === scene.id && slot.status === 'resolved' && slot.channels.includes('spoken'));
    if (narration === 'required' && !hasSpoken) diagnostics.push(diagnostic({
      code: 'creative_compile.narration_required_unresolved', severity: 'error', path: '$.scenes.audio.narration',
      scene_id: scene.id, message: 'La narration est requise mais aucun contenu parlé résolu n’est disponible.',
      suggested_action: 'Résoudre un content slot parlé pour cette scène.',
    }));
    const sceneAudio = scene.audio ?? plan.global_intents.audio;
    if (sceneAudio?.sfx === 'required') {
      const hasResolvedSfx = (scene.audio?.events ?? []).some((event) => {
        const resolved = resolution.audio_events.find((entry) => entry.creative_event_id === event.id);
        return event.kind === 'sfx' && resolved?.status === 'resolved';
      });
      if (!hasResolvedSfx) diagnostics.push(diagnostic({
        code: 'creative_compile.audio_required_unresolved', severity: 'error', path: '$.scenes.audio.sfx',
        scene_id: scene.id, message: 'Un SFX requis ne possède aucune résolution audio explicite.',
        suggested_action: 'Résoudre un AudioEventIntent vers un cue P1 connu.',
      }));
    }
    if (sceneAudio?.music === 'required' || sceneAudio?.ambience === 'required') diagnostics.push(diagnostic({
      code: 'creative_compile.audio_required_unsupported', severity: 'error', path: '$.scenes.audio',
      scene_id: scene.id, message: 'Music/Ambience requis ne peut pas être résolu par le contrat MotionSpec P1 actuel.',
      suggested_action: 'Fournir ultérieurement un contrat d’asset audio explicite avant de rendre cette intention obligatoire.',
    }));
    scene.typography?.treatments.forEach((treatment) => {
      if (!profile.typography_roles[treatment.role]) diagnostics.push(diagnostic({
        code: 'creative_compile.typography_role_unsupported', severity: 'error', path: '$.scenes.typography.treatments',
        node_id: treatment.id, scene_id: scene.id, message: `Rôle typographique « ${treatment.role} » non supporté.`,
        suggested_action: 'Ajouter un mapping vers un rôle typographique P1.',
      }));
    });
  }
  const binding = styleBinding(style);
  if (binding.id.length > 64) diagnostics.push(diagnostic({
    code: 'creative_compile.style_incompatible', severity: 'error', path: '$.resolved_style',
    message: 'L’ID du style ne peut pas être représenté par MotionSpec.', suggested_action: 'Utiliser un style P1 avec un ID valide.',
  }));
  return diagnostics;
}

function buildReport(
  diagnostics: readonly CreativeDiagnostic[],
  hashes: CreativeCompileReport['hashes'],
  scenes: number,
  layers: number,
  resolution: CreativeResolution | null,
): CreativeCompileReport {
  const ordered = sortCreativeDiagnostics(diagnostics);
  const summary = summarizeDiagnostics(ordered);
  const status = reportStatus(ordered);
  return CreativeCompileReportSchema.parse({
    schema: 'creative-compile-report', schema_version: '0.1.0', compiler_version: CREATIVE_COMPILER_VERSION,
    status, eligible: status !== 'fail', diagnostics: ordered,
    summary: {
      ...summary, scenes, layers,
      resolved_content_slots: resolution?.content_slots.filter((slot) => slot.status === 'resolved').length ?? 0,
      resolved_asset_slots: resolution?.asset_slots.filter((slot) => slot.status === 'resolved').length ?? 0,
    },
    hashes,
  });
}

export function compileCreativePlan(planInput: unknown, options: CreativeCompileOptions): CreativeCompileResult {
  const parsedProfile = CompilationProfileSchema.safeParse(options.profile);
  const profileHash = parsedProfile.success ? compilationProfileFingerprint(parsedProfile.data) : hashDocument({ invalid_profile: true });
  const styleHash = options.resolved_style.sha256;
  const emptyHashes: CreativeCompileReport['hashes'] = {
    creative_plan: null, resolution: null, profile: profileHash, style: styleHash,
    motion_spec: null, provenance: null, compiler_fingerprint: null,
  };
  const creativeValidation = validateCreativePlan(planInput, { require_hook: false });
  if (!creativeValidation.ok || !creativeValidation.value || !creativeValidation.canonical_sha256) {
    const report = buildReport(creativeValidation.report.diagnostics, emptyHashes, 0, 0, null);
    return { ok: false, motion_spec: null, provenance: null, compiler_fingerprint: null, report };
  }
  if (!parsedProfile.success) {
    const diagnostics = parsedProfile.error.issues.map((issue): CreativeDiagnostic => ({
      code: 'creative_compile.profile_invalid', severity: 'error', path: `$.profile.${issue.path.join('.')}`,
      message: issue.message, suggested_action: 'Corriger le profil de compilation.',
    }));
    const report = buildReport(diagnostics, { ...emptyHashes, creative_plan: creativeValidation.canonical_sha256 }, creativeValidation.value.scenes.length, 0, null);
    return { ok: false, motion_spec: null, provenance: null, compiler_fingerprint: null, report };
  }
  const parsedResolution = CreativeResolutionSchema.safeParse(options.resolution);
  if (!parsedResolution.success) {
    const diagnostics = parsedResolution.error.issues.map((issue): CreativeDiagnostic => ({
      code: 'creative_compile.resolution_invalid', severity: 'error', path: `$.resolution.${issue.path.join('.')}`,
      message: issue.message, suggested_action: 'Corriger la résolution sans ajouter de contenu implicite.',
    }));
    const report = buildReport(diagnostics, { ...emptyHashes, creative_plan: creativeValidation.canonical_sha256 }, creativeValidation.value.scenes.length, 0, null);
    return { ok: false, motion_spec: null, provenance: null, compiler_fingerprint: null, report };
  }
  const plan = creativeValidation.value;
  const resolution = parsedResolution.data;
  const profile = parsedProfile.data;
  const resolutionHash = hashCreativeDocument(resolution);
  const diagnostics = preflight(plan, resolution, profile, options.resolved_style, options.pattern);
  const durations = durationAllocation(plan, diagnostics);
  if (diagnostics.some((entry) => entry.severity === 'error')) {
    const report = buildReport(diagnostics, {
      ...emptyHashes, creative_plan: creativeValidation.canonical_sha256, resolution: resolutionHash,
    }, plan.scenes.length, 0, resolution);
    return { ok: false, motion_spec: null, provenance: null, compiler_fingerprint: null, report };
  }

  const state: CompileState = {
    diagnostics, plan, resolution, profile, style: options.resolved_style, durations,
    contentByScene: contentByScene(resolution),
    assetBySlot: new Map(resolution.asset_slots.map((asset) => [asset.asset_slot, asset])),
    audioByEvent: new Map(resolution.audio_events.map((event) => [event.creative_event_id, event])),
    voiceSegments: [], provenanceScenes: [], provenanceLayers: [],
  };
  const scenes = plan.scenes.map((scene, index) => compileScene(state, scene, index));
  const sections = scenes.map((scene, index) => ({
    id: deriveCreativeId('rhythm_section', { scene_id: scene.id, index }),
    phase: profile.rhythm_roles[plan.scenes[index]!.narrative_role] ?? 'CALM',
    scenes: [scene.id],
  }));
  const specCandidate = {
    schema: 'motion-scene-spec' as const,
    schema_version: MOTION_SPEC_TARGET_VERSION,
    spec_id: deriveCreativeId('motion_spec', {
      plan_id: plan.plan_id, profile: `${profile.id}@${profile.version}`, style: options.resolved_style.sha256,
    }),
    revision: plan.revision,
    parent_revision: null,
    created_from: {
      intent_id: plan.plan_id,
      intent_sha256: creativeValidation.canonical_sha256,
      builder_version: CREATIVE_COMPILER_VERSION,
    },
    locale: plan.audience.locale,
    style_binding: styleBinding(options.resolved_style),
    format: { preset: 'vertical_9x16' as const, platform_safe_zones: [options.platform ?? profile.platform] },
    system: { id: profile.system.id, version: profile.system.version },
    rhythm: { curve: `creative.${profile.id.replaceAll('_', '.')}`, sections },
    voice: {
      direction: {
        persona: 'narrator',
        intention: plan.global_intents.audio?.direction ?? plan.creative_intent.objective,
        tempo: plan.global_intents.pacing?.character === 'fast' || plan.global_intents.pacing?.character === 'aggressive'
          ? 'brisk' as const
          : plan.global_intents.pacing?.character === 'slow' ? 'calm' as const : 'measured' as const,
      },
      segments: state.voiceSegments,
    },
    scenes,
  };
  const parsedSpec = MotionSceneSpecSchema.safeParse(specCandidate);
  if (!parsedSpec.success) {
    parsedSpec.error.issues.forEach((issue) => state.diagnostics.push(diagnostic({
      code: 'creative_compile.motion_spec_invalid', severity: 'error', path: `$.motion_spec.${issue.path.join('.')}`,
      message: issue.message, suggested_action: 'Corriger le mapping CreativePlan vers MotionSpec.',
    })));
  }
  const spec = parsedSpec.success ? parsedSpec.data : null;
  if (spec) {
    const p1Validation = validateSpec(spec, options.resolved_style, {
      registry: P14_BEHAVIOR_REGISTRY,
      assetRefs: new Set(resolution.asset_slots.flatMap((asset) => asset.status === 'resolved' ? [asset.asset_ref] : [])),
    });
    for (const issue of p1Validation.ok ? (p1Validation.warnings ?? []) : (p1Validation.issues ?? [])) {
      state.diagnostics.push(diagnostic({
        code: `creative_compile.p1.${issue.code}`, severity: issue.severity, path: `$.motion_spec.${issue.path}`,
        message: issue.message, suggested_action: 'Respecter le contrat MotionSpec P1 ; P1 reste l’autorité de validation.',
      }));
    }
  }
  if (!spec || state.diagnostics.some((entry) => entry.severity === 'error')) {
    const report = buildReport(state.diagnostics, {
      ...emptyHashes, creative_plan: creativeValidation.canonical_sha256, resolution: resolutionHash,
    }, scenes.length, state.provenanceLayers.length, resolution);
    return { ok: false, motion_spec: null, provenance: null, compiler_fingerprint: null, report };
  }

  const quantization = quantizedScenes(plan, durations, profile);
  const provenance = CreativeCompileProvenanceSchema.parse({
    schema: 'creative-compile-provenance', schema_version: '0.1.0',
    creative_plan_sha256: creativeValidation.canonical_sha256, resolution_sha256: resolutionHash,
    scenes: state.provenanceScenes, layers: state.provenanceLayers,
    quantization: {
      fps: profile.fps,
      target_duration_ms: durations.reduce((sum, value) => sum + value, 0),
      total_frames: quantization.at(-1)?.to_frame ?? 0,
      scenes: quantization,
    },
  });
  const motionSpecHash = hashDocument(spec);
  const provenanceHash = hashDocument(provenance);
  const fingerprint = hashDocument({
    creative_compiler: CREATIVE_COMPILER_VERSION,
    profile: { id: profile.id, version: profile.version, sha256: profileHash },
    style: { id: spec.style_binding.id, version: spec.style_binding.version, sha256: styleHash },
    creative_plan_sha256: creativeValidation.canonical_sha256,
    resolution_sha256: resolutionHash,
    motion_spec_target: MOTION_SPEC_TARGET_VERSION,
  });
  const report = buildReport(state.diagnostics, {
    creative_plan: creativeValidation.canonical_sha256, resolution: resolutionHash, profile: profileHash,
    style: styleHash, motion_spec: motionSpecHash, provenance: provenanceHash, compiler_fingerprint: fingerprint,
  }, scenes.length, state.provenanceLayers.length, resolution);
  return { ok: report.eligible, motion_spec: spec, provenance, compiler_fingerprint: fingerprint, report };
}
