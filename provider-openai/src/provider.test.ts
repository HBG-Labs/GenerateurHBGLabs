import { zodTextFormat } from 'openai/helpers/zod';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from 'openai';
import { ContentFilterFinishReasonError, LengthFinishReasonError } from 'openai/error';
import { describe, expect, it } from 'vitest';

import {
  GatewayProviderError,
  RESOLUTION_REPAIR_CONTRACT_VERSION,
  createCreativeGenerationRequest,
  runCreativeGateway,
  ResolutionRepairRequestSchema,
  type ProviderUsage,
} from '@motion-engine/creative-gateway';

import {
  DEFAULT_OPENAI_MODEL,
  createOpenAIProviderFingerprint,
  resolveOpenAIProviderConfig,
} from './contracts.ts';
import { OpenAICreativeProvider, createOpenAIProviderFromEnvironment } from './provider.ts';
import {
  OpenAIPlanningOutputSchema,
  OpenAIResolutionOutputSchema,
  createOpenAIPlanningOutputSchema,
  createOpenAIResolutionOutputSchema,
  createOpenAIResolutionRepairPatchSchema,
} from './schemas.ts';
import { mapOpenAIError, type OpenAIStructuredTransport, type OpenAITransportRequest } from './transport.ts';

const USAGE: ProviderUsage = {
  input_units: 100,
  output_units: 200,
  cached_units: 12,
  request_count: 1,
  provider_reported_cost: null,
};

function request() {
  return createCreativeGenerationRequest({
    idea: "Et si les dinosaures existaient encore aujourd'hui ?",
    creative_goal: 'curiosity',
    target_duration_ms: 30_000,
    target_format: 'vertical_short',
    audience: { description: 'Public francophone curieux', knowledge_level: 'mixed' },
    language: 'fr',
    locale: 'fr-FR',
    tone: ['dramatic'],
    desired_reaction: 'surprise',
    factual_mode: 'creative',
    cta: { mode: 'none' },
    constraints: [],
  });
}

function planningOutput(providerRequest: OpenAITransportRequest, invalidLanguage = false) {
  const payload = JSON.parse(providerRequest.input) as { request: ReturnType<typeof request> };
  return {
    schema: 'creative-generation-output' as const,
    schema_version: '0.1.0' as const,
    stage: 'planning' as const,
    request_id: payload.request.request_id,
    provenance: 'provider_generated' as const,
    normalized_topic: payload.request.idea,
    creative_goal: payload.request.creative_goal,
    audience: payload.request.audience,
    language: invalidLanguage ? 'en' : payload.request.language,
    locale: payload.request.locale,
    target_duration_ms: payload.request.target_duration_ms,
    target_format: payload.request.target_format,
    tone: payload.request.tone,
    pacing: 'fast' as const,
    information_density: 'medium' as const,
    narrative_archetype: 'HYPOTHETICAL',
    desired_reaction: payload.request.desired_reaction,
    factual_mode: payload.request.factual_mode,
    cta: payload.request.cta,
    suggested_constraints: [],
  };
}

function resolutionOutput(providerRequest: OpenAITransportRequest) {
  const payload = JSON.parse(providerRequest.input) as {
    request: ReturnType<typeof request>;
    resolution_context: {
      plan_id: string;
      content_slots: Array<{
        slot_id: string;
        role: string;
        factual_requirement: string;
        constraints: { max_characters: number };
        allowed_scene_ids: string[];
        generic_resolution_allowed: boolean;
      }>;
      asset_intents: Array<{ id: string; slot: string; purpose: string }>;
    };
  };
  return {
    schema: 'creative-generation-output' as const,
    schema_version: '0.1.0' as const,
    stage: 'resolution' as const,
    request_id: payload.request.request_id,
    plan_id: payload.resolution_context.plan_id,
    provenance: 'provider_generated' as const,
    content: payload.resolution_context.content_slots.map((slot) => ({
      slot_id: slot.slot_id,
      scene_id: null,
      text: slot.role === 'hook_text'
        ? 'ET SI LES DINOSAURES REVENAIENT ?'.slice(0, slot.constraints.max_characters)
        : 'Une hypothèse qui transforme nos villes.'.slice(0, slot.constraints.max_characters),
      provenance: 'provider_generated' as const,
      uncertainty: slot.factual_requirement === 'none' ? 'none' as const : 'unknown' as const,
      source_required: slot.factual_requirement === 'source_required',
    })),
    asset_descriptions: payload.resolution_context.asset_intents.map((asset) => ({
      asset_intent_id: asset.id,
      asset_slot: asset.slot,
      description: `Illustration conceptuelle : ${asset.purpose}`,
      provenance: 'provider_generated' as const,
    })),
  };
}

