import {
  MOTION_SPEC_VERSION,
  P14_BEHAVIOR_REGISTRY,
  P17_BEHAVIOR_REGISTRY,
  hashDocument,
  validateSpec,
} from '@motion-engine/core';
import type {
  Anchor,
  BehaviorInstance,
  GridPlacement,
  Layer,
  MotionSceneSpec,
  Scene,
  TextRun,
} from '@motion-engine/core';
import {
  CAMERA_REGISTRY,
  P32_CAMERA_REGISTRY,
  buildVisualPreflight,
  hashVisualDocument,
  visualStableId,
} from '@motion-engine/visual-core';
import type { VisualDiagnostic, VisualEntity, VisualPlan, VisualScene } from '@motion-engine/visual-core';

import { P32_VISUAL_COMPILER_VERSION, VISUAL_COMPILER_VERSION } from './contracts.ts';
import type { VisualCompileOptions, VisualCompileResult, VisualProvenanceEntry } from './contracts.ts';

const colorToken = {
  background: 'color.surface.primary', foreground: 'color.text.primary', accent: 'color.accent',
  muted: 'color.text.primary', inverse: 'color.text.inverse',
} as const;

const fillToken = {
  background: 'color.surface.primary', foreground: 'color.text.primary', accent: 'color.accent',
  muted: 'color.surface.inverse', inverse: 'color.surface.inverse',
} as const;

const typeToken = {
  DISPLAY: 'type.display.xl', HEADLINE: 'type.display.l', SUBHEAD: 'type.display.m', BODY: 'type.body',
  CAPTION: 'type.subtitle', DATA: 'type.display.xl', DECORATIVE_TYPE: 'type.display.m',
} as const;

const regionPlacement: Readonly<Record<VisualEntity['region'], GridPlacement>> = Object.freeze({
  full: { col: 1, row: 1, col_span: 6, row_span: 12 }, top: { col: 1, row: 1, col_span: 6, row_span: 3 },
  upper: { col: 1, row: 2, col_span: 6, row_span: 4 }, center: { col: 1, row: 4, col_span: 6, row_span: 6 },
  lower: { col: 1, row: 7, col_span: 6, row_span: 4 }, bottom: { col: 1, row: 10, col_span: 6, row_span: 3 },
  left: { col: 1, row: 2, col_span: 3, row_span: 10 }, right: { col: 4, row: 2, col_span: 3, row_span: 10 },
  foreground: { col: 1, row: 6, col_span: 6, row_span: 7 }, background: { col: 1, row: 1, col_span: 6, row_span: 12 },
});

function anchorStart(offsetMs = 0): Anchor {
  return offsetMs === 0 ? { event: 'scene.start' } : { event: 'scene.start', offset: { ms: offsetMs } };
}

function behavior(id: string, kind: string, at: Anchor, durationMs: number, options: Pick<BehaviorInstance, 'target' | 'params'> = {}): BehaviorInstance {
  return {
    id: visualStableId('behavior', { id, kind }), behavior: kind, version: '1.0.0',
    ...(options.target ? { target: options.target } : {}), ...(options.params ? { params: options.params } : {}),
    at, duration: { ms: durationMs },
  };
}

function runs(entity: VisualEntity): TextRun[] {
  const text = entity.text;
  if (!text) return [];
  const accents = new Set(text.accent_words.map((entry) => entry.toLocaleLowerCase('fr-FR')));
  const tokens = text.value.split(/(\s+)/u).filter((entry) => entry.length > 0);
  if (tokens.length > 24) return [{ id: visualStableId('run', { entity: entity.id, text: text.value }), text: text.value, role: 'base' }];
  return tokens.map((token, index) => ({
    id: visualStableId('run', { entity: entity.id, index, token }), text: token,
    role: accents.has(token.trim().replace(/[?!.,:;«»]/gu, '').toLocaleLowerCase('fr-FR')) ? 'accent' as const : 'base' as const,
  }));
}

