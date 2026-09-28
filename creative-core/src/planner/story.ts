import type { CreativeDiagnostic } from '../contracts/diagnostics.ts';
import { deriveCreativeId } from '../stable-id.ts';
import type { ArchetypeRoleRule, NarrativeArchetype } from './archetypes.ts';
import type {
  ContentSlot,
  ContentSlotRole,
  PlannerInput,
  PlanningDecision,
  StoryArcPoint,
  StoryBeat,
} from './contracts.ts';
import type { PlannerLimits } from './limits.ts';

export interface StoryPlanResult {
  readonly beats: readonly StoryBeat[];
  readonly story_arc: readonly StoryArcPoint[];
  readonly content_slots: readonly ContentSlot[];
  readonly decisions: readonly PlanningDecision[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

function contentRole(role: StoryBeat['role']): ContentSlotRole {
  if (role === 'hook') return 'hook_text';
  if (role === 'explanation') return 'explanation';
  if (role === 'reveal') return 'reveal';
  if (role === 'cta') return 'cta';
  if (role === 'comparison_a' || role === 'comparison_b' || role === 'contrast') return 'comparison';
  if (role === 'consequence' || role === 'proof') return 'factual_claim';
  return 'narration';
}

function arcPhase(role: StoryBeat['role']): StoryArcPoint['phase'] {
  if (role === 'hook') return 'curiosity';
  if (['premise', 'setup', 'context', 'problem', 'comparison_a', 'comparison_b'].includes(role)) return 'context';
  if (['consequence', 'development', 'example', 'item', 'partial_information', 'tension'].includes(role)) return 'tension';
  if (['escalation', 'strongest_item', 'contrast', 'demonstration', 'action', 'proof'].includes(role)) return 'escalation';
  if (role === 'reveal' || role === 'result') return 'reveal';
  return 'resolution';
}

function arcDirection(phase: StoryArcPoint['phase']): StoryArcPoint['direction'] {
  if (phase === 'curiosity' || phase === 'tension' || phase === 'escalation') return 'rise';
  if (phase === 'resolution') return 'fall';
  return 'hold';
}

function selectedRules(
  input: PlannerInput,
  archetype: NarrativeArchetype,
  decisions: PlanningDecision[],
  diagnostics: CreativeDiagnostic[],
): ArchetypeRoleRule[] {
  const requiredByInput = new Set(
    input.constraints.filter((constraint) => constraint.kind === 'require_role').map((constraint) => constraint.role),
  );
  const forbiddenByInput = new Set(
    input.constraints.filter((constraint) => constraint.kind === 'forbid_role').map((constraint) => constraint.role),
  );
  for (const role of requiredByInput) {
    if (!archetype.supported_roles.includes(role)) {
      diagnostics.push({
        code: 'planner.archetype.role_unsupported',
        severity: 'error',
        path: '$.constraints',
        message: `L’archétype ${archetype.id} ne supporte pas le rôle requis « ${role} ».`,
        context: { archetype: archetype.id, role },
        suggested_action: 'Choisir un autre archétype ou retirer cette contrainte.',
      });
    }
  }

  const retained = archetype.role_rules.filter((rule) => {
    const forbidden = forbiddenByInput.has(rule.role);
    if (forbidden && rule.required) {
      diagnostics.push({
        code: 'planner.archetype.required_role_forbidden',
        severity: 'error',
        path: '$.constraints',
        message: `Le rôle obligatoire « ${rule.role} » est interdit par l’entrée.`,
        context: { archetype: archetype.id, role: rule.role },
        suggested_action: 'Retirer la contrainte ou choisir un archétype compatible.',
      });
      return false;
    }
    const include = !forbidden && (rule.required || requiredByInput.has(rule.role) || input.target_duration_ms >= rule.activation_duration_ms);
    decisions.push({
      code: include ? 'planner.beat.retained' : 'planner.beat.omitted_duration',
      kind: include ? 'retained' : 'omitted',
      node_ids: [],
      context: { role: rule.role, activation_duration_ms: rule.activation_duration_ms },
    });
    return include;
  });

  const ctaRequired = requiredByInput.has('cta') || input.cta.mode === 'explicit';
  const ctaAllowed = archetype.validation_rules.allow_cta && !forbiddenByInput.has('cta');
  const ctaByDuration = input.cta.mode === 'soft' && input.target_duration_ms >= 10_000;
  if ((ctaRequired || ctaByDuration) && ctaAllowed) {
    retained.push({
      role: 'cta',
      required: ctaRequired,
      activation_duration_ms: 0,
      importance: ctaRequired ? 80 : 55,
      duration_weight: 10,
      information_density: 'low',
      splittable: false,
    });
  } else if (input.cta.mode !== 'none') {
    decisions.push({
      code: 'planner.cta.omitted',
      kind: 'omitted',
      node_ids: [],
      context: { mode: input.cta.mode, duration_ms: input.target_duration_ms, allowed: ctaAllowed },
    });
    if (ctaRequired) {
      diagnostics.push({
        code: 'planner.cta_incompatible',
        severity: 'error',
        path: '$.cta',
        message: 'Le CTA explicite ne peut pas être intégré à cette structure.',
        suggested_action: 'Autoriser le rôle CTA, augmenter la durée ou choisir none/soft.',
      });
    }
  }
  return retained;
}

function factualRequirement(
  input: PlannerInput,
  slotRole: ContentSlotRole,
): ContentSlot['factual_requirement'] {
  if (!['factual_claim', 'explanation', 'statistic'].includes(slotRole)) return 'none';
  if (input.factual_mode === 'factual') return 'source_required';
  if (input.factual_mode === 'mixed') return 'source_recommended';
  return 'none';
}

function channelsFor(role: ContentSlotRole): readonly ('spoken' | 'on_screen')[] {
  if (role === 'hook_text' || role === 'reveal' || role === 'cta' || role === 'statistic') return ['spoken', 'on_screen'];
  if (role === 'label') return ['on_screen'];
  return ['spoken'];
}

function maxCharacters(role: ContentSlotRole): number {
  if (role === 'hook_text') return 160;
  if (role === 'cta' || role === 'label' || role === 'statistic') return 120;
  if (role === 'reveal') return 240;
  return 1_200;
}

export function planStory(
  input: PlannerInput,
  archetype: NarrativeArchetype,
  limits: PlannerLimits,
): StoryPlanResult {
  const diagnostics: CreativeDiagnostic[] = [];
  const decisions: PlanningDecision[] = [];
  const rules = selectedRules(input, archetype, decisions, diagnostics);
  const provisional = rules.map((rule, index) => ({
    id: deriveCreativeId('beat', {
      input_id: input.input_id,
      archetype: archetype.id,
      archetype_version: archetype.version,
      role: rule.role,
      index,
    }),
    rule,
  }));
  const beats: StoryBeat[] = provisional.map(({ id, rule }, index) => ({
    id,
    role: rule.role,
    semantic_purpose: `narrative_role:${rule.role}`,
    importance: rule.importance,
    duration_weight: rule.duration_weight,
    information_density: rule.information_density,
    relationship: {
      previous_beat_id: provisional[index - 1]?.id ?? null,
      next_beat_id: provisional[index + 1]?.id ?? null,
    },
    required: rule.required,
    splittable: rule.splittable,
  }));
  if (beats.length > limits.max_beats) {
    diagnostics.push({
      code: 'planner.limit.beats_exceeded',
      severity: 'error',
      path: '$.constraints',
      message: 'Le nombre de beats dépasse la limite du planner.',
      context: { actual: beats.length, limit: limits.max_beats },
      suggested_action: 'Réduire les rôles requis ou choisir un archétype plus compact.',
    });
  }

  const usedProvided = new Set<string>();
  const contentSlots = beats.map((beat): ContentSlot => {
    const role = contentRole(beat.role);
    const provided = input.provided_content.find((content) => content.role === role && !usedProvided.has(content.id));
    const ctaText = beat.role === 'cta' ? input.cta.text : undefined;
    const slotId = deriveCreativeId('slot', { input_id: input.input_id, beat_id: beat.id, role });
    const narrationForbidden = input.constraints.some((constraint) => constraint.kind === 'forbid_narration');
    const plannedChannels = narrationForbidden ? (['on_screen'] as const) : channelsFor(role);
    const selectedChannels = provided?.channels ?? (ctaText === undefined ? plannedChannels : (['spoken', 'on_screen'] as const));
    const common: Omit<Extract<ContentSlot, { status: 'unresolved' }>, 'status'> = {
      id: slotId,
      beat_id: beat.id,
      role,
      required: beat.required || beat.role !== 'cta' || input.cta.mode === 'explicit',
      language: input.language,
      semantic_context: `role:${beat.role};topic:${input.topic}`,
      constraints: { max_characters: maxCharacters(role), channels: [...selectedChannels] },
      factual_requirement: factualRequirement(input, role),
    };
    if (provided) {
      usedProvided.add(provided.id);
      if ([...provided.text].length > maxCharacters(role)) {
        diagnostics.push({
          code: 'planner.content_too_long',
          severity: 'error',
          path: '$.provided_content',
          node_id: provided.id,
          message: `Le contenu fourni dépasse la limite du slot « ${role} ».`,
          context: { actual: [...provided.text].length, limit: maxCharacters(role) },
          suggested_action: 'Réduire ce contenu ou modifier explicitement la politique de slot.',
        });
      }
      decisions.push({
        code: 'planner.content.resolved',
        kind: 'resolved',
        node_ids: [slotId, provided.id],
        context: { role, provided_content_id: provided.id },
      });
      return {
        ...common,
        status: 'resolved',
        resolved_content_id: provided.id,
        text: provided.text,
        ...(provided.source_slot === undefined ? {} : { source_slot: provided.source_slot }),
      };
    }
    if (ctaText !== undefined) {
      const resolvedContentId = deriveCreativeId('provided', { input_id: input.input_id, role: 'cta', text: ctaText });
      decisions.push({
        code: 'planner.content.resolved',
        kind: 'resolved',
        node_ids: [slotId, resolvedContentId],
        context: { role, source: 'cta.text' },
      });
      return {
        ...common,
        status: 'resolved',
        resolved_content_id: resolvedContentId,
        text: ctaText,
      };
    }
    decisions.push({
      code: 'planner.content.unresolved',
      kind: 'unresolved',
      node_ids: [slotId],
      context: { role, required: common.required },
    });
    return { ...common, status: 'unresolved' };
  });

  input.provided_content.forEach((content, index) => {
    if (usedProvided.has(content.id)) return;
    diagnostics.push({
      code: 'planner.provided_content_unused',
      severity: 'info',
      path: `$.provided_content[${index}]`,
      node_id: content.id,
      message: `Le contenu fourni pour « ${content.role} » n’a été affecté à aucun beat.`,
      context: { role: content.role },
      suggested_action: 'Vérifier l’archétype ou retirer ce contenu.',
    });
  });
  const requiredUnresolved = contentSlots.filter((slot) => slot.required && slot.status === 'unresolved');
  requiredUnresolved.forEach((slot) =>
    diagnostics.push({
      code: 'planner.content_slot_unresolved',
      severity: 'warning',
      path: '$.provided_content',
      node_id: slot.id,
      message: `Le slot requis « ${slot.role} » reste non résolu.`,
      context: { role: slot.role, beat_id: slot.beat_id },
      suggested_action: 'Fournir ou générer ce contenu dans une phase ultérieure.',
    }),
  );
  if (contentSlots.length > limits.max_content_slots) {
    diagnostics.push({
      code: 'planner.limit.content_slots_exceeded',
      severity: 'error',
      path: '$',
      message: 'Le nombre de content slots dépasse la limite du planner.',
      context: { actual: contentSlots.length, limit: limits.max_content_slots },
      suggested_action: 'Réduire la structure narrative.',
    });
  }
  const storyArc = beats.map((beat): StoryArcPoint => {
    const phase = arcPhase(beat.role);
    return { beat_id: beat.id, phase, direction: arcDirection(phase) };
  });
  return { beats, story_arc: storyArc, content_slots: contentSlots, decisions, diagnostics };
}
