import type { z } from 'zod';

import {
  DEFAULT_ARCHETYPE_REGISTRY,
  DEFAULT_PLANNER_LIMITS,
  hashCreativeDocument,
  sortCreativeDiagnostics,
  summarizeDiagnostics,
  type AssetIntent,
  type ContentSlot,
  type CreativeDiagnostic,
  type PlanningReport,
  type PlannerOptions,
  type PlannerInput,
  type StoryPlanningResult,
} from '@motion-engine/creative-core';
import {
  deriveCreativeReadingBudgets,
  inspectCreativeReadingFeasibility,
  inspectCreativeSubtitleFeasibility,
  type CreativeReadingBudget,
  type CreativeReadingPolicy,
  type CreativeResolution,
  type CreativeSubtitleFitBudget,
} from '@motion-engine/creative-compiler';

import {
  CREATIVE_GATEWAY_VERSION,
  CreativeGatewayReportSchema,
  CreativeGatewaySnapshotSchema,
  GatewayAssetBindingSchema,
  GatewaySourceVerificationSchema,
  PlanningGenerationOutputSchema,
  ProviderMetadataSchema,
  ProviderUsageSchema,
  ResolutionGenerationOutputSchema,
  type CreativeGatewayReport,
  type CreativeGatewaySnapshot,
  type CreativeGenerationRequest,
  type GatewayAssetBinding,
  type GatewayFailureKind,
  type GatewayMetrics,
  type GatewaySourceVerification,
  type GatewayState,
  type GatewayTransition,
  type PlanningGenerationOutput,
  type PromptContract,
  type ProviderMetadata,
  type ProviderUsage,
  type ResolutionGenerationOutput,
} from './contracts.ts';
import type { GatewayLimits } from './limits.ts';
import { DEFAULT_GATEWAY_LIMITS } from './limits.ts';
import { planAcceptedOutput, planningOutputToPlannerInput, resolutionOutputToCreativeResolution } from './mapping.ts';
import { createProviderPlanningContext } from './planning-context.ts';
import type {
  CreativeProvider,
  ProviderContentSlotContext,
  ProviderInvocation,
  ProviderPlanningContext,
  ProviderResponse,
  ProviderResolutionContext,
} from './provider.ts';
import { GatewayProviderError } from './provider.ts';
import { validateCreativeGenerationRequest } from './request.ts';
import { inspectGatewayInput, redactSensitiveText } from './security.ts';
import { createGatewaySnapshot, verifyGatewaySnapshot } from './snapshot.ts';

const EMPTY_USAGE: ProviderUsage = {
  input_units: null,
  output_units: null,
  cached_units: null,
  request_count: 0,
  provider_reported_cost: null,
};

export interface AssetBindingContext {
  readonly request: CreativeGenerationRequest;
  readonly asset_intents: readonly AssetIntent[];
  readonly descriptions: ResolutionGenerationOutput['asset_descriptions'];
}

export interface CreativeGatewayOptions {
  readonly provider: CreativeProvider;
  readonly planner?: PlannerOptions;
  readonly max_repair_attempts?: number;
  readonly timeout_ms?: number;
  readonly signal?: AbortSignal;
  readonly limits?: GatewayLimits;
  readonly source_verifications?: readonly GatewaySourceVerification[];
  /** Politique P2.3/P1 explicite utilisée pour prévenir les lectures impossibles avant compilation finale. */
  readonly reading_policy?: CreativeReadingPolicy;
  readonly resolve_asset_bindings?: (
    context: AssetBindingContext,
  ) => readonly GatewayAssetBinding[] | Promise<readonly GatewayAssetBinding[]>;
}

export interface CreativeGatewayReplayOptions {
  readonly planner?: PlannerOptions;
  readonly reading_policy?: CreativeReadingPolicy;
}

export interface CreativeGatewayResult {
  readonly ok: boolean;
  readonly state: GatewayState;
  readonly planner_input: PlannerInput | null;
  readonly planning: StoryPlanningResult | null;
  readonly creative_resolution: CreativeResolution | null;
  readonly snapshot: CreativeGatewaySnapshot | null;
  readonly report: CreativeGatewayReport;
}

interface RunContext {
  state: GatewayState;
  transitions: GatewayTransition[];
  diagnostics: CreativeDiagnostic[];
  failure: GatewayFailureKind | null;
  planningAttempts: number;
  resolutionAttempts: number;
  usage: ProviderUsage;
  providerMs: number;
  validationMs: number;
  planningMs: number;
  resolutionMs: number;
  started: bigint;
}

function elapsedMs(started: bigint): number {
  return Number(process.hrtime.bigint() - started) / 1_000_000;
}

function transition(context: RunContext, to: GatewayState, reason: string): void {
  context.transitions.push({ from: context.state, to, reason });
  context.state = to;
}

function diagnostic(
  code: string,
  severity: CreativeDiagnostic['severity'],
  path: string,
  message: string,
  suggestedAction?: string,
  diagnosticContext?: CreativeDiagnostic['context'],
): CreativeDiagnostic {
  return {
    code, severity, path, message: redactSensitiveText(message),
    ...(suggestedAction === undefined ? {} : { suggested_action: suggestedAction }),
    ...(diagnosticContext === undefined ? {} : { context: diagnosticContext }),
  };
}

function zodDiagnostics(error: z.ZodError, stage: 'planning' | 'resolution' | 'snapshot'): CreativeDiagnostic[] {
  return error.issues.map((issue) => ({
    code: issue.code === 'unrecognized_keys' ? 'gateway.output.unknown_field' : 'gateway.output.schema_invalid',
    severity: 'error' as const,
    path: issue.path.reduce<string>((path, part) => typeof part === 'number' ? `${path}[${part}]` : `${path}.${String(part)}`, '$'),
    message: redactSensitiveText(issue.message),
    context: { stage, zod_code: issue.code },
    suggested_action: 'Produire uniquement le schéma structuré autorisé pour cette étape.',
  }));
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) return null;
  return (left ?? 0) + (right ?? 0);
}

function mergeUsage(current: ProviderUsage, response?: ProviderUsage): ProviderUsage {
  if (!response) return { ...current, request_count: current.request_count + 1 };
  return ProviderUsageSchema.parse({
    input_units: addNullable(current.input_units, response.input_units),
    output_units: addNullable(current.output_units, response.output_units),
    cached_units: addNullable(current.cached_units, response.cached_units),
    request_count: current.request_count + Math.max(1, response.request_count),
    provider_reported_cost:
      current.provider_reported_cost && response.provider_reported_cost
        && current.provider_reported_cost.currency === response.provider_reported_cost.currency
        ? {
            amount: current.provider_reported_cost.amount + response.provider_reported_cost.amount,
            currency: current.provider_reported_cost.currency,
          }
        : response.provider_reported_cost ?? current.provider_reported_cost,
  });
}

function prompt(
  request: CreativeGenerationRequest,
  stage: 'planning' | 'resolution',
  planningContext?: ProviderInvocation['planning_context'],
): PromptContract {
  return {
    schema: 'creative-prompt-contract',
    schema_version: '0.1.0',
    stage,
    system_intent: stage === 'planning' ? 'structure_creative_request' : 'resolve_creative_slots',
    output_schema: { name: stage === 'planning' ? 'PlanningGenerationOutput' : 'ResolutionGenerationOutput', version: '0.1.0' },
    user_content: request.idea,
    constraints: [
      'structured_output_only',
      'no_motion_spec',
      'no_code_execution',
      'no_filesystem_path',
      'no_unverified_source_as_evidence',
      ...(stage === 'planning' && planningContext
        ? [`allowed_narrative_archetypes:${planningContext.allowed_archetype_ids.join(',')}`]
        : []),
    ],
  };
}

