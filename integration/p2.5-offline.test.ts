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
import { SHORT_FORM_DEFAULT_PROFILE } from '@motion-engine/creative-compiler';

import { p24Request, compileP24GatewayResult } from './p2.4-support.ts';
import { pattern } from './p1.2-support.ts';
import { p23Style } from './p2.3-support.ts';

const USAGE: ProviderUsage = {
  input_units: 10,
  output_units: 20,
  cached_units: 0,
  request_count: 1,
  provider_reported_cost: null,
};

class OfflineStructuredTransport implements OpenAIStructuredTransport {
  calls = 0;
  resolutionCalls = 0;
  readonly requests: OpenAITransportRequest[] = [];
  readonly mode: 'valid' | 'too_long' | 'repair' = 'valid';
  resolutionContexts: Array<{
    plan_id: string;
    content_slots: Array<{
      slot_id: string;
      role: string;
      factual_requirement: string;
      constraints: { max_characters: number; channels: Array<'spoken' | 'on_screen'> };
      allowed_scene_ids: string[];
      generic_resolution_allowed: boolean;
      reading_budget_applies: boolean;
      scene_time_budgets: Array<{
        scene_id: string;
        available_ms: number;
        maximum_total_words: number;
        maximum_recommended_characters_per_entry: number;
      }>;
      generic_time_budget: {
        scene_id: string;
        available_ms: number;
        maximum_total_words: number;
        maximum_recommended_characters_per_entry: number;
      } | null;
    }>;
    asset_intents: Array<{ id: string; slot: string; purpose: string }>;
  }> = [];

  constructor(mode: 'valid' | 'too_long' | 'repair' = 'valid') {
    this.mode = mode;
  }

  generate(input: OpenAITransportRequest) {
    this.calls += 1;
    this.requests.push(input);
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
    const context = payload['resolution_context'] as OfflineStructuredTransport['resolutionContexts'][number];
    this.resolutionCalls += 1;
    this.resolutionContexts.push(context);
    const mustBeLong = this.mode === 'too_long' || (this.mode === 'repair' && this.resolutionCalls === 1);
    return Promise.resolve({
      response_id: 'offline_resolution', model: 'gpt-6-luna', usage: USAGE,
      output: {
        schema: 'creative-generation-output', schema_version: '0.1.0', stage: 'resolution',
        request_id: request.request_id, plan_id: context.plan_id, provenance: 'provider_generated',
        content: context.content_slots.map((slot) => ({
          slot_id: slot.slot_id, scene_id: null,
          text: (mustBeLong
            ? Array.from(
                { length: Math.max(8, Math.min(24, Math.floor((slot.constraints.max_characters + 1) / 4))) },
                () => 'mot',
              ).join(' ')
            : slot.role === 'hook_text'
              ? 'ET SI LES DINOSAURES REVENAIENT ?'
              : 'Nos villes devraient changer de rythme.').slice(0, slot.constraints.max_characters),
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
    const readingPolicy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: p23Style('signal'),
      pattern: pattern(),
    };
    const gateway = await runCreativeGateway(p24Request(), {
      provider,
      reading_policy: readingPolicy,
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
    const replayedGateway = replayCreativeGateway(gateway.snapshot, { reading_policy: readingPolicy });
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

  it('expose des budgets P1 par scène uniquement aux contenus on-screen', async () => {
    const transport = new OfflineStructuredTransport();
    const readingPolicy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: p23Style('signal'),
      pattern: pattern(),
    };
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      reading_policy: readingPolicy,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot, asset_ref: 'neutral_landscape', provenance: 'fixture' as const,
      })),
    });
    expect(result.ok).toBe(true);
    const slots = transport.resolutionContexts[0]!.content_slots;
    const onScreen = slots.filter((slot) => slot.constraints.channels.includes('on_screen'));
    const spokenOnly = slots.filter((slot) => slot.constraints.channels.includes('spoken') && !slot.constraints.channels.includes('on_screen'));
    expect(onScreen.length).toBeGreaterThan(0);
    expect(spokenOnly.length).toBeGreaterThan(0);
    expect(onScreen.every((slot) => slot.reading_budget_applies && slot.scene_time_budgets.length > 0)).toBe(true);
    expect(spokenOnly.every((slot) => !slot.reading_budget_applies && slot.scene_time_budgets.length === 0)).toBe(true);
    expect(onScreen.filter((slot) => slot.allowed_scene_ids.length > 1)
      .every((slot) => slot.generic_time_budget?.maximum_total_words
        === Math.min(...slot.scene_time_budgets.map((budget) => budget.maximum_total_words)))).toBe(true);
  });

  it('rejette au Gateway un texte dépassant le budget P1 avant CreativeResolution', async () => {
    const transport = new OfflineStructuredTransport('too_long');
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 0,
      reading_policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: p23Style('signal'),
        pattern: pattern(),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.creative_resolution).toBeNull();
    const diagnostics = result.report.diagnostics.filter((entry) => entry.code === 'gateway.output.content_reading_budget_exceeded');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((entry) =>
      typeof entry.context?.['available_ms'] === 'number'
      && typeof entry.context?.['required_ms'] === 'number'
      && typeof entry.context?.['maximum_total_words'] === 'number')).toBe(true);
    const multiSceneSlotIds = new Set(transport.resolutionContexts[0]!.content_slots
      .filter((slot) => slot.allowed_scene_ids.length > 1)
      .map((slot) => slot.slot_id));
    expect(diagnostics.some((entry) => multiSceneSlotIds.has(String(entry.context?.['slot_id'])))).toBe(true);
  });

  it('répare sémantiquement un texte trop long puis franchit P1 temporal', async () => {
    const transport = new OfflineStructuredTransport('repair');
    const readingPolicy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: p23Style('signal'),
      pattern: pattern(),
    };
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 1,
      reading_policy: readingPolicy,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot, asset_ref: 'neutral_landscape', provenance: 'fixture' as const,
        focus: { region: 'focus_disc' },
      })),
    });
    expect(result.ok).toBe(true);
    expect(transport.resolutionCalls).toBe(2);
    expect(transport.calls).toBe(3);
    expect(transport.requests.at(-1)?.input).toContain('gateway.output.content_reading_budget_exceeded');
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });
});