class SuccessfulTransport implements OpenAIStructuredTransport {
  readonly calls: OpenAITransportRequest[] = [];
  invalidFirstPlanning = false;
  incompatibleArchetypeRoleFirst = false;

  generate(input: OpenAITransportRequest) {
    this.calls.push(input);
    const planningAttempt = this.calls.filter((call) => call.schema_name === 'creative_planning_output').length;
    const invalid = this.invalidFirstPlanning && input.schema_name === 'creative_planning_output' && planningAttempt === 1;
    const planning = planningOutput(input, invalid);
    const planningWithRegistryConstraint = this.incompatibleArchetypeRoleFirst
      && input.schema_name === 'creative_planning_output'
      ? {
          ...planning,
          narrative_archetype: 'REVEAL',
          suggested_constraints: planningAttempt === 1
            ? [{ id: 'require_escalation', kind: 'require_role' as const, role: 'escalation' as const }]
            : [{ id: 'require_tension', kind: 'require_role' as const, role: 'tension' as const }],
        }
      : planning;
    return Promise.resolve({
      output: input.schema_name === 'creative_planning_output'
        ? planningWithRegistryConstraint
        : resolutionOutput(input),
      usage: USAGE,
      response_id: `response_${this.calls.length}`,
      model: DEFAULT_OPENAI_MODEL,
    });
  }
}