async function invokeProvider(
  provider: CreativeProvider,
  invocation: Omit<ProviderInvocation, 'signal'>,
  timeoutMs: number,
  externalSignal: AbortSignal | undefined,
): Promise<ProviderResponse> {
  if (externalSignal?.aborted) throw new GatewayProviderError('cancelled', 'Génération annulée avant l’appel provider.');
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let cancelHandler: (() => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new GatewayProviderError('provider_timeout', 'Le provider a dépassé le timeout configuré.'));
      controller.abort();
    }, timeoutMs);
  });
  const cancellation = new Promise<never>((_resolve, reject) => {
    if (!externalSignal) return;
    cancelHandler = () => {
      controller.abort();
      reject(new GatewayProviderError('cancelled', 'Génération annulée.'));
    };
    externalSignal.addEventListener('abort', cancelHandler, { once: true });
  });
  try {
    return await Promise.race([
      provider.generate({ ...invocation, signal: controller.signal }),
      timeout,
      cancellation,
    ]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    if (externalSignal && cancelHandler) externalSignal.removeEventListener('abort', cancelHandler);
  }
}

function decodeOutput(raw: unknown): { value: unknown; diagnostics: CreativeDiagnostic[] } {
  if (typeof raw !== 'string') return { value: raw, diagnostics: [] };
  try {
    return { value: JSON.parse(raw) as unknown, diagnostics: [] };
  } catch {
    return {
      value: null,
      diagnostics: [diagnostic(
        'gateway.provider.malformed_response', 'error', '$',
        'La réponse provider n’est pas un JSON valide.',
        'Demander une réparation structurée bornée.',
      )],
    };
  }
}

function planningSemantics(
  request: CreativeGenerationRequest,
  output: PlanningGenerationOutput,
  provider: ProviderMetadata,
  plannerOptions: PlannerOptions,
  planningContext: ProviderPlanningContext,
): CreativeDiagnostic[] {
  const diagnostics: CreativeDiagnostic[] = [];
  const exact: Array<[keyof PlanningGenerationOutput, unknown]> = [
    ['request_id', request.request_id],
    ['language', request.language],
    ['locale', request.locale],
    ['target_duration_ms', request.target_duration_ms],
    ['target_format', request.target_format],
  ];
  for (const [key, expected] of exact) if (output[key] !== expected) diagnostics.push(diagnostic(
    'gateway.output.request_constraint_changed', 'error', `$.${key}`,
    `La sortie planning a modifié la contrainte immuable « ${key} ».`,
    'Conserver exactement les contraintes de langue, format, durée et identité.',
  ));
  if (output.provenance === 'fixture' && !provider.deterministic_test) diagnostics.push(diagnostic(
    'gateway.output.fixture_provenance_forbidden', 'error', '$.provenance',
    'Un provider non-test ne peut pas déclarer sa sortie comme fixture.',
  ));
  const registry = plannerOptions.registry ?? DEFAULT_ARCHETYPE_REGISTRY;
  const availableArchetypes = registry.definitions().map((definition) => definition.id);
  if (output.narrative_archetype !== undefined && registry.get(output.narrative_archetype) === undefined) {
    diagnostics.push(diagnostic(
      'gateway.output.archetype_unavailable',
      'error',
      '$.narrative_archetype',
      `L’archétype « ${output.narrative_archetype} » n’existe pas dans le registre actif.`,
      `Choisir un archétype parmi ${availableArchetypes.join(', ')} ou omettre narrative_archetype.`,
    ));
  }
  if (!diagnostics.some((entry) => entry.severity === 'error')) {
    const plannerInput = planningOutputToPlannerInput(request, output);
    const selected = registry.select(plannerInput);
    const active = selected
      ? planningContext.archetypes.find((entry) => entry.archetype_id === selected.definition.id)
      : undefined;
    if (selected && active) {
      const constraints = [
        ...request.constraints.map((constraint, index) => ({
          constraint,
          path: `$.request.constraints[${index}]`,
          source: 'request' as const,
        })),
        ...output.suggested_constraints.map((constraint, index) => ({
          constraint,
          path: `$.suggested_constraints[${index}]`,
          source: 'provider' as const,
        })),
      ];
      const roleContext = {
        selected_archetype: active.archetype_id,
        supported_roles: active.supported_roles.join(','),
        required_roles: active.required_roles.join(','),
        optional_roles: active.optional_roles.join(','),
        ordering_constraints: active.ordering_constraints
          .map((constraint) => `${constraint.before}>${constraint.after}`)
          .join(','),
      };
      constraints.forEach(({ constraint, path, source }) => {
        if ((constraint.kind === 'require_role' || constraint.kind === 'forbid_role')
          && !active.supported_roles.includes(constraint.role)) {
          diagnostics.push(diagnostic(
            'gateway.output.archetype_role_unsupported',
            'error',
            path,
            `L’archétype ${active.archetype_id} ne supporte pas le rôle « ${constraint.role} » ciblé par ${constraint.kind}.`,
            'Choisir un rôle supporté ou un archétype compatible sans mutation silencieuse.',
            {
              ...roleContext,
              incompatible_role: constraint.role,
              constraint_kind: constraint.kind,
              constraint_source: source,
              permitted_role_constraints: active.supported_roles.join(','),
            },
          ));
        }
        if (constraint.kind === 'forbid_role' && active.required_roles.includes(constraint.role)) {
          diagnostics.push(diagnostic(
            'gateway.output.archetype_required_role_forbidden',
            'error',
            path,
            `L’archétype ${active.archetype_id} exige le rôle « ${constraint.role} », qui ne peut pas être interdit.`,
            'Retirer cette interdiction ou choisir un archétype compatible.',
            {
              ...roleContext,
              incompatible_role: constraint.role,
              constraint_kind: constraint.kind,
              constraint_source: source,
              permitted_forbid_roles: active.supported_roles
                .filter((role) => !active.required_roles.includes(role))
                .join(','),
            },
          ));
        }
      });
      const limits = plannerOptions.limits ?? DEFAULT_PLANNER_LIMITS;
      if (constraints.length > limits.max_constraints) diagnostics.push(diagnostic(
        'gateway.output.constraints_exceeded',
        'error',
        '$.suggested_constraints',
        'Les contraintes cumulées dépassent la limite du Planner actif.',
        'Réduire les contraintes suggérées sans supprimer les contraintes utilisateur.',
        {
          actual: constraints.length,
          maximum_total_constraints: limits.max_constraints,
          maximum_suggested_constraints: planningContext.constraint_policy.maximum_suggested_constraints,
        },
      ));
      const minimumScenes = constraints
        .filter(({ constraint }) => constraint.kind === 'min_scenes')
        .map(({ constraint }) => constraint.kind === 'min_scenes' ? constraint.value : 0);
      if (minimumScenes.length > 0
        && Math.max(...minimumScenes) > active.duration_constraints.maximum_scene_count_for_request) {
        diagnostics.push(diagnostic(
          'gateway.output.minimum_scenes_impossible',
          'error',
          '$.suggested_constraints',
          'Le nombre minimal de scènes demandé dépasse la capacité temporelle pré-vérifiable de l’archétype.',
          'Réduire min_scenes ou choisir un archétype compatible avec la durée imposée.',
          {
            selected_archetype: active.archetype_id,
            requested_minimum_scenes: Math.max(...minimumScenes),
            maximum_scene_count_for_request: active.duration_constraints.maximum_scene_count_for_request,
            target_duration_ms: request.target_duration_ms,
          },
        ));
      }
      if (output.cta.mode === 'explicit' && !active.cta_allowed) diagnostics.push(diagnostic(
        'gateway.output.archetype_cta_unsupported',
        'error',
        '$.cta',
        `L’archétype ${active.archetype_id} n’autorise pas de CTA explicite.`,
        'Choisir un archétype autorisant le CTA ou conserver cta.mode=none.',
        { selected_archetype: active.archetype_id, cta_allowed: active.cta_allowed },
      ));
    }
  }
  if (!diagnostics.some((entry) => entry.severity === 'error')) {
    try {
      const planned = planAcceptedOutput(request, output, plannerOptions);
      if (!planned.planning.ok) {
        diagnostics.push(...planned.planning.input_validation.diagnostics);
        if (planned.planning.report) diagnostics.push(...planned.planning.report.diagnostics);
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        'gateway.planner_input_invalid',
        'error',
        '$.planning_output',
        error instanceof Error ? error.message : 'PlannerInput invalide.',
        'Corriger la sortie planning afin qu’elle respecte intégralement le contrat P2.2.',
      ));
    }
  }
  return diagnostics;
}

