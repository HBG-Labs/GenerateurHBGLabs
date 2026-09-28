import type { CreativePlan, SceneIntent } from '../contracts/creative-plan.ts';
import type { CreativeDiagnostic } from '../contracts/diagnostics.ts';
import type { AssetIntent } from '../contracts/intents.ts';
import { reportStatus, sortCreativeDiagnostics } from '../diagnostics.ts';
import { deriveCreativeId } from '../stable-id.ts';
import { validateCreativePlan, type CreativeValidationResult } from '../validation.ts';
import {
  DEFAULT_ARCHETYPE_REGISTRY,
  type ArchetypeRegistry,
  type NarrativeArchetype,
} from './archetypes.ts';
import {
  ContentSlotSchema,
  PlanningReportSchema,
  type ContentSlot,
  type NarrativeRole,
  type PlannerAssetKind,
  type PlannerInput,
  type PlannerValidationReport,
  type PlanningDecision,
  type PlanningReport,
  type SceneAllocation,
  type StoryBeat,
} from './contracts.ts';
import { allocateSceneDurations } from './duration.ts';
import { DEFAULT_PLANNER_LIMITS, type PlannerLimits } from './limits.ts';
import {
  DEFAULT_PLANNING_POLICY,
  profileForRole,
  type PlanningPolicy,
  type RoleIntentProfile,
} from './policy.ts';
import { runPlanningPreflight } from './preflight.ts';
import { planStory } from './story.ts';
import { validatePlannerInput } from './validation.ts';

export interface PlannerOptions {
  readonly registry?: ArchetypeRegistry;
  readonly policy?: PlanningPolicy;
  readonly limits?: PlannerLimits;
}

export interface StoryPlanningResult {
  readonly ok: boolean;
  readonly input_validation: PlannerValidationReport;
  readonly creative_plan: CreativePlan | null;
  readonly creative_validation: CreativeValidationResult | null;
  readonly content_slots: readonly ContentSlot[];
  readonly report: PlanningReport | null;
}

