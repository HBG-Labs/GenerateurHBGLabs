import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import {
  replayCreativeGateway,
  runCreativeGateway,
  type ProviderUsage,
} from '@motion-engine/creative-gateway';
import {
  OpenAICreativeProvider,
  type OpenAIStructuredTransport,
  type OpenAITransportRequest,
} from '@motion-engine/provider-openai';

import { p24Request, compileP24GatewayResult } from './p2.4-support.ts';

const USAGE: ProviderUsage = {
  input_units: 10,
  output_units: 20,
  cached_units: 0,
  request_count: 1,
  provider_reported_cost: null,
};

class OfflineStructuredTransport implements OpenAIStructuredTransport {
  calls = 0;

  generate(input: OpenAITransportRequest) {
    this.calls += 1;
    const payload = JSON.parse(input.input) as Record<string, unknown>;
    const request = payload['request'] as ReturnType<typeof p24Request>;
    if (input.schema_name === 'creative_planning_output') {
      return Promise.resolve({
        response_id: 'offline_planning', model: 'gpt-6-luna', usage: USAGE,
        output: {
          schema: 'creative-generation-output', schema_version: '0.1.0', stage: 'planning',
          request_id: request.request_id, provenance: 'provider_generated', normalized_topic: request.idea,
          creative_goal: request.creative_goal, audience: request.audience, language: request.language,
          locale: request.locale, target_duration_ms: request.target_duration_ms, target_format: request.target_format,
          tone: request.tone, pacing: 'fast', information_density: 'medium', narrative_archetype: 'HYPOTHETICAL',
          desired_reaction: request.desired_reaction, factual_mode: request.factual_mode, cta: request.cta,
          suggested_constraints: [],
        },
      });
    }
    const context = payload['resolution_context'] as {
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
    return Promise.resolve({
      response_id: 'offline_resolution', model: 'gpt-6-luna', usage: USAGE,
      output: {
        schema: 'creative-generation-output', schema_version: '0.1.0', stage: 'resolution',
        request_id: request.request_id, plan_id: context.plan_id, provenance: 'provider_generated',
        content: context.content_slots.map((slot) => ({
          slot_id: slot.slot_id, scene_id: null,
          text: (slot.role === 'hook_text' ? 'ET SI LES DINOSAURES REVENAIENT ?' : 'Nos villes devraient changer de rythme.').slice(0, slot.constraints.max_characters),
          provenance: 'provider_generated', uncertainty: slot.factual_requirement === 'none' ? 'none' : 'unknown',
          source_required: slot.factual_requirement === 'source_required',
        })),
        asset_descriptions: context.asset_intents.map((asset) => ({
          asset_intent_id: asset.id, asset_slot: asset.slot,
          description: `Illustration conceptuelle : ${asset.purpose}`, provenance: 'provider_generated',
        })),
      },
    });
  }
}

describe('P2.5 — adapter réel, transport offline', () => {
  it('atteint P1 et rejoue strictement le snapshot sans rappeler le transport', async () => {
    const transport = new OfflineStructuredTransport();
    const provider = new OpenAICreativeProvider({ transport });
    const gateway = await runCreativeGateway(p24Request(), {
      provider,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot,
        asset_ref: 'neutral_landscape',
        provenance: 'fixture' as const,
        focus: { region: 'focus_disc' },
      })),
    });
    expect(gateway.ok).toBe(true);
    const direct = compileP24GatewayResult(gateway, 'signal');
    const callsBeforeReplay = transport.calls;
    const replayedGateway = replayCreativeGateway(gateway.snapshot);
    const replayed = compileP24GatewayResult(replayedGateway, 'signal');
    expect(transport.calls).toBe(callsBeforeReplay);
    expect(canonicalJson(replayedGateway.planner_input)).toBe(canonicalJson(gateway.planner_input));
    expect(canonicalJson(replayedGateway.planning?.creative_plan)).toBe(canonicalJson(gateway.planning?.creative_plan));
    expect(canonicalJson(replayedGateway.creative_resolution)).toBe(canonicalJson(gateway.creative_resolution));
    expect(replayed.creative_compile.report.hashes.motion_spec).toBe(direct.creative_compile.report.hashes.motion_spec);
    expect(replayed.p1.hashes.render_plan).toBe(direct.p1.hashes.render_plan);
    expect(direct.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(direct.creative_compile.report.diagnostics.map((entry) => entry.code)).not.toContain('creative_compile.content_required_unresolved');
    expect(direct.creative_compile.report.diagnostics.map((entry) => entry.code)).not.toContain('creative_compile.narration_required_unresolved');
  });
});