function resolutionSemantics(
  request: CreativeGenerationRequest,
  output: ResolutionGenerationOutput,
  provider: ProviderMetadata,
  planId: string,
  slots: readonly ContentSlot[],
  assets: readonly AssetIntent[],
  resolutionContext: ProviderResolutionContext,
): CreativeDiagnostic[] {
  const diagnostics: CreativeDiagnostic[] = [];
  if (output.request_id !== request.request_id) diagnostics.push(diagnostic(
    'gateway.output.request_mismatch', 'error', '$.request_id', 'La résolution ne cible pas la requête courante.',
  ));
  if (output.plan_id !== planId) diagnostics.push(diagnostic(
    'gateway.output.plan_mismatch', 'error', '$.plan_id', 'La résolution ne cible pas le CreativePlan courant.',
  ));
  if (output.provenance === 'fixture' && !provider.deterministic_test) diagnostics.push(diagnostic(
    'gateway.output.fixture_provenance_forbidden', 'error', '$.provenance',
    'Un provider non-test ne peut pas déclarer sa sortie comme fixture.',
  ));
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const targetMap = new Map(resolutionContext.content_slots.map((slot) => [slot.slot_id, slot]));
  const assetMap = new Map(assets.map((asset) => [asset.slot, asset]));
  const seenContent = new Set<string>();
  const contentBySlot = new Map<string, ResolutionGenerationOutput['content'][number][]>();
  output.content.forEach((entry, index) => {
    const key = `${entry.slot_id}:${entry.scene_id ?? '*'}`;
    if (seenContent.has(key)) diagnostics.push(diagnostic(
      'gateway.output.duplicate_slot_resolution', 'error', `$.content[${index}]`, 'Un même slot est résolu plusieurs fois pour la même scène.',
    ));
    seenContent.add(key);
    const slot = slotMap.get(entry.slot_id);
    const target = targetMap.get(entry.slot_id);
    if (!slot) {
      diagnostics.push(diagnostic('gateway.output.unknown_content_slot', 'error', `$.content[${index}].slot_id`, 'Le slot de contenu n’existe pas dans le PlanningReport.'));
      return;
    }
    if (!target) {
      diagnostics.push(diagnostic(
        'gateway.output.content_slot_topology_missing', 'error', `$.content[${index}].slot_id`,
        'Le ContentSlot ne possède aucune topologie de scène canonique dans le contexte de résolution.',
        'Reconstruire le contexte Stage B depuis le PlanningReport P2.2 courant.',
        { slot_id: entry.slot_id },
      ));
      return;
    }
    const entries = contentBySlot.get(entry.slot_id) ?? [];
    entries.push(entry);
    contentBySlot.set(entry.slot_id, entries);
    if (entry.scene_id === undefined) {
      if (!target.generic_resolution_allowed) diagnostics.push(diagnostic(
        'gateway.output.generic_resolution_forbidden', 'error', `$.content[${index}].scene_id`,
        'Une résolution générique n’est pas autorisée pour ce ContentSlot.',
        'Fournir une résolution spécifique pour chaque scène autorisée.',
        { slot_id: entry.slot_id, allowed_scene_ids: target.allowed_scene_ids.join(',') },
      ));
    } else if (!target.allowed_scene_ids.includes(entry.scene_id)) {
      diagnostics.push(diagnostic(
        'gateway.output.scene_not_allowed_for_slot', 'error', `$.content[${index}].scene_id`,
        'La scène reçue n’appartient pas à la topologie canonique de ce ContentSlot.',
        target.generic_resolution_allowed
          ? 'Choisir une scène autorisée ou utiliser scene_id=null pour toutes les scènes autorisées.'
          : 'Choisir une scène parmi les scènes autorisées.',
        {
          slot_id: entry.slot_id,
          received_scene_id: entry.scene_id,
          allowed_scene_ids: target.allowed_scene_ids.join(','),
        },
      ));
    }
    if ([...entry.text].length > slot.constraints.max_characters) diagnostics.push(diagnostic(
      'gateway.output.content_too_long', 'error', `$.content[${index}].text`, 'Le contenu dépasse la limite déclarée par le ContentSlot.',
    ));
    const expectedSource = slot.factual_requirement === 'source_required';
    if (entry.source_required !== expectedSource) diagnostics.push(diagnostic(
      'gateway.output.factual_requirement_changed', 'error', `$.content[${index}].source_required`,
      'La sortie provider a modifié l’exigence factuelle du ContentSlot.',
    ));
    if (entry.provenance === 'fixture' && !provider.deterministic_test) diagnostics.push(diagnostic(
      'gateway.output.fixture_provenance_forbidden', 'error', `$.content[${index}].provenance`,
      'Un provider non-test ne peut pas déclarer un contenu comme fixture.',
    ));
  });
  resolutionContext.content_slots.forEach((target) => {
    if (target.allowed_scene_ids.length === 0) diagnostics.push(diagnostic(
      'gateway.output.content_slot_without_scene', 'error', '$.content',
      'Un ContentSlot ne cible aucune scène dans le PlanningReport courant.',
      'Corriger la topologie beat/scène avant Stage B.',
      { slot_id: target.slot_id },
    ));
    const entries = contentBySlot.get(target.slot_id) ?? [];
    const genericEntries = entries.filter((entry) => entry.scene_id === undefined);
    const specificEntries = entries.filter((entry) => entry.scene_id !== undefined);
    if (genericEntries.length > 0 && specificEntries.length > 0) diagnostics.push(diagnostic(
      'gateway.output.ambiguous_slot_resolution', 'error', '$.content',
      'Une résolution générique et une résolution spécifique ciblent simultanément le même ContentSlot.',
      'Choisir soit scene_id=null, soit une résolution spécifique pour chaque scène autorisée.',
      { slot_id: target.slot_id, allowed_scene_ids: target.allowed_scene_ids.join(',') },
    ));
    if (!target.required || target.status === 'resolved' || genericEntries.length > 0) return;
    const resolvedSceneIds = new Set(specificEntries.map((entry) => entry.scene_id));
    const missingSceneIds = target.allowed_scene_ids.filter((sceneId) => !resolvedSceneIds.has(sceneId));
    if (missingSceneIds.length > 0) diagnostics.push(diagnostic(
      'gateway.output.required_scene_resolution_missing', 'error', '$.content',
      'Un ContentSlot requis ne couvre pas toutes ses scènes canoniques.',
      target.generic_resolution_allowed
        ? 'Résoudre chaque scène manquante ou fournir une résolution générique avec scene_id=null.'
        : 'Résoudre chaque scène manquante explicitement.',
      {
        slot_id: target.slot_id,
        missing_scene_ids: missingSceneIds.join(','),
        allowed_scene_ids: target.allowed_scene_ids.join(','),
      },
    ));
  });
  const seenAssets = new Set<string>();
  output.asset_descriptions.forEach((entry, index) => {
    if (seenAssets.has(entry.asset_slot)) diagnostics.push(diagnostic(
      'gateway.output.duplicate_asset_description', 'error', `$.asset_descriptions[${index}]`, 'Un asset slot possède plusieurs descriptions.',
    ));
    seenAssets.add(entry.asset_slot);
    const asset = assetMap.get(entry.asset_slot);
    if (!asset || asset.id !== entry.asset_intent_id) diagnostics.push(diagnostic(
      'gateway.output.unknown_asset_intent', 'error', `$.asset_descriptions[${index}]`, 'La description ne correspond à aucun AssetIntent du plan.',
    ));
  });
  return diagnostics;
}

