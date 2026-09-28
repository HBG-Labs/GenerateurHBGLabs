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
import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
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
  readonly outputs: unknown[] = [];
  readonly mode: 'valid' | 'too_long' | 'repair' | 'repair_still_long' | 'repair_changes_valid' | 'subtitle_too_long' | 'subtitle_repair' = 'valid';
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
      subtitle_fit_applies: boolean;
      scene_subtitle_budgets: Array<{
        scene_id: string;
        preferred_size: number;
        minimum_size: number;
        maximum_lines: number;
        available_width: number;
        available_height: number;
      }>;
      generic_subtitle_budget: {
        scene_id: string;
        preferred_size: number;
        minimum_size: number;
        maximum_lines: number;
        available_width: number;
        available_height: number;
      } | null;
    }>;
    asset_intents: Array<{ id: string; slot: string; purpose: string }>;
  }> = [];

  constructor(mode: 'valid' | 'too_long' | 'repair' | 'repair_still_long' | 'repair_changes_valid' | 'subtitle_too_long' | 'subtitle_repair' = 'valid') {
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
    const mustBeLong = this.mode === 'too_long'
      || (['repair', 'repair_still_long', 'repair_changes_valid'].includes(this.mode) && this.resolutionCalls === 1);
    const mustOverflowSubtitle = this.mode === 'subtitle_too_long'
      || (this.mode === 'subtitle_repair' && this.resolutionCalls === 1);
    const subtitleTarget = context.content_slots.find((slot) => (
      slot.constraints.channels.includes('spoken') && !slot.constraints.channels.includes('on_screen')
    ))?.slot_id;
    const temporalTarget = context.content_slots.find((slot) => (
      slot.allowed_scene_ids.length > 1
      && slot.constraints.channels.includes('on_screen')
      && !slot.constraints.channels.includes('spoken')
    ))?.slot_id ?? context.content_slots.find((slot) => (
      slot.allowed_scene_ids.length > 1 && slot.constraints.channels.includes('on_screen')
    ))?.slot_id ?? context.content_slots.find((slot) => (
      slot.constraints.channels.includes('on_screen') && !slot.constraints.channels.includes('spoken')
    ))?.slot_id ?? context.content_slots.find((slot) => slot.constraints.channels.includes('on_screen'))?.slot_id;
    const previous = payload['previous_output'] as { content: Array<{
      slot_id: string;
      scene_id: string | null;
      text: string;
      provenance: string;
      uncertainty: string;
      source_required: boolean;
    }>; asset_descriptions: unknown[] } | null;
    const repairDiagnostics = typeof payload['repair_diagnostics'] === 'string'
      && payload['repair_diagnostics'].trimStart().startsWith('[')
      ? JSON.parse(payload['repair_diagnostics']) as Array<{ context?: Record<string, unknown> }>
      : [];
    const repairTargets = new Map<string, number | null>();
    repairDiagnostics.forEach((entry) => {
      const slotId = entry.context?.['slot_id'];
      if (typeof slotId !== 'string' || entry.context?.['repair_target'] !== true) return;
      const maximum = entry.context['effective_maximum_slot_words'];
      const current = repairTargets.get(slotId);
      if (typeof maximum === 'number') repairTargets.set(slotId, current === undefined || current === null ? maximum : Math.min(current, maximum));
      else if (!repairTargets.has(slotId)) repairTargets.set(slotId, null);
    });
    const repairedContent = previous?.content.map((entry) => {
      if (!repairTargets.has(entry.slot_id)) {
        return this.mode === 'repair_changes_valid'
          ? { ...entry, text: `${entry.text} modifié` }
          : entry;
      }
      const maximum = repairTargets.get(entry.slot_id);
      const wordCount = typeof maximum === 'number'
        ? Math.max(1, maximum + (this.mode === 'repair_still_long' ? 1 : 0))
        : 2;
      return { ...entry, text: Array.from({ length: wordCount }, () => 'mot').join(' ') };
    });
    const content = repairedContent ?? context.content_slots.map((slot) => ({
      slot_id: slot.slot_id, scene_id: null,
      text: (mustOverflowSubtitle && slot.slot_id === subtitleTarget
        ? 'W'.repeat(Math.min(120, slot.constraints.max_characters))
        : mustBeLong && slot.slot_id === temporalTarget
        ? Array.from(
            { length: Math.max(8, Math.min(24, Math.floor((slot.constraints.max_characters + 1) / 4))) },
            () => 'mot',
          ).join(' ')
        : slot.role === 'hook_text'
          ? 'ET SI LES DINOSAURES REVENAIENT ?'
          : 'Nos villes devraient changer de rythme.').slice(0, slot.constraints.max_characters),
      provenance: 'provider_generated', uncertainty: slot.factual_requirement === 'none' ? 'none' : 'unknown',
      source_required: slot.factual_requirement === 'source_required',
    }));
    const output = {
      schema: 'creative-generation-output', schema_version: '0.1.0', stage: 'resolution',
      request_id: request.request_id, plan_id: context.plan_id, provenance: 'provider_generated',
      content,
      asset_descriptions: previous?.asset_descriptions ?? context.asset_intents.map((asset) => ({
        asset_intent_id: asset.id, asset_slot: asset.slot,
        description: `Illustration conceptuelle : ${asset.purpose}`, provenance: 'provider_generated',
      })),
    };
    this.outputs.push(output);
    return Promise.resolve({
      response_id: 'offline_resolution', model: 'gpt-6-luna', usage: USAGE,
      output,
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
      platform_presets: platforms(),
      font_resources: p14FontResources(p23Style('signal')),
      render_scale: 1,
      minimum_readable_size: 28,
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

  it('expose le budget temporel aux textes écran et le fitting exact aux contenus sous-titrés', async () => {
    const transport = new OfflineStructuredTransport();
    const readingPolicy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: p23Style('signal'),
      pattern: pattern(),
      platform_presets: platforms(),
      font_resources: p14FontResources(p23Style('signal')),
      render_scale: 1,
      minimum_readable_size: 28,
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
    expect(spokenOnly.every((slot) => slot.subtitle_fit_applies && slot.scene_subtitle_budgets.length > 0)).toBe(true);
    expect(spokenOnly.every((slot) => slot.generic_subtitle_budget?.maximum_lines === 2)).toBe(true);
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
        platform_presets: platforms(),
        font_resources: p14FontResources(p23Style('signal')),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.creative_resolution).toBeNull();
    const diagnostics = result.report.diagnostics.filter((entry) => entry.code === 'gateway.output.content_reading_budget_exceeded');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((entry) =>
      typeof entry.context?.['available_ms'] === 'number'
      && typeof entry.context?.['available_scene_ms'] === 'number'
      && typeof entry.context?.['already_allocated_ms'] === 'number'
      && typeof entry.context?.['remaining_slot_ms'] === 'number'
      && typeof entry.context?.['required_ms'] === 'number'
      && typeof entry.context?.['maximum_total_words'] === 'number'
      && typeof entry.context?.['maximum_slot_words'] === 'number'
      && typeof entry.context?.['effective_maximum_slot_words'] === 'number'
      && typeof entry.context?.['current_word_count'] === 'number'
      && entry.context?.['repair_target'] === true)).toBe(true);
    expect(diagnostics.every((entry) => (
      Number(entry.context?.['current_word_count']) > Number(entry.context?.['maximum_slot_words'])
    ))).toBe(true);
    const multiSceneSlotIds = new Set(transport.resolutionContexts[0]!.content_slots
      .filter((slot) => slot.allowed_scene_ids.length > 1)
      .map((slot) => slot.slot_id));
    expect(diagnostics.some((entry) => multiSceneSlotIds.has(String(entry.context?.['slot_id'])))).toBe(true);
    const genericDiagnostic = diagnostics.find((entry) => multiSceneSlotIds.has(String(entry.context?.['slot_id'])))!;
    const genericSlotDiagnostics = diagnostics.filter((entry) => entry.context?.['slot_id'] === genericDiagnostic.context?.['slot_id']);
    expect(genericSlotDiagnostics.every((entry) => entry.context?.['effective_maximum_slot_words']
      === Math.min(...genericSlotDiagnostics.map((candidate) => Number(candidate.context?.['maximum_slot_words']))))).toBe(true);
    expect(result.report.diagnostics.map((entry) => entry.code)).not.toContain('gateway.output.subtitle_geometry_overflow');
  });

  it('répare sémantiquement un texte trop long puis franchit P1 temporal', async () => {
    const transport = new OfflineStructuredTransport('repair');
    const readingPolicy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: p23Style('signal'),
      pattern: pattern(),
      platform_presets: platforms(),
      font_resources: p14FontResources(p23Style('signal')),
      render_scale: 1,
      minimum_readable_size: 28,
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
    const repairPayload = JSON.parse(transport.requests.at(-1)!.input) as {
      previous_output: { content: Array<{ slot_id: string; scene_id?: string; text: string }> };
      repair_diagnostics: string;
    };
    const repairDiagnostics = JSON.parse(repairPayload.repair_diagnostics) as Array<{ context: Record<string, unknown> }>;
    const targetIds = new Set(repairDiagnostics.flatMap((entry) => (
      entry.context['repair_target'] === true ? [String(entry.context['slot_id'])] : []
    )));
    expect(targetIds.size).toBeGreaterThan(0);
    const before = transport.outputs[0] as { content: Array<{ slot_id: string; scene_id?: string; text: string }> };
    const after = transport.outputs[1] as { content: Array<{ slot_id: string; scene_id?: string; text: string }> };
    const stable = (entries: typeof before.content) => entries.filter((entry) => !targetIds.has(entry.slot_id)).map((entry) => ({
      ...entry,
      scene_id: entry.scene_id ?? null,
    }));
    expect(stable(after.content)).toEqual(stable(before.content));
    after.content.filter((entry) => targetIds.has(entry.slot_id)).forEach((entry) => {
      const maximum = Math.min(...repairDiagnostics
        .filter((diagnostic) => diagnostic.context['slot_id'] === entry.slot_id)
        .map((diagnostic) => Number(diagnostic.context['effective_maximum_slot_words'])));
      expect(entry.text.split(/\s+/u)).toHaveLength(maximum);
    });
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });

  it('épuise le repair lorsque le slot ciblé reste au-dessus de son maximum exact', async () => {
    const transport = new OfflineStructuredTransport('repair_still_long');
    const style = p23Style('signal');
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 1,
      reading_policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: style,
        pattern: pattern(),
        platform_presets: platforms(),
        font_resources: p14FontResources(style),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.report.failure_kind).toBe('repair_exhausted');
    expect(result.report.diagnostics.map((entry) => entry.code)).toContain('gateway.output.content_reading_budget_exceeded');
    expect(transport.resolutionCalls).toBe(2);
  });

  it('refuse une réparation qui modifie un slot valide non ciblé', async () => {
    const transport = new OfflineStructuredTransport('repair_changes_valid');
    const style = p23Style('signal');
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 1,
      reading_policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: style,
        pattern: pattern(),
        platform_presets: platforms(),
        font_resources: p14FontResources(style),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.map((entry) => entry.code)).toContain('gateway.output.repair_modified_valid_content');
  });

  it('rejette un contenu parlé qui dépasse la géométrie réelle des sous-titres', async () => {
    const transport = new OfflineStructuredTransport('subtitle_too_long');
    const style = p23Style('signal');
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 0,
      reading_policy: {
        profile: SHORT_FORM_DEFAULT_PROFILE,
        resolved_style: style,
        pattern: pattern(),
        platform_presets: platforms(),
        font_resources: p14FontResources(style),
        render_scale: 1,
        minimum_readable_size: 28,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.creative_resolution).toBeNull();
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'gateway.output.subtitle_geometry_overflow',
        severity: 'error',
        context: expect.objectContaining({ maximum_lines: 2, overflow_reason: expect.any(String) }),
      }),
    ]));
    expect(result.report.diagnostics.map((entry) => entry.code)).not.toContain('gateway.output.content_reading_budget_exceeded');
  });

  it('répare uniquement le sous-titre trop long puis franchit SubtitlePlan P1', async () => {
    const transport = new OfflineStructuredTransport('subtitle_repair');
    const style = p23Style('signal');
    const readingPolicy = {
      profile: SHORT_FORM_DEFAULT_PROFILE,
      resolved_style: style,
      pattern: pattern(),
      platform_presets: platforms(),
      font_resources: p14FontResources(style),
      render_scale: 1,
      minimum_readable_size: 28,
    };
    const result = await runCreativeGateway(p24Request(), {
      provider: new OpenAICreativeProvider({ transport }),
      max_repair_attempts: 1,
      reading_policy: readingPolicy,
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot, asset_ref: 'neutral_landscape', provenance: 'fixture' as const,
      })),
    });
    expect(result.ok).toBe(true);
    expect(transport.resolutionCalls).toBe(2);
    expect(transport.requests.at(-1)?.input).toContain('gateway.output.subtitle_geometry_overflow');
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.subtitle_plan.segments.length).toBeGreaterThan(0);
    expect(compiled.p1.preflight.issues.map((entry) => entry.code)).not.toContain('text.overflow');
  });
});
