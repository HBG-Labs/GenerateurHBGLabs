import type { z } from 'zod';

import {
  DEFAULT_ARCHETYPE_REGISTRY,
  hashCreativeDocument,
  sortCreativeDiagnostics,
  summarizeDiagnostics,
  type AssetIntent,
  type ContentSlot,
  type CreativeDiagnostic,
  type PlannerOptions,
  type PlannerInput,
  type StoryPlanningResult,
} from '@motion-engine/creative-core';
import type { CreativeResolution } from '@motion-engine/creative-compiler';

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
import { planAcceptedOutput, resolutionOutputToCreativeResolution } from './mapping.ts';
import type { CreativeProvider, ProviderInvocation, ProviderResponse } from './provider.ts';
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
  readonly resolve_asset_bindings?: (
    context: AssetBindingContext,
  ) => readonly GatewayAssetBinding[] | Promise<readonly GatewayAssetBinding[]>;
}

export interface CreativeGatewayReplayOptions {
  readonly planner?: PlannerOptions;
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
): CreativeDiagnostic {
  return {
    code, severity, path, message: redactSensitiveText(message),
    ...(suggestedAction === undefined ? {} : { suggested_action: suggestedAction }),
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
  const assetMap = new Map(assets.map((asset) => [asset.slot, asset]));
  const seenContent = new Set<string>();
  output.content.forEach((entry, index) => {
    const key = `${entry.slot_id}:${entry.scene_id ?? '*'}`;
    if (seenContent.has(key)) diagnostics.push(diagnostic(
      'gateway.output.duplicate_slot_resolution', 'error', `$.content[${index}]`, 'Un même slot est résolu plusieurs fois pour la même scène.',
    ));
    seenContent.add(key);
    const slot = slotMap.get(entry.slot_id);
    if (!slot) {
      diagnostics.push(diagnostic('gateway.output.unknown_content_slot', 'error', `$.content[${index}].slot_id`, 'Le slot de contenu n’existe pas dans le PlanningReport.'));
      return;
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
  const activeRegistry = plannerOptions.registry ?? DEFAULT_ARCHETYPE_REGISTRY;
  const planningContext: NonNullable<ProviderInvocation['planning_context']> = {
    allowed_archetype_ids: activeRegistry.definitions().map((definition) => definition.id),
    registry_fingerprint: activeRegistry.fingerprint(),
  };
  const planningStage = await runStage<PlanningGenerationOutput>({
    stage: 'planning', context, provider: options.provider, request, maxRepairs, timeoutMs,
    ...(options.signal === undefined ? {} : { externalSignal: options.signal }),
    planningContext,
    semantic: (output) => planningSemantics(request, output, provider, plannerOptions),
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
  const resolutionStage = await runStage<ResolutionGenerationOutput>({
    stage: 'resolution', context, provider: options.provider, request, maxRepairs, timeoutMs,
    ...(options.signal === undefined ? {} : { externalSignal: options.signal }),
    resolutionContext: {
      plan_id: creativePlan.plan_id,
      content_slots: planned.planning.content_slots,
      asset_intents: creativePlan.asset_intents,
    },
    semantic: (output) => resolutionSemantics(
      request, output, provider, creativePlan.plan_id, planned.planning.content_slots, creativePlan.asset_intents,
    ),
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
  context.diagnostics.push(...planningSemantics(snapshot.request, snapshot.planning_output, snapshot.provider, plannerOptions));
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
  context.diagnostics.push(...resolutionSemantics(
    snapshot.request,
    snapshot.resolution_output,
    snapshot.provider,
    planned.planning.creative_plan.plan_id,
    planned.planning.content_slots,
    planned.planning.creative_plan.asset_intents,
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