function buildProviderResolutionContext(
  planId: string,
  slots: readonly ContentSlot[],
  report: PlanningReport,
  assets: readonly AssetIntent[],
  readingBudgets: readonly CreativeReadingBudget[],
  subtitleBudgets: readonly CreativeSubtitleFitBudget[],
): ProviderResolutionContext {
  const scenesByBeat = new Map<string, string[]>();
  report.scenes.forEach((scene) => scene.beat_ids.forEach((beatId) => {
    const sceneIds = scenesByBeat.get(beatId) ?? [];
    if (!sceneIds.includes(scene.scene_id)) sceneIds.push(scene.scene_id);
    scenesByBeat.set(beatId, sceneIds);
  }));
  const contentSlots: ProviderContentSlotContext[] = slots.map((slot) => {
    const allowedSceneIds = [...(scenesByBeat.get(slot.beat_id) ?? [])];
    const sceneTimeBudgets = slot.constraints.channels.includes('on_screen')
      ? readingBudgets.filter((budget) => allowedSceneIds.includes(budget.scene_id)).map((budget) => ({
          scene_id: budget.scene_id,
          available_ms: budget.available_ms,
          maximum_total_words: budget.maximum_total_words,
          maximum_recommended_characters_per_entry: Math.min(
            slot.constraints.max_characters,
            budget.maximum_recommended_characters_per_entry,
          ),
        }))
      : [];
    const genericTimeBudget = sceneTimeBudgets.length === 0
      ? null
      : [...sceneTimeBudgets].sort((left, right) =>
          left.maximum_total_words - right.maximum_total_words
          || left.available_ms - right.available_ms
          || left.scene_id.localeCompare(right.scene_id))[0]!;
    const sceneSubtitleBudgets = slot.constraints.channels.includes('spoken')
      ? subtitleBudgets.filter((budget) => allowedSceneIds.includes(budget.scene_id)).map((budget) => ({
          scene_id: budget.scene_id,
          preferred_size: budget.preferred_size,
          minimum_size: budget.minimum_size,
          maximum_lines: budget.max_lines,
          available_width: budget.available_width,
          available_height: budget.available_height,
        }))
      : [];
    const genericSubtitleBudget = sceneSubtitleBudgets.length === 0
      ? null
      : [...sceneSubtitleBudgets].sort((left, right) =>
          left.maximum_lines - right.maximum_lines
          || left.available_width * left.available_height - right.available_width * right.available_height
          || right.minimum_size - left.minimum_size
          || left.scene_id.localeCompare(right.scene_id))[0]!;
    return {
      slot_id: slot.id,
      beat_id: slot.beat_id,
      role: slot.role,
      semantic_context: slot.semantic_context,
      constraints: slot.constraints,
      required: slot.required,
      language: slot.language,
      factual_requirement: slot.factual_requirement,
      status: slot.status,
      allowed_scene_ids: allowedSceneIds,
      reading_budget_applies: slot.constraints.channels.includes('on_screen'),
      scene_time_budgets: sceneTimeBudgets,
      generic_time_budget: genericTimeBudget,
      subtitle_fit_applies: sceneSubtitleBudgets.length > 0,
      scene_subtitle_budgets: sceneSubtitleBudgets,
      generic_subtitle_budget: genericSubtitleBudget,
      generic_resolution_allowed: true,
    };
  });
  return { plan_id: planId, content_slots: contentSlots, asset_intents: assets };
}

function readingSemantics(
  output: ResolutionGenerationOutput,
  plan: NonNullable<StoryPlanningResult['creative_plan']>,
  report: PlanningReport,
  slots: readonly ContentSlot[],
  resolutionContext: ProviderResolutionContext,
  policy: CreativeReadingPolicy,
): CreativeDiagnostic[] {
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  const targetMap = new Map(resolutionContext.content_slots.map((slot) => [slot.slot_id, slot]));
  const inspection = inspectCreativeReadingFeasibility({
    plan,
    planning_report: report,
    content_slots: slots,
    content: output.content.map((entry) => ({
      slot_id: entry.slot_id,
      ...(entry.scene_id === undefined ? {} : { scene_id: entry.scene_id }),
      text: entry.text,
      ...(slotMap.get(entry.slot_id)?.factual_requirement === 'source_required'
        ? { source_slot: 'reading_budget_source' }
        : {}),
    })),
    policy,
  });
  if (inspection.diagnostics.length > 0) return inspection.diagnostics.map((entry) => ({
    ...entry,
    code: `gateway.reading_preflight.${entry.code}`,
    suggested_action: entry.code === 'creative_compile.text_runs_exceeded'
      ? 'Raccourcir le contenu tout en préservant son rôle sémantique.'
      : entry.suggested_action,
  }));
  const diagnostics: CreativeDiagnostic[] = [];
  inspection.issues.forEach((issue) => {
    const contributors = output.content.flatMap((entry, index) => {
      const target = targetMap.get(entry.slot_id);
      if (!target?.reading_budget_applies) return [];
      const applies = entry.scene_id === issue.scene_id
        || (entry.scene_id === undefined && target.allowed_scene_ids.includes(issue.scene_id));
      return applies ? [{ entry, index }] : [];
    });
    contributors.forEach(({ entry, index }) => diagnostics.push(diagnostic(
      'gateway.output.content_reading_budget_exceeded',
      'error',
      `$.content[${index}].text`,
      'Le contenu cumulé de la scène dépasse sa fenêtre de lecture certifiée.',
      'Raccourcir le contenu tout en préservant son rôle sémantique ; ne modifier ni la scène ni sa durée.',
      {
        slot_id: entry.slot_id,
        scene_id: issue.scene_id,
        available_ms: issue.available_ms,
        required_ms: issue.required_ms,
        maximum_total_words: issue.maximum_total_words,
      },
    )));
  });
  const subtitleInspection = inspectCreativeSubtitleFeasibility({
    plan,
    planning_report: report,
    content_slots: slots,
    content: output.content.map((entry) => ({
      slot_id: entry.slot_id,
      ...(entry.scene_id === undefined ? {} : { scene_id: entry.scene_id }),
      text: entry.text,
      ...(slotMap.get(entry.slot_id)?.factual_requirement === 'source_required'
        ? { source_slot: 'reading_budget_source' }
        : {}),
    })),
    policy,
  });
  if (subtitleInspection.diagnostics.length > 0) diagnostics.push(...subtitleInspection.diagnostics.map((entry) => ({
    ...entry,
    code: `gateway.subtitle_preflight.${entry.code}`,
  })));
  subtitleInspection.issues.forEach((issue) => {
    const outputIndex = output.content.findIndex((entry) => entry.slot_id === issue.slot_id
      && (entry.scene_id === issue.scene_id || entry.scene_id === undefined));
    diagnostics.push(diagnostic(
      'gateway.output.subtitle_geometry_overflow',
      'error',
      outputIndex < 0 ? '$.content' : `$.content[${outputIndex}].text`,
      'Le segment parlé ne tient pas dans la zone de sous-titre P1 à la taille lisible autorisée.',
      'Raccourcir uniquement ce contenu tout en préservant son rôle sémantique ; ne modifier ni le design, ni la scène, ni la durée.',
      {
        slot_id: issue.slot_id,
        scene_id: issue.scene_id,
        segment_index: issue.segment_index,
        preferred_size: issue.analysis.preferred_size,
        minimum_size: issue.analysis.minimum_size,
        line_count: issue.analysis.line_count,
        maximum_lines: issue.analysis.max_lines,
        available_width: issue.analysis.available_width,
        available_height: issue.analysis.available_height,
        overflow_reason: issue.analysis.overflow_reason ?? 'unknown',
      },
    ));
  });
  return diagnostics;
}