function numericParameter(scene: VisualScene, entity: VisualEntity, patternId: string, key: string, fallback: number): number {
  const value = scene.patterns.find((entry) => entry.pattern_id === patternId && entry.target_ids.includes(entity.id))?.parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function phraseBehaviors(entity: VisualEntity, scene: VisualScene): BehaviorInstance[] {
  const result: BehaviorInstance[] = [];
  const phrases = scene.motion_phrases.filter((entry) => entry.target_ids.includes(entity.id));
  const patterns = scene.patterns.filter((entry) => entry.target_ids.includes(entity.id));
  const hasImpact = phrases.some((entry) => entry.phrase_id === 'HERO_WORD_IMPACT') || patterns.some((entry) => entry.pattern_id === 'KINETIC_WORD_IMPACT');
  const hasDynamicType = phrases.some((entry) => ['TYPE_TRACKING_IMPACT', 'TYPE_AXIS_PULSE', 'WORD_MASK_BRIDGE'].includes(entry.phrase_id))
    || patterns.some((entry) => ['TYPE_TRACKING_BURST', 'TYPE_WEIGHT_PULSE', 'TYPE_WIDTH_EXPANSION', 'WORD_TO_MASK'].includes(entry.pattern_id));
  const stagger = phrases.find((entry) => entry.phrase_id === 'STAGGERED_REVEAL');
  if (entity.kind === 'text' && (hasImpact || stagger || hasDynamicType)) {
    const targetIndex = stagger?.target_ids.indexOf(entity.id) ?? 0;
    const reveal = behavior(`${entity.id}:reveal`, 'REVEAL_TEXT', anchorStart(Math.max(0, targetIndex) * 140), 620, { params: { unit: 'line', stagger: 'tight' } });
    result.push(reveal);
    if (hasImpact && entity.text) {
      const accent = runs(entity).find((entry) => entry.role === 'accent') ?? runs(entity)[0];
      if (accent) {
        const impact = behavior(`${entity.id}:impact`, 'ACCENT_WORD', { after: reveal.id }, 360, { target: { run: accent.id } });
        result.push(impact, behavior(`${entity.id}:settle`, 'SETTLE', { after: impact.id }, 420, { target: { run: accent.id } }));
      }
    }
    if (hasDynamicType && entity.text) {
      const targetRun = runs(entity).find((entry) => entry.role === 'accent') ?? runs(entity).find((entry) => entry.text.trim().length > 0);
      if (targetRun) {
        const dynamicStart: Anchor = { after: reveal.id };
        const dynamicDuration = Math.min(900, Math.max(650, Math.round(scene.duration_ms * 0.16)));
        const tracking = behavior(`${entity.id}:tracking`, 'TYPE_TRACKING', dynamicStart, dynamicDuration, {
          target: { run: targetRun.id },
          params: {
            from_em: numericParameter(scene, entity, 'TYPE_TRACKING_BURST', 'from_em', -0.035),
            to_em: numericParameter(scene, entity, 'TYPE_TRACKING_BURST', 'to_em', 0.025),
          },
        });
        const weight = behavior(`${entity.id}:wght`, 'TYPE_AXIS', { after: tracking.id, offset: { ms: 34 } }, dynamicDuration, {
          target: { run: targetRun.id },
          params: {
            axis: 'wght',
            from: numericParameter(scene, entity, 'TYPE_WEIGHT_PULSE', 'from', 420),
            to: numericParameter(scene, entity, 'TYPE_WEIGHT_PULSE', 'to', 820),
          },
        });
        result.push(
          tracking,
          weight,
          behavior(`${entity.id}:wdth`, 'TYPE_AXIS', { after: weight.id, offset: { ms: 34 } }, dynamicDuration, {
            target: { run: targetRun.id },
            params: {
              axis: 'wdth',
              from: numericParameter(scene, entity, 'TYPE_WIDTH_EXPANSION', 'from', 72),
              to: numericParameter(scene, entity, 'TYPE_WIDTH_EXPANSION', 'to', 96),
            },
          }),
        );
      }
    }
  }
  if (entity.kind === 'path' && (phrases.some((entry) => ['PATH_CAUSAL_REVEAL', 'CAUSAL_PATH_IMPACT'].includes(entry.phrase_id)) || patterns.some((entry) => ['PATH_DRAW_EXPLANATION', 'DIAGRAM_CAUSAL_FLOW'].includes(entry.pattern_id)))) {
    result.push(behavior(`${entity.id}:draw`, 'DRAW_PATH', anchorStart(180), Math.min(1_800, Math.max(700, Math.round(scene.duration_ms * 0.36)))));
  }
  if (entity.kind === 'mask' && (patterns.some((entry) => ['MASK_TO_NEXT_SCENE', 'SHAPE_EXPANSION_TRANSITION', 'IMAGE_FULL_BLEED_REVEAL', 'TYPE_AS_TRANSITION', 'WORD_TO_MASK', 'SHAPE_TO_MASK', 'CIRCLE_TO_PORTAL', 'FRAME_EXPANSION'].includes(entry.pattern_id)) || phrases.some((entry) => ['WORD_MASK_BRIDGE', 'SEMANTIC_MORPH_CHAIN', 'FRAME_PORTAL_TRANSFORM'].includes(entry.phrase_id)))) {
    const duration = Math.min(1_200, Math.max(500, Math.round(scene.duration_ms * 0.22)));
    result.push(behavior(`${entity.id}:wipe`, 'MASK_WIPE', anchorStart(scene.duration_ms - duration), duration, { params: { direction: entity.mask?.direction ?? 'left_to_right' } }));
  }
  const camera = scene.camera_moves.find((entry) => entry.target_id === entity.id);
  if (camera && (entity.kind === 'group' || entity.kind === 'image')) {
    const definition = (scene.camera_moves.some((entry) => ['CAMERA_DEPTH_SURGE', 'CAMERA_SETTLE'].includes(entry.camera_id)) ? P32_CAMERA_REGISTRY : CAMERA_REGISTRY).get(camera.camera_id);
    if (definition) {
      const [minimum, maximum] = definition.safe_scale_range;
      const scale = minimum + (maximum - minimum) * camera.intensity;
      result.push(behavior(`${entity.id}:camera`, 'CAMERA_PUSH', anchorStart(), Math.max(300, scene.duration_ms - 120), { params: { scale } }));
    }
  }
  return result;
}

function childrenOf(entity: VisualEntity, scene: VisualScene): VisualEntity[] {
  return scene.entities.filter((candidate) => candidate.parent_id === entity.id);
}

function compileEntity(entity: VisualEntity, scene: VisualScene): Layer {
  const common = {
    id: entity.id,
    placement: regionPlacement[entity.region],
    must_be_safe: entity.safe,
    transform: {
      scale: entity.transform.scale, rotate_deg: entity.transform.rotate_deg,
      translate: { x: entity.transform.translate_x, y: entity.transform.translate_y },
    },
    behaviors: phraseBehaviors(entity, scene),
  };
  if (entity.kind === 'text') {
    if (!entity.text) throw new Error(`visual.compile.text_missing:${entity.id}`);
    return {
      ...common, primitive: 'text',
      content: { runs: runs(entity), break_policy: 'balance' },
      style: { type: typeToken[entity.text.role], color: colorToken[entity.style.text], accent_color: 'color.accent', muted_color: 'color.text.primary', align: entity.text.align },
      fit: { max_lines: entity.text.role === 'BODY' || entity.text.role === 'CAPTION' ? 5 : 4, allow_role_downgrade: false },
    };
  }
  if (entity.kind === 'shape') {
    if (!entity.shape) throw new Error(`visual.compile.shape_missing:${entity.id}`);
    return { ...common, primitive: 'shape', shape: entity.shape.kind, fill: fillToken[entity.style.fill] };
  }
  if (entity.kind === 'path') {
    if (!entity.path) throw new Error(`visual.compile.path_missing:${entity.id}`);
    return { ...common, primitive: 'path', geometry: { points: entity.path.points, ...(entity.path.closed ? { closed: true } : {}) }, style: { stroke: colorToken[entity.style.stroke], weight: 'stroke.emphasis', cap: 'round', join: 'round' }, progress: 1 };
  }
  if (entity.kind === 'image') {
    if (!entity.asset_ref) throw new Error(`visual.compile.asset_missing:${entity.id}`);
    return { ...common, primitive: 'image', asset: entity.asset_ref, fit: 'cover' };
  }
  const children = childrenOf(entity, scene).map((child) => compileEntity(child, scene));
  if (children.length === 0) throw new Error(`visual.compile.container_empty:${entity.id}`);
  if (entity.kind === 'mask') {
    if (!entity.mask) throw new Error(`visual.compile.mask_missing:${entity.id}`);
    return { ...common, primitive: 'mask', clip: { shape: entity.mask.shape, mode: 'reveal', direction: entity.mask.direction }, children };
  }
  return { ...common, primitive: 'group', children };
}

function purpose(role: string): Scene['purpose'] {
  if (role === 'hook') return 'hook';
  if (role === 'reveal') return 'reveal';
  if (role === 'proof' || role === 'example' || role === 'explanation') return 'proof';
  if (role === 'payoff' || role === 'takeaway') return 'resolution';
  if (role === 'cta') return 'cta';
  return 'tension';
}

function rhythm(index: number, count: number): 'CALM' | 'BUILD' | 'ACCELERATE' | 'INTERRUPTION' | 'REVEAL' | 'RESOLUTION' {
  if (index === 0) return 'INTERRUPTION';
  if (index === count - 1) return 'RESOLUTION';
  if (index === count - 2) return 'REVEAL';
  return index % 2 === 0 ? 'ACCELERATE' : 'BUILD';
}

function sceneEventKind(phase: string): 'BEAT' | 'HOLD' | 'REVEAL' | 'ACCENT' | 'IMPACT' | 'TRANSITION' {
  if (phase === 'ACCENT') return 'IMPACT';
  if (phase === 'HOLD') return 'HOLD';
  if (phase === 'EXIT') return 'TRANSITION';
  if (phase === 'ENTER') return 'REVEAL';
  return 'BEAT';
}

function compileScene(scene: VisualScene, plan: VisualPlan, options: VisualCompileOptions, index: number): Scene {
  const top = scene.entities.filter((entry) => entry.parent_id === null).map((entity) => compileEntity(entity, scene));
  const rootId = visualStableId('visual_root', { plan: plan.plan_id, scene: scene.id });
  const next = plan.scenes[index + 1];
  const bridge = plan.bridges.find((entry) => entry.source_scene_id === scene.id && entry.destination_scene_id === next?.id);
  const transition = bridge
    ? ['MASK_EXPANSION', 'FRAME_EXPANSION', 'TYPE_SCALE_THROUGH'].includes(bridge.bridge_id) ? 'MASK_WIPE'
      : ['CAMERA_CONTINUE', 'ELEMENT_CARRY', 'ZOOM_THROUGH', 'MATCH_POSITION', 'MATCH_SCALE', 'TYPE_CONTINUE', 'PATH_CONTINUE'].includes(bridge.bridge_id) ? 'CAMERA_PUSH'
        : 'CUT'
    : 'CUT';
  return {
    id: scene.id,
    pattern: { id: options.pattern.id, version: options.pattern.version, variation: { layout_variant: scene.layout.toLowerCase(), energy: scene.motion_intensity.toLowerCase() as 'low' | 'medium' | 'high', hierarchy_variant: scene.complexity.toLowerCase() } },
    purpose: purpose(scene.narrative_role), locks: ['layers', 'behaviors', 'timing', 'background'],
    timing: { anchor: { duration: { ms: scene.duration_ms } }, min_hold: { ms: Math.min(500, Math.max(100, Math.floor(scene.duration_ms * 0.1))) } },
    background: { fill: fillToken[scene.background_role] },
    layers: [{ id: rootId, primitive: 'group', behaviors: [], children: top }],
    events: scene.choreography.slice(0, 16).map((entry) => ({ id: entry.id, kind: sceneEventKind(entry.phase), at: anchorStart() })),
    sound: { derive_from_events: false, overrides: [] }, subtitles: { mode: 'off', reason: plan.schema_version === '0.2.0' ? 'P3.2 visual reference film is intentionally silent.' : 'P3.1 visual reference film is intentionally silent.' },
    ...(next ? { transition_out: { behavior: transition, version: '1.0.0', to: next.id } } : {}),
  };
}

export function compileVisualPlan(plan: VisualPlan, options: VisualCompileOptions): VisualCompileResult {
  const preflight = buildVisualPreflight(plan);
  const planHash = hashVisualDocument(plan);
  const compilerVersion = plan.schema_version === '0.2.0' ? P32_VISUAL_COMPILER_VERSION : VISUAL_COMPILER_VERSION;
  const behaviorRegistry = plan.schema_version === '0.2.0' ? P17_BEHAVIOR_REGISTRY : P14_BEHAVIOR_REGISTRY;
  const fingerprint = hashVisualDocument({
    compiler_version: compilerVersion, visual_plan_sha256: planHash,
    grammar: plan.grammar, style_sha256: options.resolved_style.sha256,
    p1_motion_spec_target: MOTION_SPEC_VERSION, pattern: { id: options.pattern.id, version: options.pattern.version },
  });
  if (!preflight.eligible_for_compilation) return { ok: false, motion_spec: null, preflight, diagnostics: preflight.diagnostics, provenance: [], hashes: { visual_plan: planHash, motion_spec: null, compiler_fingerprint: fingerprint } };
  let spec: MotionSceneSpec;
  try {
    spec = {
      schema: 'motion-scene-spec', schema_version: MOTION_SPEC_VERSION,
      spec_id: visualStableId('motion_spec', { visual_plan: plan.plan_id, fingerprint }), revision: 1, parent_revision: null,
      created_from: { intent_id: plan.source.creative_plan_id, intent_sha256: plan.source.creative_plan_sha256, builder_version: compilerVersion },
      locale: 'fr-FR', style_binding: { kind: 'style', id: options.resolved_style.sources.style.id, version: options.resolved_style.sources.style.version },
      format: { preset: 'vertical_9x16', platform_safe_zones: [options.target_platform] },
      system: { id: options.pattern.id, version: options.pattern.version },
      rhythm: { curve: 'professional.intentional_contrast', sections: plan.scenes.map((scene, index) => ({ id: visualStableId('rhythm', scene.id), phase: rhythm(index, plan.scenes.length), scenes: [scene.id] })) },
      voice: { direction: { persona: 'silent_visual_reference', intention: plan.schema_version === '0.2.0' ? 'Démonstration visuelle P3.2 sans fournisseur audio.' : 'Démonstration visuelle P3.1 sans fournisseur audio.', tempo: 'measured' }, segments: [] },
      scenes: plan.scenes.map((scene, index) => compileScene(scene, plan, options, index)),
    };
  } catch (error) {
    const diagnostic: VisualDiagnostic = { code: 'visual.compiler.resolver_failure', severity: 'error', path: '$', message: error instanceof Error ? error.message : 'Échec du resolver visuel.', suggested_action: 'Corriger le VisualPlan ou le resolver versionné.' };
    return { ok: false, motion_spec: null, preflight, diagnostics: [...preflight.diagnostics, diagnostic], provenance: [], hashes: { visual_plan: planHash, motion_spec: null, compiler_fingerprint: fingerprint } };
  }
  const p1Validation = validateSpec(spec, options.resolved_style, { registry: behaviorRegistry, assetRefs: options.asset_refs ?? new Set() });
  if (!p1Validation.ok) {
    const p1Diagnostics: VisualDiagnostic[] = p1Validation.issues.map((issue) => ({ code: `visual.compiler.p1.${issue.code}`, severity: issue.severity, path: issue.path, message: issue.message, suggested_action: 'Respecter le contrat MotionSpec P1.' }));
    return { ok: false, motion_spec: null, preflight, diagnostics: [...preflight.diagnostics, ...p1Diagnostics], provenance: [], hashes: { visual_plan: planHash, motion_spec: null, compiler_fingerprint: fingerprint } };
  }
  const provenance: VisualProvenanceEntry[] = plan.scenes.flatMap((scene) => scene.entities.map((entity) => ({
    creative_scene_id: scene.source_scene_id, visual_scene_id: scene.id, visual_entity_id: entity.visual_entity_id ?? entity.id,
    motion_scene_id: scene.id, motion_layer_id: entity.id,
    patterns: scene.patterns.filter((entry) => entry.target_ids.includes(entity.id)).map((entry) => `${entry.pattern_id}@${entry.version}`),
    phrases: scene.motion_phrases.filter((entry) => entry.target_ids.includes(entity.id)).map((entry) => `${entry.phrase_id}@${entry.version}`),
  })));
  return {
    ok: true, motion_spec: spec, preflight, diagnostics: preflight.diagnostics, provenance,
    hashes: { visual_plan: planHash, motion_spec: hashDocument(spec), compiler_fingerprint: fingerprint },
  };
}