interface PlannedAssets {
  readonly assets: AssetIntent[];
  readonly report: PlanningReport['asset_intents'];
  readonly byScene: ReadonlyMap<string, readonly string[]>;
  readonly plannerKindByScene: ReadonlyMap<string, PlannerAssetKind>;
  readonly decisions: readonly PlanningDecision[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

const densityValue = { minimal: 0.18, low: 0.36, medium: 0.58, high: 0.78 } as const;

function seconds(milliseconds: number): number {
  return milliseconds / 1_000;
}

function creativeAssetKind(kind: PlannerAssetKind): AssetIntent['kind'] {
  if (kind === 'diagram') return 'illustration';
  return kind;
}

function planAssets(
  input: PlannerInput,
  scenes: readonly SceneAllocation[],
  policy: PlanningPolicy,
  limits: PlannerLimits,
): PlannedAssets {
  const assets: AssetIntent[] = [];
  const reportEntries: PlanningReport['asset_intents'] = [];
  const sceneSlots = new Map<string, string[]>();
  const kindByScene = new Map<string, PlannerAssetKind>();
  const decisions: PlanningDecision[] = [];
  const diagnostics: CreativeDiagnostic[] = [];
  const forbidden = new Set(
    input.constraints.filter((constraint) => constraint.kind === 'forbid_asset').map((constraint) => constraint.asset_kind),
  );
  const required = new Set(
    input.constraints.filter((constraint) => constraint.kind === 'require_asset').map((constraint) => constraint.asset_kind),
  );
  const suppressAll = required.has('none');

  const create = (scene: SceneAllocation, kind: PlannerAssetKind, reason: string) => {
    if (kind === 'none' || suppressAll || forbidden.has(kind)) return;
    const slot = deriveCreativeId('asset_slot', {
      input_id: input.input_id,
      scene_id: scene.scene_id,
      kind,
      reason,
    });
    const id = deriveCreativeId('asset_intent', { input_id: input.input_id, slot });
    const constraints = kind === 'diagram' ? ['diagrammatic', 'no_embedded_text'] : ['semantic_match'];
    assets.push({
      id,
      slot,
      kind: creativeAssetKind(kind),
      required: true,
      purpose: `asset_for_role:${scene.primary_role}`,
      content_description: `topic:${input.topic};role:${scene.primary_role};purpose:${reason}`,
      constraints,
    });
    sceneSlots.set(scene.scene_id, [...(sceneSlots.get(scene.scene_id) ?? []), slot]);
    kindByScene.set(scene.scene_id, kind);
    reportEntries.push({ id, slot, kind, scene_ids: [scene.scene_id] });
    decisions.push({
      code: 'planner.asset.required',
      kind: 'selected',
      node_ids: [id, scene.scene_id],
      context: { asset_kind: kind, reason },
    });
  };

  scenes.forEach((scene) => {
    const profile = profileForRole(policy, scene.primary_role);
    create(scene, profile.asset_kind, 'role_profile');
  });
  for (const kind of required) {
    if (kind === 'none' || assets.some((_, index) => reportEntries[index]?.kind === kind)) continue;
    const target = scenes[0];
    if (!target) {
      diagnostics.push({
        code: 'planner.asset_without_scene',
        severity: 'error',
        path: '$.constraints',
        message: `L’asset requis « ${kind} » ne peut être affecté à aucune scène.`,
        context: { asset_kind: kind },
        suggested_action: 'Autoriser au moins une scène ou retirer cette contrainte.',
      });
      continue;
    }
    create(target, kind, 'input_constraint');
  }
  if (assets.length > limits.max_asset_intents) {
    diagnostics.push({
      code: 'planner.limit.asset_intents_exceeded',
      severity: 'error',
      path: '$.constraints',
      message: 'Le nombre d’intentions d’asset dépasse la limite du planner.',
      context: { actual: assets.length, limit: limits.max_asset_intents },
      suggested_action: 'Réduire les besoins d’assets ou le nombre de scènes.',
    });
  }
  return { assets, report: reportEntries, byScene: sceneSlots, plannerKindByScene: kindByScene, decisions, diagnostics };
}

function slotsForScene(
  allocation: SceneAllocation,
  beatsById: ReadonlyMap<string, StoryBeat>,
  slots: readonly ContentSlot[],
): readonly ContentSlot[] {
  const beatIds = new Set(allocation.beat_ids);
  return slots.filter((slot) => beatIds.has(slot.beat_id) && beatsById.has(slot.beat_id));
}

function sceneContent(
  input: PlannerInput,
  allocation: SceneAllocation,
  beats: readonly StoryBeat[],
  slots: readonly ContentSlot[],
): SceneIntent['content'] {
  const spoken: SceneIntent['content']['spoken'] = [];
  const onScreen: SceneIntent['content']['on_screen'] = [];
  const claims: SceneIntent['content']['claims'] = [];
  for (const slot of slots) {
    if (slot.status !== 'resolved') continue;
    if (slot.constraints.channels.includes('spoken')) {
      spoken.push({
        id: deriveCreativeId('spoken', { scene_id: allocation.scene_id, slot_id: slot.id }),
        text: slot.text,
        delivery: input.tone[0],
      });
    }
    if (slot.constraints.channels.includes('on_screen')) {
      onScreen.push({
        id: deriveCreativeId('screen', { scene_id: allocation.scene_id, slot_id: slot.id }),
        text: slot.text,
        semantic_role: slot.role,
      });
    }
    if (slot.factual_requirement !== 'none') {
      const sourceSlot =
        slot.source_slot ?? deriveCreativeId('source', { input_id: input.input_id, slot_id: slot.id });
      claims.push({
        id: deriveCreativeId('claim', { scene_id: allocation.scene_id, slot_id: slot.id }),
        statement: slot.text,
        classification: input.factual_mode === 'creative' ? 'creative_statement' : 'factual_claim',
        uncertainty: input.factual_mode === 'creative' ? 'none' : 'unknown',
        source_requirement:
          slot.factual_requirement === 'source_required'
            ? 'required'
            : slot.factual_requirement === 'source_recommended'
              ? 'recommended'
              : 'none',
        ...(sourceSlot === undefined ? {} : { source_slot: sourceSlot }),
      });
    }
  }
  return {
    semantic_meaning: `topic:${input.topic};roles:${beats.map((beat) => beat.role).join(',')}`,
    spoken,
    on_screen: onScreen,
    claims,
  };
}

function sceneProfile(input: PlannerInput, role: NarrativeRole, policy: PlanningPolicy): RoleIntentProfile {
  const profile = profileForRole(policy, role);
  const toneMotion = input.tone.map((tone) => policy.tone_motion[tone]).find((value) => value !== undefined);
  const terminal = role === 'takeaway' || role === 'payoff' || role === 'cta';
  if (!toneMotion || terminal || profile.motion_character !== policy.default_profile.motion_character) return profile;
  return { ...profile, motion_character: toneMotion };
}

function creativeScene(
  input: PlannerInput,
  allocation: SceneAllocation,
  beats: readonly StoryBeat[],
  slots: readonly ContentSlot[],
  assetSlots: readonly string[],
  profile: RoleIntentProfile,
  index: number,
  totalScenes: number,
): SceneIntent {
  const content = sceneContent(input, allocation, beats, slots);
  const visualElements = beats.map((beat, beatIndex) => ({
    id: deriveCreativeId('visual', { scene_id: allocation.scene_id, beat_id: beat.id }),
    kind: beat.role,
    hierarchy: beatIndex === 0 ? ('primary' as const) : ('supporting' as const),
    purpose: beat.semantic_purpose,
    ...(beatIndex === 0 && assetSlots[0] ? { asset_slot: assetSlots[0] } : {}),
  }));
  const primary = visualElements[0]!;
  const relationships = visualElements.slice(1).map((element) => ({
    id: deriveCreativeId('visual_relation', { scene_id: allocation.scene_id, from: element.id, to: primary.id }),
    from: element.id,
    to: primary.id,
    relation: 'supports',
  }));
  const treatments = content.on_screen.map((entry) => ({
    id: deriveCreativeId('type', { scene_id: allocation.scene_id, content_id: entry.id }),
    content_id: entry.id,
    role: profile.typography_role,
    character: profile.typography_character,
    emphasis: Math.min(1, Math.max(0.2, beats[0]!.importance / 100)),
  }));
  const anchorId = content.on_screen[0]?.id ?? content.spoken[0]?.id;
  const audioEvents: NonNullable<SceneIntent['audio']>['events'] = [];
  if (profile.audio_cue !== 'none') {
    audioEvents.push({
      id: deriveCreativeId('audio_event', { scene_id: allocation.scene_id, cue: profile.audio_cue }),
      kind: 'sfx',
      description: `semantic_sfx:${profile.audio_cue}`,
      ...(anchorId === undefined ? {} : { relation: { relation: 'with' as const, target_id: anchorId } }),
    });
  }
  if (allocation.primary_role === 'reveal') {
    audioEvents.push({
      id: deriveCreativeId('audio_event', { scene_id: allocation.scene_id, cue: 'dramatic_pause' }),
      kind: 'silence',
      description: 'dramatic_pause_before_reveal',
    });
  }
  const narrationForbidden = input.constraints.some((constraint) => constraint.kind === 'forbid_narration');
  const narrationRequired = input.constraints.some((constraint) => constraint.kind === 'require_narration');
  const narration = narrationForbidden ? 'none' : narrationRequired || slots.some((slot) => slot.constraints.channels.includes('spoken')) ? 'required' : 'optional';
  return {
    id: allocation.scene_id,
    narrative_role: allocation.primary_role,
    semantic_purpose: beats.map((beat) => beat.semantic_purpose).join('|'),
    content,
    visual: {
      mode: profile.visual_mode,
      focal_element: primary.id,
      elements: visualElements,
      hierarchy_relationships: relationships,
      direction: `role:${allocation.primary_role};asset_query:${input.topic}`,
    },
    motion: {
      character: profile.motion_character,
      intensity: Math.min(0.95, Math.max(0.2, beats[0]!.importance / 100)),
      enter_emphasis: allocation.primary_role === 'hook' ? 'immediate' : 'role_driven',
      settle_behavior: allocation.primary_role === 'takeaway' || allocation.primary_role === 'payoff' ? 'restrained' : 'controlled',
    },
    typography: { character: profile.typography_character, treatments },
    audio: {
      narration,
      music: 'optional',
      sfx: audioEvents.some((event) => event.kind === 'sfx') ? 'optional' : 'none',
      ambience: profile.asset_kind === 'background' ? 'optional' : 'none',
      events: audioEvents,
    },
    ...(content.spoken.length === 0
      ? {}
      : {
          subtitles: {
            required: true,
            emphasis_intent: 'key_terms',
            density: allocation.information_density === 'high' ? ('dense' as const) : ('standard' as const),
            presentation_style: 'clear',
          },
        }),
    transition_out: {
      kind: index === totalScenes - 1 ? 'smooth' : profile.transition_kind,
      intensity: index === totalScenes - 1 ? 0.2 : Math.min(0.9, Math.max(0.2, beats[0]!.importance / 110)),
    },
    pacing: {
      character: input.pacing,
      information_density: densityValue[allocation.information_density],
      desired_duration: {
        min_seconds: seconds(allocation.duration_ms),
        preferred_seconds: seconds(allocation.duration_ms),
        max_seconds: seconds(allocation.duration_ms),
      },
    },
    asset_slots: [...assetSlots],
  };
}

function creativePlan(
  input: PlannerInput,
  archetype: NarrativeArchetype,
  beats: readonly StoryBeat[],
  allocations: readonly SceneAllocation[],
  contentSlots: readonly ContentSlot[],
  assets: PlannedAssets,
  policy: PlanningPolicy,
): CreativePlan {
  const beatsById = new Map(beats.map((beat) => [beat.id, beat]));
  const scenes = allocations.map((allocation, index) => {
    const sceneBeats = allocation.beat_ids.map((id) => beatsById.get(id)).filter((beat): beat is StoryBeat => beat !== undefined);
    const slots = slotsForScene(allocation, beatsById, contentSlots);
    return creativeScene(
      input,
      allocation,
      sceneBeats,
      slots,
      assets.byScene.get(allocation.scene_id) ?? [],
      sceneProfile(input, allocation.primary_role, policy),
      index,
      allocations.length,
    );
  });
  const hookBeat = beats.find((beat) => beat.role === 'hook');
  const hookScene = hookBeat ? allocations.find((scene) => scene.beat_ids.includes(hookBeat.id)) : undefined;
  const hookSlot = hookBeat ? contentSlots.find((slot) => slot.beat_id === hookBeat.id && slot.role === 'hook_text') : undefined;
  const ctaBeat = beats.find((beat) => beat.role === 'cta');
  const ctaSlot = ctaBeat ? contentSlots.find((slot) => slot.beat_id === ctaBeat.id && slot.role === 'cta') : undefined;
  const narrationForbidden = input.constraints.some((constraint) => constraint.kind === 'forbid_narration');
  const hasSfx = scenes.some((scene) => scene.audio?.events.some((event) => event.kind === 'sfx'));
  return {
    schema: 'creative-plan',
    schema_version: '0.1.0',
    plan_id: deriveCreativeId('plan', {
      input_id: input.input_id,
      input_topic: input.topic,
      archetype: archetype.id,
      archetype_version: archetype.version,
    }),
    revision: 1,
    creative_intent: {
      primary: input.creative_goal,
      secondary: [archetype.id.toLowerCase()],
      objective: `plan_with_archetype:${archetype.id}`,
      core_message: input.topic,
      desired_outcome: input.desired_reaction,
      constraints: input.constraints.map((constraint) => `${constraint.kind}:${constraint.id}`),
    },
    audience: {
      audience: input.audience.description,
      knowledge_level: input.audience.knowledge_level,
      desired_reaction: input.desired_reaction,
      tone: input.tone,
      language: input.language,
      locale: input.locale,
    },
    target: {
      format: input.target_format === 'vertical_short' ? 'vertical_short_form' : input.target_format,
      duration: {
        min_seconds: seconds(input.target_duration_ms),
        preferred_seconds: seconds(input.target_duration_ms),
        max_seconds: seconds(input.target_duration_ms),
      },
    },
    narrative: {
      ...(hookBeat && hookScene
        ? {
            hook: {
              id: deriveCreativeId('hook', { input_id: input.input_id, beat_id: hookBeat.id }),
              concept: hookSlot?.status === 'resolved' ? hookSlot.text : input.topic,
              role: 'hook',
              priority: hookBeat.importance,
              desired_duration: {
                min_seconds: seconds(hookScene.duration_ms),
                preferred_seconds: seconds(hookScene.duration_ms),
                max_seconds: seconds(hookScene.duration_ms),
              },
              intensity: Math.min(1, hookBeat.importance / 100),
              first_scene_id: hookScene.scene_id,
            },
          }
        : {}),
      sections: beats.map((beat) => ({
        id: deriveCreativeId('section', { input_id: input.input_id, beat_id: beat.id }),
        role: beat.role,
        purpose: beat.semantic_purpose,
        scene_ids: allocations.filter((scene) => scene.beat_ids.includes(beat.id)).map((scene) => scene.scene_id),
      })),
      ...(ctaBeat
        ? {
            cta: {
              id: deriveCreativeId('cta', { input_id: input.input_id, beat_id: ctaBeat.id }),
              purpose: 'narrative_role:cta',
              ...(ctaSlot?.status === 'resolved' ? { text: ctaSlot.text } : {}),
              required: input.cta.mode === 'explicit',
            },
          }
        : {}),
    },
    global_intents: {
      motion: {
        character: policy.tone_motion[input.tone[0]!] ?? 'restrained',
        intensity: input.pacing === 'aggressive' ? 0.8 : input.pacing === 'fast' ? 0.65 : 0.45,
        settle_behavior: 'controlled',
      },
      audio: {
        narration: narrationForbidden ? 'none' : 'required',
        music: 'optional',
        sfx: hasSfx ? 'optional' : 'none',
        ambience: 'optional',
        direction: 'semantic_audio_intents_only',
        events: [],
      },
      subtitles: {
        required: !narrationForbidden,
        emphasis_intent: 'key_terms',
        density: input.information_density === 'high' ? 'dense' : 'standard',
        presentation_style: 'clear',
      },
      pacing: { character: input.pacing, information_density: densityValue[input.information_density] },
    },
    asset_intents: assets.assets,
    scenes,
  };
}

function failedPlanningReport(
  input: PlannerInput,
  registry: ArchetypeRegistry,
  diagnostics: readonly CreativeDiagnostic[],
): PlanningReport {
  const ordered = sortCreativeDiagnostics(diagnostics);
  const archetypeId = input.narrative_archetype ?? 'EXPLAINER';
  return PlanningReportSchema.parse({
    schema: 'planning-report',
    schema_version: '0.1.0',
    planner_version: '0.2.0',
    status: 'fail',
    eligible_for_creative_compilation: false,
    planner_input_sha256: hashInput(input),
    registry_fingerprint: registry.fingerprint(),
    archetype: { id: archetypeId, version: '0.0.0', selection: input.narrative_archetype ? 'received' : 'defaulted' },
    beats: [],
    story_arc: [],
    scenes: [],
    duration: { target_ms: input.target_duration_ms, allocated_ms: 0, exact: false },
    content_slots: { total: 0, resolved: 0, unresolved: 0, required_unresolved: 0, ids: [] },
    asset_intents: [],
    decisions: [],
    diagnostics: ordered,
    creative_plan: { sha256: null, preflight_status: 'fail', errors: 0, warnings: 0 },
  });
}

function hashInput(input: PlannerInput): string {
  // Le validateur a déjà établi la sérialisabilité canonique de l'entrée.
  return validatePlannerInput(input).report.planner_input_sha256!;
}

export function planCreativeStory(input: unknown, options: PlannerOptions = {}): StoryPlanningResult {
  const registry = options.registry ?? DEFAULT_ARCHETYPE_REGISTRY;
  const policy = options.policy ?? DEFAULT_PLANNING_POLICY;
  const limits = options.limits ?? DEFAULT_PLANNER_LIMITS;
  const validated = validatePlannerInput(input, limits);
  if (!validated.ok || !validated.value) {
    return {
      ok: false,
      input_validation: validated.report,
      creative_plan: null,
      creative_validation: null,
      content_slots: [],
      report: null,
    };
  }
  const plannerInput = validated.value;
  const selected = registry.select(plannerInput);
  if (!selected) {
    const diagnostic: CreativeDiagnostic = {
      code: 'planner.archetype_unknown',
      severity: 'error',
      path: '$.narrative_archetype',
      message: `L’archétype « ${String(plannerInput.narrative_archetype)} » n’existe pas dans le registre.`,
      context: { archetype: plannerInput.narrative_archetype ?? null },
      suggested_action: 'Enregistrer cet archétype ou choisir un ID connu.',
    };
    return {
      ok: false,
      input_validation: validated.report,
      creative_plan: null,
      creative_validation: null,
      content_slots: [],
      report: failedPlanningReport(plannerInput, registry, [diagnostic]),
    };
  }

  const selectionDecision: PlanningDecision = {
    code: 'planner.archetype.selected',
    kind: selected.selection === 'defaulted' ? 'defaulted' : 'selected',
    node_ids: [],
    context: { archetype: selected.definition.id, version: selected.definition.version, selection: selected.selection },
  };
  const story = planStory(plannerInput, selected.definition, limits);
  const duration = allocateSceneDurations(plannerInput, selected.definition, story.beats, limits);
  const assets = planAssets(plannerInput, duration.scenes, policy, limits);
  const planningPreflight = runPlanningPreflight({
    planner_input: plannerInput,
    archetype: selected.definition,
    beats: story.beats,
    scenes: duration.scenes,
    content_slots: story.content_slots,
    asset_intent_count: assets.assets.length,
    limits,
  });
  const earlyDiagnostics = [...story.diagnostics, ...duration.diagnostics, ...assets.diagnostics, ...planningPreflight];
  if (earlyDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const failure = failedPlanningReport(plannerInput, registry, earlyDiagnostics);
    return {
      ok: false,
      input_validation: validated.report,
      creative_plan: null,
      creative_validation: null,
      content_slots: story.content_slots,
      report: failure,
    };
  }

  story.content_slots.forEach((slot) => ContentSlotSchema.parse(slot));
  const plan = creativePlan(
    plannerInput,
    selected.definition,
    story.beats,
    duration.scenes,
    story.content_slots,
    assets,
    policy,
  );
  const hasHook = story.beats.some((beat) => beat.role === 'hook');
  const creativeValidation = validateCreativePlan(plan, { require_hook: hasHook });
  const creativeDiagnostics = creativeValidation.report.diagnostics;
  const diagnostics = sortCreativeDiagnostics([...earlyDiagnostics, ...creativeDiagnostics]);
  const status = reportStatus(diagnostics);
  const allocatedMs = duration.scenes.reduce((sum, scene) => sum + scene.duration_ms, 0);
  const unresolved = story.content_slots.filter((slot) => slot.status === 'unresolved');
  const requiredUnresolved = unresolved.filter((slot) => slot.required);
  const decisions = [selectionDecision, ...story.decisions, ...duration.decisions, ...assets.decisions];
  const planningReport = PlanningReportSchema.parse({
    schema: 'planning-report',
    schema_version: '0.1.0',
    planner_version: '0.2.0',
    status,
    eligible_for_creative_compilation: status !== 'fail' && creativeValidation.report.status !== 'fail',
    planner_input_sha256: validated.report.planner_input_sha256!,
    registry_fingerprint: registry.fingerprint(),
    archetype: { id: selected.definition.id, version: selected.definition.version, selection: selected.selection },
    beats: story.beats,
    story_arc: story.story_arc,
    scenes: duration.scenes,
    duration: {
      target_ms: plannerInput.target_duration_ms,
      allocated_ms: allocatedMs,
      exact: allocatedMs === plannerInput.target_duration_ms,
    },
    content_slots: {
      total: story.content_slots.length,
      resolved: story.content_slots.length - unresolved.length,
      unresolved: unresolved.length,
      required_unresolved: requiredUnresolved.length,
      ids: story.content_slots.map((slot) => slot.id),
    },
    asset_intents: assets.report,
    decisions,
    diagnostics,
    creative_plan: {
      sha256: creativeValidation.canonical_sha256 ?? null,
      preflight_status: creativeValidation.report.status,
      errors: creativeValidation.report.summary.errors,
      warnings: creativeValidation.report.summary.warnings,
    },
  });
  return {
    ok: status !== 'fail' && creativeValidation.ok,
    input_validation: validated.report,
    creative_plan: plan,
    creative_validation: creativeValidation,
    content_slots: story.content_slots,
    report: planningReport,
  };
}