function resolutionInvariantDiagnostics(
  resolution: CreativeResolution,
  targets: ProviderResolutionContext,
): CreativeDiagnostic[] {
  const diagnostics: CreativeDiagnostic[] = [];
  const expectedTargets = new Set(targets.content_slots.flatMap((slot) =>
    slot.allowed_scene_ids.map((sceneId) => `${slot.slot_id}:${sceneId}`)));
  resolution.content_slots.forEach((entry) => {
    const key = `${entry.slot_id}:${entry.scene_id}`;
    if (!expectedTargets.has(key)) diagnostics.push({
      code: 'gateway.resolution.unexpected_content_target', severity: 'error', path: '$.creative_resolution.content_slots',
      node_id: entry.slot_id, scene_id: entry.scene_id,
      message: 'CreativeResolution contient une cible slot/scène absente de la topologie canonique.',
      context: { slot_id: entry.slot_id, scene_id: entry.scene_id },
      suggested_action: 'Reconstruire CreativeResolution uniquement depuis le PlanningReport courant.',
    });
    if (entry.required && entry.status !== 'resolved') diagnostics.push({
      code: 'gateway.resolution.required_target_unresolved', severity: 'error', path: '$.creative_resolution.content_slots',
      node_id: entry.slot_id, scene_id: entry.scene_id,
      message: 'Une cible requise reste non résolue après la frontière Gateway Stage B.',
      context: { slot_id: entry.slot_id, scene_id: entry.scene_id },
      suggested_action: 'Réparer la sortie provider afin de résoudre cette cible avant P2.3.',
    });
  });
  return diagnostics;
}

interface StageResult<T> {
  readonly ok: boolean;
  readonly output: T | null;
  readonly failure: GatewayFailureKind | null;
}

async function runStage<T extends PlanningGenerationOutput | ResolutionGenerationOutput>(input: {
  readonly stage: 'planning' | 'resolution';
  readonly context: RunContext;
  readonly provider: CreativeProvider;
  readonly request: CreativeGenerationRequest;
  readonly maxRepairs: number;
  readonly timeoutMs: number;
  readonly externalSignal?: AbortSignal;
  readonly planningContext?: ProviderInvocation['planning_context'];
  readonly resolutionContext?: ProviderInvocation['resolution_context'];
  readonly semantic: (output: T) => CreativeDiagnostic[];
}): Promise<StageResult<T>> {
  const pendingState = input.stage === 'planning' ? 'PLANNING_PENDING' : 'RESOLUTION_PENDING';
  const validatingState = input.stage === 'planning' ? 'PLANNING_VALIDATING' : 'RESOLUTION_VALIDATING';
  transition(input.context, pendingState, `${input.stage}.provider_pending`);
  let repairDiagnostics: CreativeDiagnostic[] = [];
  for (let attempt = 0; attempt <= input.maxRepairs; attempt += 1) {
    if (attempt > 0) transition(input.context, pendingState, `${input.stage}.repair_requested`);
    if (input.stage === 'planning') input.context.planningAttempts += 1;
    else input.context.resolutionAttempts += 1;
    const providerStarted = process.hrtime.bigint();
    let response: ProviderResponse;
    try {
      response = await invokeProvider(input.provider, {
        stage: input.stage,
        mode: attempt === 0 ? 'generate' : 'repair',
        attempt,
        request: input.request,
        prompt: prompt(input.request, input.stage, input.planningContext),
        ...(input.planningContext === undefined ? {} : { planning_context: input.planningContext }),
        ...(input.resolutionContext === undefined ? {} : { resolution_context: input.resolutionContext }),
        repair_diagnostics: repairDiagnostics,
      }, input.timeoutMs, input.externalSignal);
      input.context.providerMs += elapsedMs(providerStarted);
      input.context.usage = mergeUsage(input.context.usage, response.usage);
    } catch (error) {
      input.context.providerMs += elapsedMs(providerStarted);
      input.context.usage = mergeUsage(input.context.usage);
      const failure = error instanceof GatewayProviderError ? error.kind : 'provider_unavailable';
      input.context.diagnostics.push(diagnostic(
        `gateway.${failure}`, 'error', '$.provider',
        error instanceof Error ? redactSensitiveText(error.message) : 'Le provider est indisponible.',
      ));
      return { ok: false, output: null, failure };
    }
    transition(input.context, validatingState, `${input.stage}.response_received`);
    const validationStarted = process.hrtime.bigint();
    const decoded = decodeOutput(response.output);
    const current = [...decoded.diagnostics];
    let output: T | null = null;
    if (decoded.value !== null) {
      current.push(...inspectGatewayInput(decoded.value, 'provider_response'));
      const parsed = input.stage === 'planning'
        ? PlanningGenerationOutputSchema.safeParse(decoded.value)
        : ResolutionGenerationOutputSchema.safeParse(decoded.value);
      if (!parsed.success) current.push(...zodDiagnostics(parsed.error, input.stage));
      else {
        output = parsed.data as T;
        current.push(...input.semantic(output));
      }
    }
    input.context.validationMs += elapsedMs(validationStarted);
    if (!current.some((entry) => entry.severity === 'error') && output) return { ok: true, output, failure: null };
    repairDiagnostics = sortCreativeDiagnostics(current);
    if (attempt === input.maxRepairs) {
      input.context.diagnostics.push(...repairDiagnostics, diagnostic(
        'gateway.repair_exhausted', 'error', '$.provider',
        `La réparation ${input.stage} a épuisé ${input.maxRepairs} tentative(s) autorisée(s).`,
      ));
      return { ok: false, output: null, failure: 'repair_exhausted' };
    }
  }
  return { ok: false, output: null, failure: 'repair_exhausted' };
}