describe('P2.5 — OpenAI CreativeProvider adapter', () => {
  it('convertit les deux stages natifs puis laisse P2.4 valider et snapshotter', async () => {
    const transport = new SuccessfulTransport();
    const logs: unknown[] = [];
    const provider = new OpenAICreativeProvider({ transport, logger: (event) => logs.push(event) });
    const result = await runCreativeGateway(request(), {
      provider,
      max_repair_attempts: 1,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot,
        asset_ref: 'neutral_landscape',
        provenance: 'fixture' as const,
        focus: { region: 'focus_disc' },
      })),
    });
    expect(result.ok).toBe(true);
    expect(result.snapshot?.provider.provider_id).toBe('openai');
    expect(result.snapshot?.planning_output.provenance).toBe('provider_generated');
    expect(result.snapshot?.resolution_output.provenance).toBe('provider_generated');
    expect(transport.calls).toHaveLength(2);
    expect(provider.callCount).toBe(2);
    expect(result.report.usage).toMatchObject({ input_units: 200, output_units: 400, cached_units: 24, request_count: 2 });
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toContain(request().idea);
  });

  it('utilise la réparation P2.4 bornée sans retry transport caché', async () => {
    const transport = new SuccessfulTransport();
    transport.invalidFirstPlanning = true;
    const provider = new OpenAICreativeProvider({ transport });
    const result = await runCreativeGateway(request(), {
      provider,
      max_repair_attempts: 1,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot,
        asset_ref: 'neutral_landscape',
        provenance: 'fixture' as const,
      })),
    });
    expect(result.ok).toBe(true);
    expect(result.report.summary.planning_attempts).toBe(2);
    expect(provider.callCount).toBe(3);
    expect(transport.calls[1]?.input).toContain('gateway.output.request_constraint_changed');
  });

  it('transmet le registre actif et le contexte détaillé lors d’une réparation cross-field', async () => {
    const transport = new SuccessfulTransport();
    transport.incompatibleArchetypeRoleFirst = true;
    const provider = new OpenAICreativeProvider({ transport });
    const result = await runCreativeGateway(request(), {
      provider,
      max_repair_attempts: 1,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot,
        asset_ref: 'neutral_landscape',
        provenance: 'fixture' as const,
      })),
    });

    expect(result.ok, JSON.stringify(result.report.diagnostics)).toBe(true);
    expect(transport.calls).toHaveLength(3);
    const firstPlanning = transport.calls[0]?.input ?? '';
    const repairPlanning = transport.calls[1]?.input ?? '';
    expect(firstPlanning).toContain('supported_roles');
    expect(firstPlanning).toContain('required_roles');
    expect(firstPlanning).toContain('ordering_constraints');
    expect(repairPlanning).toContain('gateway.output.archetype_role_unsupported');
    expect(repairPlanning).toContain('incompatible_role');
    expect(repairPlanning).toContain('permitted_role_constraints');
  });

  it('refuse proprement l’absence de secret sans le placer dans la configuration', () => {
    expect(() => createOpenAIProviderFromEnvironment({ env: {} })).toThrowError(GatewayProviderError);
    try {
      createOpenAIProviderFromEnvironment({ env: {} });
    } catch (error) {
      expect(error).toMatchObject({ kind: 'provider_auth_missing' });
    }
    const fingerprint = createOpenAIProviderFingerprint(resolveOpenAIProviderConfig());
    expect(JSON.stringify(fingerprint)).not.toMatch(/api.?key|secret|sk-/i);
  });

  it('borne le nombre total d’appels provider', async () => {
    const transport = new SuccessfulTransport();
    transport.invalidFirstPlanning = true;
    const provider = new OpenAICreativeProvider({ transport, config: { max_provider_calls: 2 } });
    const result = await runCreativeGateway(request(), {
      provider,
      max_repair_attempts: 1,
      resolve_asset_bindings: () => [],
    });
    expect(result.ok).toBe(false);
    expect(result.report.failure_kind).toBe('provider_call_limit_exceeded');
    expect(provider.callCount).toBe(2);
  });

  it('expose des schémas compatibles avec Structured Outputs stricts', () => {
    expect(() => zodTextFormat(OpenAIPlanningOutputSchema, 'planning')).not.toThrow();
    expect(() => zodTextFormat(OpenAIResolutionOutputSchema, 'resolution')).not.toThrow();
  });

  it('borne le JSON Schema planning aux archétypes du registre actif', () => {
    const activeSchema = createOpenAIPlanningOutputSchema(['EXPLAINER']);
    const providerRequest = {
      input: JSON.stringify({ request: request() }),
    } as OpenAITransportRequest;
    const output = planningOutput(providerRequest);
    expect(activeSchema.safeParse({ ...output, narrative_archetype: 'EXPLAINER' }).success).toBe(true);
    expect(activeSchema.safeParse({ ...output, narrative_archetype: 'DYSTOPIE_ALTERNATIVE' }).success).toBe(false);
    expect(() => zodTextFormat(activeSchema, 'planning_active_registry')).not.toThrow();
  });

  it('borne le JSON Schema resolution aux scènes exposées par le contexte actif', () => {
    const activeSchema = createOpenAIResolutionOutputSchema(['scene_allowed']);
    const providerRequest = {
      input: JSON.stringify({
        request: request(),
        resolution_context: {
          plan_id: 'plan_test',
          content_slots: [{
            slot_id: 'slot_test', role: 'narration', factual_requirement: 'none',
            constraints: { max_characters: 120 }, allowed_scene_ids: ['scene_allowed'],
            generic_resolution_allowed: true,
          }],
          asset_intents: [],
        },
      }),
    } as OpenAITransportRequest;
    const output = resolutionOutput(providerRequest);
    expect(activeSchema.safeParse({
      ...output,
      content: output.content.map((entry) => ({ ...entry, scene_id: 'scene_allowed' })),
    }).success).toBe(true);
    expect(activeSchema.safeParse({
      ...output,
      content: output.content.map((entry) => ({ ...entry, scene_id: 'scene_unknown' })),
    }).success).toBe(false);
    expect(() => zodTextFormat(activeSchema, 'resolution_active_scenes')).not.toThrow();
  });

  it('expose un schema Structured Outputs dédié au patch ciblé', () => {
    const repairRequest = ResolutionRepairRequestSchema.parse({
      schema: 'resolution-repair-request', schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
      request_id: 'request_test', plan_id: 'plan_test', attempt: 1,
      targets: [{
        target: { slot_id: 'slot_test', scene_id: null },
        previous_content: {
          scene_id: null, text: 'Texte trop long', provenance: 'provider_generated',
          uncertainty: 'none', source_required: false,
        },
        semantic_role: 'narration', semantic_context: 'Contexte', language: 'fr', locale: 'fr-FR',
        required: true, allowed_scene_ids: ['scene_test'], generic_resolution_allowed: true,
        content_constraints: { max_characters: 120, channels: ['spoken', 'on_screen'], factual_requirement: 'none' },
        diagnostics: [{
          code: 'gateway.output.content_reading_budget_exceeded', severity: 'error', path: '$.content',
          message: 'Trop long.', context: { slot_id: 'slot_test', repair_target: true },
        }],
        temporal_constraint: {
          available_scene_ms: 2_904, already_allocated_ms: 132, remaining_slot_ms: 2_772,
          current_required_ms: 4_032, current_word_count: 16, maximum_slot_words: 11,
        },
        subtitle_constraint: null,
        effective_concision: {
          maximum_words: 11, temporal_maximum_words: 11,
          subtitle_maximum_words: null, limiting_constraints: ['temporal'],
        },
      }],
    });
    const schema = createOpenAIResolutionRepairPatchSchema(repairRequest);
    expect(() => zodTextFormat(schema, 'resolution_repair_patch')).not.toThrow();
    expect(schema.safeParse({
      schema: 'resolution-repair-patch', schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
      request_id: 'request_test', plan_id: 'plan_test',
      items: [{
        target: { slot_id: 'slot_test', scene_id: null },
        replacement: {
          scene_id: null, text: 'Onze mots au maximum', provenance: 'provider_generated',
          uncertainty: 'none', source_required: false,
        },
      }],
    }).success).toBe(true);
  });

  it.each([
    [401, 'provider_auth_invalid'],
    [403, 'provider_auth_invalid'],
    [429, 'provider_rate_limited'],
    [503, 'provider_unavailable'],
  ] as const)('mappe le statut transport %s vers %s sans reprendre le message brut', (status, kind) => {
    const mapped = mapOpenAIError(Object.assign(new Error('api_key=sk-sensitive'), { status }));
    expect(mapped.kind).toBe(kind);
    expect(mapped.message).not.toContain('sk-sensitive');
  });

  it.each([
    [new APIConnectionTimeoutError(), 'provider_timeout'],
    [new APIConnectionError({ message: 'offline' }), 'provider_network_error'],
    [new APIUserAbortError(), 'cancelled'],
    [new ContentFilterFinishReasonError(), 'provider_safety_refusal'],
    [new LengthFinishReasonError(), 'provider_output_incomplete'],
  ] as const)('mappe les erreurs SDK sans exposer leur contenu (%s)', (error, kind) => {
    expect(mapOpenAIError(error).kind).toBe(kind);
  });

  it('renvoie une sortie structurée invalide à la frontière P2.4 au lieu de la faire confiance', async () => {
    const transport: OpenAIStructuredTransport = {
      generate: () => Promise.resolve({ output: {}, usage: USAGE, response_id: 'invalid', model: DEFAULT_OPENAI_MODEL }),
    };
    const result = await runCreativeGateway(request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.report.failure_kind).toBe('repair_exhausted');
    expect(result.report.diagnostics.some((entry) => entry.code === 'gateway.output.schema_invalid')).toBe(true);
  });
});
