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
  createCreativeGenerationRequest,
  runCreativeGateway,
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
        id: string;
        role: string;
        factual_requirement: string;
        constraints: { max_characters: number };
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
      slot_id: slot.id,
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

  generate(input: OpenAITransportRequest) {
    this.calls.push(input);
    const invalid = this.invalidFirstPlanning && input.schema_name === 'creative_planning_output'
      && this.calls.filter((call) => call.schema_name === 'creative_planning_output').length === 1;
    return Promise.resolve({
      output: input.schema_name === 'creative_planning_output'
        ? planningOutput(input, invalid)
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