function validateBindings(
  bindingsInput: readonly GatewayAssetBinding[],
  verificationsInput: readonly GatewaySourceVerification[],
  assets: readonly AssetIntent[],
  slots: readonly ContentSlot[],
  resolution: ResolutionGenerationOutput,
): { bindings: GatewayAssetBinding[]; verifications: GatewaySourceVerification[]; diagnostics: CreativeDiagnostic[] } {
  const diagnostics: CreativeDiagnostic[] = [];
  const bindings: GatewayAssetBinding[] = [];
  bindingsInput.forEach((entry, index) => {
    const parsed = GatewayAssetBindingSchema.safeParse(entry);
    if (!parsed.success) diagnostics.push(...zodDiagnostics(parsed.error, 'resolution'));
    else bindings.push(parsed.data);
    if (bindingsInput.findIndex((candidate) => candidate.asset_slot === entry.asset_slot) !== index) diagnostics.push(diagnostic(
      'gateway.asset_binding_duplicate', 'error', '$.asset_bindings', 'Un asset slot possède plusieurs bindings hôte.',
    ));
  });
  const assetSlots = new Map(assets.map((asset) => [asset.slot, asset]));
  bindings.forEach((entry) => {
    if (!assetSlots.has(entry.asset_slot)) diagnostics.push(diagnostic(
      'gateway.asset_binding_unknown', 'error', '$.asset_bindings', 'Le binding hôte cible un AssetIntent absent.',
    ));
  });
  assets.filter((asset) => asset.required && !bindings.some((entry) => entry.asset_slot === asset.slot)).forEach((asset) => diagnostics.push({
    code: 'gateway.unresolved_required_asset', severity: 'error', path: '$.asset_bindings', node_id: asset.id,
    message: 'Un AssetIntent requis ne possède pas de binding hôte approuvé.',
    suggested_action: 'Résoudre l’asset hors provider, puis fournir uniquement son asset_ref approuvé.',
  }));

  const verifications: GatewaySourceVerification[] = [];
  verificationsInput.forEach((entry) => {
    const parsed = GatewaySourceVerificationSchema.safeParse(entry);
    if (!parsed.success) diagnostics.push(...zodDiagnostics(parsed.error, 'resolution'));
    else verifications.push(parsed.data);
  });
  const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
  verifications.forEach((entry) => {
    if (!slotMap.has(entry.slot_id)) diagnostics.push(diagnostic(
      'gateway.source_verification_unknown', 'error', '$.source_verifications', 'La vérification cible un ContentSlot absent.',
    ));
  });
  resolution.content.filter((entry) => entry.source_required).forEach((entry) => {
    if (!verifications.some((verification) => verification.slot_id === entry.slot_id)) diagnostics.push({
      code: 'gateway.factual_verification_required', severity: 'error', path: '$.source_verifications', node_id: entry.slot_id,
      message: 'Un contenu marqué source_required ne possède aucune vérification externe approuvée.',
      suggested_action: 'Fournir une provenance user_supplied, fixture ou externally_verified ; une réponse provider n’est pas une preuve.',
    });
  });
  slots.filter((slot) => slot.required).forEach((slot) => {
    if (!resolution.content.some((entry) => entry.slot_id === slot.id)) diagnostics.push({
      code: 'gateway.unresolved_required_content', severity: 'error', path: '$.resolution_output.content', node_id: slot.id,
      message: 'Un ContentSlot requis reste non résolu.',
      suggested_action: 'Résoudre explicitement le slot ou arrêter avant P2.3.',
    });
  });
  return { bindings, verifications, diagnostics };
}

function metrics(context: RunContext): GatewayMetrics {
  return {
    total_ms: elapsedMs(context.started),
    provider_ms: context.providerMs,
    validation_ms: context.validationMs,
    planning_ms: context.planningMs,
    resolution_ms: context.resolutionMs,
    measured: true,
  };
}

function report(
  context: RunContext,
  provider: ProviderMetadata | null,
  requestHash: string | null,
  acceptedHash: string | null,
  snapshotHash: string | null,
): CreativeGatewayReport {
  const ordered = sortCreativeDiagnostics(context.diagnostics);
  const summary = summarizeDiagnostics(ordered);
  return CreativeGatewayReportSchema.parse({
    schema: 'creative-gateway-report', schema_version: '0.1.0', gateway_version: CREATIVE_GATEWAY_VERSION,
    state: context.state,
    eligible_for_compile: context.state === 'READY_FOR_COMPILE' && summary.errors === 0,
    failure_kind: context.failure,
    provider,
    transitions: context.transitions,
    diagnostics: ordered,
    summary: {
      ...summary,
      planning_attempts: context.planningAttempts,
      resolution_attempts: context.resolutionAttempts,
    },
    usage: context.usage,
    metrics: metrics(context),
    hashes: { request: requestHash, accepted_provider_response: acceptedHash, snapshot: snapshotHash },
    raw_response_policy: 'excluded',
  });
}

function initialContext(): RunContext {
  return {
    state: 'CREATED', transitions: [], diagnostics: [], failure: null,
    planningAttempts: 0, resolutionAttempts: 0, usage: EMPTY_USAGE,
    providerMs: 0, validationMs: 0, planningMs: 0, resolutionMs: 0,
    started: process.hrtime.bigint(),
  };
}

function failedResult(
  context: RunContext,
  provider: ProviderMetadata | null,
  requestHash: string | null,
  plannerInput: PlannerInput | null = null,
  planning: StoryPlanningResult | null = null,
): CreativeGatewayResult {
  if (context.failure === 'cancelled') transition(context, 'CANCELLED', 'gateway.cancelled');
  else if (context.state !== 'FAILED') transition(context, 'FAILED', 'gateway.failed');
  return {
    ok: false, state: context.state, planner_input: plannerInput, planning,
    creative_resolution: null, snapshot: null,
    report: report(context, provider, requestHash, null, null),
  };
}

export async function runCreativeGateway(
  requestInput: unknown,
  options: CreativeGatewayOptions,
): Promise<CreativeGatewayResult> {
  const context = initialContext();
  const limits = options.limits ?? DEFAULT_GATEWAY_LIMITS;
  const validatedRequest = validateCreativeGenerationRequest(requestInput, limits);
  context.diagnostics.push(...validatedRequest.diagnostics);
  if (!validatedRequest.ok || !validatedRequest.value) {
    context.failure = 'schema_invalid';
    return failedResult(context, null, null);
  }
  const request = validatedRequest.value;
  const requestHash = hashCreativeDocument(request);
  const parsedProvider = ProviderMetadataSchema.safeParse(options.provider.metadata);
  if (!parsedProvider.success) {
    context.diagnostics.push(...zodDiagnostics(parsedProvider.error, 'planning'));
    context.failure = 'schema_invalid';
    return failedResult(context, null, requestHash);
  }
  const provider = parsedProvider.data;
  if (new Set(provider.capabilities).size !== provider.capabilities.length) {
    context.diagnostics.push(diagnostic('gateway.provider.capability_duplicate', 'error', '$.provider.capabilities', 'Une capability provider est répétée.'));
  }
  if (!provider.capabilities.includes('structured_output')) {
    context.diagnostics.push(diagnostic(
      'gateway.provider.unsupported_capability', 'error', '$.provider.capabilities',
      'Le provider ne déclare pas structured_output.',
      'Utiliser un adapter capable de produire le contrat structuré strict.',
    ));
    context.failure = 'unsupported_capability';
    return failedResult(context, provider, requestHash);
  }
  if (options.signal?.aborted) {
    context.failure = 'cancelled';
    context.diagnostics.push(diagnostic('gateway.cancelled', 'error', '$.signal', 'Génération annulée avant démarrage.'));
    return failedResult(context, provider, requestHash);
  }
  const maxRepairs = Math.min(options.max_repair_attempts ?? 1, limits.max_repair_attempts);
  const timeoutMs = Math.min(options.timeout_ms ?? 30_000, limits.max_timeout_ms);
  const plannerOptions = options.planner ?? {};
  const planningContext = createProviderPlanningContext(request, plannerOptions);
  const planningStage = await runStage<PlanningGenerationOutput>({
    stage: 'planning', context, provider: options.provider, request, maxRepairs, timeoutMs,
    ...(options.signal === undefined ? {} : { externalSignal: options.signal }),
    planningContext,
    semantic: (output) => planningSemantics(request, output, provider, plannerOptions, planningContext),
  });
  if (!planningStage.ok || !planningStage.output) {
    context.failure = planningStage.failure;
    return failedResult(context, provider, requestHash);
  }
  const planningStarted = process.hrtime.bigint();
  let planned: ReturnType<typeof planAcceptedOutput>;
  try {
    planned = planAcceptedOutput(request, planningStage.output, plannerOptions);
  } catch (error) {
    context.diagnostics.push(diagnostic('gateway.planner_input_invalid', 'error', '$.planning_output', error instanceof Error ? error.message : 'PlannerInput invalide.'));
    context.failure = 'semantic_invalid';
    context.planningMs += elapsedMs(planningStarted);
    return failedResult(context, provider, requestHash);
  }
  context.planningMs += elapsedMs(planningStarted);
  if (!planned.planning.ok || !planned.planning.creative_plan || !planned.planning.report) {
    context.diagnostics.push(...planned.planning.input_validation.diagnostics);
    if (planned.planning.report) context.diagnostics.push(...planned.planning.report.diagnostics);
    context.failure = 'semantic_invalid';
    return failedResult(context, provider, requestHash, planned.planner_input, planned.planning);
  }
  transition(context, 'PLANNED', 'planning.accepted');
  const creativePlan = planned.planning.creative_plan;
  const readingBudgetResult = options.reading_policy
    ? deriveCreativeReadingBudgets({
        plan: creativePlan,
        planning_report: planned.planning.report,
        content_slots: planned.planning.content_slots,
        policy: options.reading_policy,
      })
    : null;
  if (readingBudgetResult && !readingBudgetResult.ok) {
    context.diagnostics.push(...readingBudgetResult.diagnostics, diagnostic(
      'gateway.reading_budget_unavailable', 'error', '$.resolution_context',
      'Les budgets de lecture certifiés ne peuvent pas être dérivés avant Stage B.',
      'Corriger la configuration P2.3/P1 sans demander au provider de modifier le contenu.',
    ));
    context.failure = 'semantic_invalid';
    return failedResult(context, provider, requestHash, planned.planner_input, planned.planning);
  }
  const resolutionContext = buildProviderResolutionContext(
    creativePlan.plan_id,
    planned.planning.content_slots,
    planned.planning.report,
    creativePlan.asset_intents,
    readingBudgetResult?.budgets ?? [],
    readingBudgetResult?.subtitle_budgets ?? [],
  );
  const resolutionStage = await runStage<ResolutionGenerationOutput>({
    stage: 'resolution', context, provider: options.provider, request, maxRepairs, timeoutMs,
    ...(options.signal === undefined ? {} : { externalSignal: options.signal }),
    resolutionContext,
    semantic: (output) => {
      const diagnostics = resolutionSemantics(
        request, output, provider, creativePlan.plan_id, planned.planning.content_slots, creativePlan.asset_intents,
        resolutionContext,
      );
      if (!diagnostics.some((entry) => entry.severity === 'error') && options.reading_policy) diagnostics.push(...readingSemantics(
        output,
        creativePlan,
        planned.planning.report!,
        planned.planning.content_slots,
        resolutionContext,
        options.reading_policy,
      ));
      return diagnostics;
    },
  });
  if (!resolutionStage.ok || !resolutionStage.output) {
    context.failure = resolutionStage.failure;
    return failedResult(context, provider, requestHash, planned.planner_input, planned.planning);
  }
  const resolutionStarted = process.hrtime.bigint();
  let bindingInput: readonly GatewayAssetBinding[] = [];
  if (options.resolve_asset_bindings) {
    try {
      bindingInput = await options.resolve_asset_bindings({
        request, asset_intents: creativePlan.asset_intents, descriptions: resolutionStage.output.asset_descriptions,
      });
    } catch (error) {
      context.diagnostics.push(diagnostic(
        'gateway.asset_binding_failed', 'error', '$.asset_bindings',
        error instanceof Error ? error.message : 'La frontière hôte de résolution d’assets a échoué.',
      ));
      context.failure = 'unresolved_required_asset';
      context.resolutionMs += elapsedMs(resolutionStarted);
      return failedResult(context, provider, requestHash, planned.planner_input, planned.planning);
    }
  }
  const validatedBindings = validateBindings(
    bindingInput,
    options.source_verifications ?? [],
    creativePlan.asset_intents,
    planned.planning.content_slots,
    resolutionStage.output,
  );
  context.diagnostics.push(...validatedBindings.diagnostics);
  if (validatedBindings.diagnostics.some((entry) => entry.severity === 'error')) {
    const codes = new Set(validatedBindings.diagnostics.map((entry) => entry.code));
    context.failure = codes.has('gateway.factual_verification_required')
      ? 'factual_verification_required'
      : codes.has('gateway.unresolved_required_asset')
        ? 'unresolved_required_asset'
        : 'unresolved_required_content';
    context.resolutionMs += elapsedMs(resolutionStarted);
    return failedResult(context, provider, requestHash, planned.planner_input, planned.planning);
  }
  const creativeResolution = resolutionOutputToCreativeResolution({
    plan: creativePlan,
    planning_report: planned.planning.report,
    content_slots: planned.planning.content_slots,
    output: resolutionStage.output,
    asset_bindings: validatedBindings.bindings,
    source_verifications: validatedBindings.verifications,
  });
  const resolutionDiagnostics = resolutionInvariantDiagnostics(creativeResolution, resolutionContext);
  context.diagnostics.push(...resolutionDiagnostics);
  if (resolutionDiagnostics.some((entry) => entry.severity === 'error')) {
    context.failure = 'unresolved_required_content';
    context.resolutionMs += elapsedMs(resolutionStarted);
    return failedResult(context, provider, requestHash, planned.planner_input, planned.planning);
  }
  context.resolutionMs += elapsedMs(resolutionStarted);
  transition(context, 'RESOLVED', 'resolution.accepted');
  const planningHash = hashCreativeDocument(planningStage.output);
  const resolutionHash = hashCreativeDocument(resolutionStage.output);
  const acceptedHash = hashCreativeDocument({ planning: planningStage.output, resolution: resolutionStage.output });
  const snapshot = createGatewaySnapshot({
    schema: 'creative-gateway-snapshot', schema_version: '0.1.0', gateway_version: CREATIVE_GATEWAY_VERSION,
    request, provider,
    planning_output: planningStage.output,
    resolution_output: resolutionStage.output,
    asset_bindings: validatedBindings.bindings,
    source_verifications: validatedBindings.verifications,
    provenance: {
      user_idea: 'user_supplied',
      planning_output: planningStage.output.provenance,
      resolution_output: resolutionStage.output.provenance,
      raw_response_policy: 'excluded',
    },
    hashes: {
      request: requestHash,
      planning_output: planningHash,
      resolution_output: resolutionHash,
      accepted_provider_response: acceptedHash,
    },
  });
  transition(context, 'READY_FOR_COMPILE', 'gateway.snapshot_accepted');
  return {
    ok: true, state: context.state, planner_input: planned.planner_input, planning: planned.planning,
    creative_resolution: creativeResolution, snapshot,
    report: report(context, provider, requestHash, acceptedHash, snapshot.snapshot_sha256),
  };
}

export function replayCreativeGateway(
  snapshotInput: unknown,
  options: CreativeGatewayReplayOptions = {},
): CreativeGatewayResult {
  const context = initialContext();
  transition(context, 'REPLAY_VALIDATING', 'replay.started');
  const security = inspectGatewayInput(snapshotInput, 'snapshot');
  context.diagnostics.push(...security);
  const parsed = CreativeGatewaySnapshotSchema.safeParse(snapshotInput);
  if (!parsed.success) {
    context.diagnostics.push(...zodDiagnostics(parsed.error, 'snapshot'));
    context.failure = 'schema_invalid';
    return failedResult(context, null, null);
  }
  const snapshot = parsed.data;
  if (!verifyGatewaySnapshot(snapshot)) {
    context.diagnostics.push(diagnostic('gateway.snapshot.hash_mismatch', 'error', '$.snapshot_sha256', 'Le hash canonique du snapshot est incohérent.'));
  }
  if (snapshot.hashes.request !== hashCreativeDocument(snapshot.request)
    || snapshot.hashes.planning_output !== hashCreativeDocument(snapshot.planning_output)
    || snapshot.hashes.resolution_output !== hashCreativeDocument(snapshot.resolution_output)
    || snapshot.hashes.accepted_provider_response !== hashCreativeDocument({ planning: snapshot.planning_output, resolution: snapshot.resolution_output })) {
    context.diagnostics.push(diagnostic('gateway.snapshot.component_hash_mismatch', 'error', '$.hashes', 'Un hash de composant du snapshot est incohérent.'));
  }
  const requestValidation = validateCreativeGenerationRequest(snapshot.request);
  context.diagnostics.push(...requestValidation.diagnostics);
  const plannerOptions = options.planner ?? {};
  const planningContext = createProviderPlanningContext(snapshot.request, plannerOptions);
  context.diagnostics.push(...planningSemantics(
    snapshot.request,
    snapshot.planning_output,
    snapshot.provider,
    plannerOptions,
    planningContext,
  ));
  if (context.diagnostics.some((entry) => entry.severity === 'error') || !requestValidation.value) {
    context.failure = 'schema_invalid';
    return failedResult(context, snapshot.provider, snapshot.hashes.request);
  }
  let planned: ReturnType<typeof planAcceptedOutput>;
  try {
    planned = planAcceptedOutput(snapshot.request, snapshot.planning_output, plannerOptions);
  } catch (error) {
    context.diagnostics.push(diagnostic('gateway.replay.planner_invalid', 'error', '$.planning_output', error instanceof Error ? error.message : 'Replay PlannerInput invalide.'));
    context.failure = 'semantic_invalid';
    return failedResult(context, snapshot.provider, snapshot.hashes.request);
  }
  if (!planned.planning.ok || !planned.planning.creative_plan || !planned.planning.report) {
    context.diagnostics.push(...planned.planning.input_validation.diagnostics);
    context.failure = 'semantic_invalid';
    return failedResult(context, snapshot.provider, snapshot.hashes.request, planned.planner_input, planned.planning);
  }
  transition(context, 'PLANNED', 'replay.planned');
  const readingBudgetResult = options.reading_policy
    ? deriveCreativeReadingBudgets({
        plan: planned.planning.creative_plan,
        planning_report: planned.planning.report,
        content_slots: planned.planning.content_slots,
        policy: options.reading_policy,
      })
    : null;
  if (readingBudgetResult && !readingBudgetResult.ok) {
    context.diagnostics.push(...readingBudgetResult.diagnostics, diagnostic(
      'gateway.reading_budget_unavailable', 'error', '$.resolution_context',
      'Les budgets de lecture certifiés ne peuvent pas être reconstruits pendant le replay.',
    ));
    context.failure = 'semantic_invalid';
    return failedResult(context, snapshot.provider, snapshot.hashes.request, planned.planner_input, planned.planning);
  }
  const resolutionContext = buildProviderResolutionContext(
    planned.planning.creative_plan.plan_id,
    planned.planning.content_slots,
    planned.planning.report,
    planned.planning.creative_plan.asset_intents,
    readingBudgetResult?.budgets ?? [],
    readingBudgetResult?.subtitle_budgets ?? [],
  );
  context.diagnostics.push(...resolutionSemantics(
    snapshot.request,
    snapshot.resolution_output,
    snapshot.provider,
    planned.planning.creative_plan.plan_id,
    planned.planning.content_slots,
    planned.planning.creative_plan.asset_intents,
    resolutionContext,
  ));
  if (!context.diagnostics.some((entry) => entry.severity === 'error') && options.reading_policy) context.diagnostics.push(...readingSemantics(
    snapshot.resolution_output,
    planned.planning.creative_plan,
    planned.planning.report,
    planned.planning.content_slots,
    resolutionContext,
    options.reading_policy,
  ));
  const validatedBindings = validateBindings(
    snapshot.asset_bindings,
    snapshot.source_verifications,
    planned.planning.creative_plan.asset_intents,
    planned.planning.content_slots,
    snapshot.resolution_output,
  );
  context.diagnostics.push(...validatedBindings.diagnostics);
  if (context.diagnostics.some((entry) => entry.severity === 'error')) {
    context.failure = 'semantic_invalid';
    return failedResult(context, snapshot.provider, snapshot.hashes.request, planned.planner_input, planned.planning);
  }
  const resolution = resolutionOutputToCreativeResolution({
    plan: planned.planning.creative_plan,
    planning_report: planned.planning.report,
    content_slots: planned.planning.content_slots,
    output: snapshot.resolution_output,
    asset_bindings: validatedBindings.bindings,
    source_verifications: validatedBindings.verifications,
  });
  context.diagnostics.push(...resolutionInvariantDiagnostics(resolution, resolutionContext));
  if (context.diagnostics.some((entry) => entry.severity === 'error')) {
    context.failure = 'semantic_invalid';
    return failedResult(context, snapshot.provider, snapshot.hashes.request, planned.planner_input, planned.planning);
  }
  transition(context, 'RESOLVED', 'replay.resolved');
  transition(context, 'READY_FOR_COMPILE', 'replay.accepted');
  return {
    ok: true, state: context.state, planner_input: planned.planner_input, planning: planned.planning,
    creative_resolution: resolution, snapshot,
    report: report(
      context, snapshot.provider, snapshot.hashes.request,
      snapshot.hashes.accepted_provider_response, snapshot.snapshot_sha256,
    ),
  };
}
