import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import {
  RESOLUTION_REPAIR_CONTRACT_VERSION,
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
  readonly mode: 'valid' | 'too_long' | 'repair' | 'repair_still_long' | 'repair_changes_valid' | 'subtitle_too_long' | 'subtitle_repair' | 'subtitle_repair_still_long' | 'subtitle_same_words_wide' | 'subtitle_triple_repair' | 'combined_repair' = 'valid';
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

  constructor(mode: 'valid' | 'too_long' | 'repair' | 'repair_still_long' | 'repair_changes_valid' | 'subtitle_too_long' | 'subtitle_repair' | 'subtitle_repair_still_long' | 'subtitle_same_words_wide' | 'subtitle_triple_repair' | 'combined_repair' = 'valid') {
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
    if (input.schema_name === 'creative_resolution_repair_patch') {
      this.resolutionCalls += 1;
      const repair = payload['resolution_repair_request'] as {
        request_id: string;
        plan_id: string;
        targets: Array<{
          target: { slot_id: string; scene_id: string | null };
          previous_content: {
            text: string;
            provenance: 'provider_generated';
            uncertainty: 'none' | 'low' | 'medium' | 'high' | 'unknown';
            source_required: boolean;
          } | null;
          temporal_constraint: { maximum_slot_words: number } | null;
          subtitle_constraint: {
            content_relative_maximum_words: number;
            maximum_recommended_characters: number;
          } | null;
          effective_concision: { maximum_words: number } | null;
        }>;
      };
      const items = repair.targets.map((target) => {
        const maximum = target.effective_concision?.maximum_words
          ?? target.temporal_constraint?.maximum_slot_words
          ?? target.subtitle_constraint?.content_relative_maximum_words;
        const wordCount = maximum === undefined
          ? 2
          : Math.max(1, maximum + (['repair_still_long', 'subtitle_repair_still_long'].includes(this.mode) ? 1 : 0));
        const replacementWord = this.mode === 'subtitle_repair_still_long' ? 'ÉLECTRICITÉ' : 'mot';
        const maximumCharacters = target.subtitle_constraint?.maximum_recommended_characters;
        const replacementText = this.mode === 'subtitle_same_words_wide' && maximumCharacters !== undefined
          ? (() => {
              const shortWords = Array.from({ length: Math.max(0, wordCount - 1) }, () => 'i');
              const reservedCharacters = shortWords.length * 2;
              return ['W'.repeat(Math.max(1, maximumCharacters - reservedCharacters)), ...shortWords].join(' ');
            })()
          : Array.from({ length: wordCount }, () => replacementWord).join(' ');
        return {
          target: target.target,
          replacement: {
            scene_id: target.target.scene_id,
            text: replacementText,
            provenance: 'provider_generated' as const,
            uncertainty: target.previous_content?.uncertainty ?? 'none' as const,
            source_required: target.previous_content?.source_required ?? false,
          },
        };
      });
      if (this.mode === 'repair_changes_valid') {
        const initial = this.outputs[0] as { content: Array<{
          slot_id: string;
          scene_id?: string;
          text: string;
          provenance: 'provider_generated';
          uncertainty: 'none' | 'low' | 'medium' | 'high' | 'unknown';
          source_required: boolean;
        }> };
        const allowed = new Set(repair.targets.map((target) => target.target.slot_id));
        const stable = initial.content.find((entry) => !allowed.has(entry.slot_id));
        if (stable) items.push({
          target: { slot_id: stable.slot_id, scene_id: stable.scene_id ?? null },
          replacement: {
            scene_id: stable.scene_id ?? null,
            text: `${stable.text} modifié`,
            provenance: stable.provenance,
            uncertainty: stable.uncertainty,
            source_required: stable.source_required,
          },
        });
      }
      const patch = {
        schema: 'resolution-repair-patch', schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
        request_id: repair.request_id, plan_id: repair.plan_id, items,
      };
      this.outputs.push(patch);
      return Promise.resolve({ response_id: 'offline_repair', model: 'gpt-6-luna', usage: USAGE, output: patch });
    }
    const context = payload['resolution_context'] as OfflineStructuredTransport['resolutionContexts'][number];
    this.resolutionCalls += 1;
    this.resolutionContexts.push(context);
    const mustBeLong = this.mode === 'too_long' || this.mode === 'combined_repair'
      || (['repair', 'repair_still_long', 'repair_changes_valid'].includes(this.mode) && this.resolutionCalls === 1);
    const mustOverflowSubtitle = this.mode === 'subtitle_too_long' || this.mode === 'combined_repair'
      || (['subtitle_repair', 'subtitle_repair_still_long', 'subtitle_same_words_wide', 'subtitle_triple_repair'].includes(this.mode)
        && this.resolutionCalls === 1);
    const combinedTarget = [...context.content_slots].filter((slot) => (
      slot.constraints.channels.includes('spoken') && slot.constraints.channels.includes('on_screen')
    )).sort((left, right) => (
      (left.generic_time_budget?.maximum_total_words ?? Number.POSITIVE_INFINITY)
      - (right.generic_time_budget?.maximum_total_words ?? Number.POSITIVE_INFINITY)
    ))[0]?.slot_id;
    const subtitleTarget = this.mode === 'combined_repair' ? combinedTarget : context.content_slots.find((slot) => (
      slot.constraints.channels.includes('spoken') && !slot.constraints.channels.includes('on_screen')
    ))?.slot_id;
    const spokenSlots = context.content_slots.filter((slot) => slot.constraints.channels.includes('spoken'));
    const multiSceneSpoken = spokenSlots.find((slot) => slot.allowed_scene_ids.length > 1);
    const tripleSubtitleSlots = [
      ...(multiSceneSpoken === undefined ? [] : [multiSceneSpoken]),
      ...spokenSlots.filter((slot) => slot.slot_id !== multiSceneSpoken?.slot_id),
    ].slice(0, 3);
    const subtitleTargets = new Set(this.mode === 'subtitle_triple_repair'
      ? tripleSubtitleSlots.map((slot) => slot.slot_id)
      : subtitleTarget === undefined ? [] : [subtitleTarget]);
    const tripleSubtitleWords = ['ÉLECTRICITÉ', 'WWWWWWWW', 'MMMMMM'] as const;
    const temporalTarget = this.mode === 'combined_repair' ? combinedTarget : context.content_slots.find((slot) => (
      slot.allowed_scene_ids.length > 1
      && slot.constraints.channels.includes('on_screen')
      && !slot.constraints.channels.includes('spoken')
    ))?.slot_id ?? context.content_slots.find((slot) => (
      slot.allowed_scene_ids.length > 1 && slot.constraints.channels.includes('on_screen')
    ))?.slot_id ?? context.content_slots.find((slot) => (
      slot.constraints.channels.includes('on_screen') && !slot.constraints.channels.includes('spoken')
    ))?.slot_id ?? context.content_slots.find((slot) => slot.constraints.channels.includes('on_screen'))?.slot_id;
    const content = context.content_slots.map((slot) => ({
      slot_id: slot.slot_id, scene_id: null,
      text: (this.mode === 'combined_repair' && slot.slot_id === combinedTarget
        ? (() => {
            const wordCount = (slot.generic_time_budget?.maximum_total_words ?? 8) + 1;
            const tail = Array.from({ length: wordCount - 1 }, () => 'mot');
            const firstLength = Math.max(20, slot.constraints.max_characters - tail.join(' ').length - 1);
            return ['W'.repeat(firstLength), ...tail].join(' ');
          })()
        : mustOverflowSubtitle && subtitleTargets.has(slot.slot_id)
        ? Array.from(
            { length: 18 },
            () => this.mode === 'subtitle_triple_repair'
              ? tripleSubtitleWords[tripleSubtitleSlots.findIndex((target) => target.slot_id === slot.slot_id)]
                ?? 'ÉLECTRICITÉ'
              : 'ÉLECTRICITÉ',
          ).join(' ').slice(0, slot.constraints.max_characters)
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
      asset_descriptions: context.asset_intents.map((asset) => ({
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
      resolution_repair_request: {
        targets: Array<{
          target: { slot_id: string; scene_id: string | null };
          temporal_constraint: { maximum_slot_words: number } | null;
        }>;
      };
    };
    const targetIds = new Set(repairPayload.resolution_repair_request.targets.map((entry) => entry.target.slot_id));
    expect(targetIds.size).toBeGreaterThan(0);
    const before = transport.outputs[0] as { content: Array<{ slot_id: string; scene_id?: string; text: string }> };
    const after = result.snapshot!.resolution_output;
    const stable = (entries: Array<{ slot_id: string; scene_id?: string | undefined; text: string }>) => entries.filter((entry) => !targetIds.has(entry.slot_id)).map((entry) => ({
      ...entry,
      scene_id: entry.scene_id ?? null,
    }));
    expect(stable(after.content)).toEqual(stable(before.content));
    after.content.filter((entry) => targetIds.has(entry.slot_id)).forEach((entry) => {
      const maximum = Math.min(...repairPayload.resolution_repair_request.targets
        .filter((target) => target.target.slot_id === entry.slot_id)
        .map((target) => target.temporal_constraint?.maximum_slot_words ?? Number.POSITIVE_INFINITY));
      expect(entry.text.split(/\s+/u)).toHaveLength(maximum);
    });
    expect(result.report.resolution_repair?.patched_targets).toHaveLength(targetIds.size);
    expect(result.snapshot?.provenance.resolution_repair?.occurred).toBe(true);
    expect(result.report.usage_by_stage).toMatchObject({
      planning: { request_count: 1 },
      initial_resolution: { request_count: 1 },
      resolution_repair: { request_count: 1 },
    });
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
    const callsBeforeReplay = transport.calls;
    const replayedGateway = replayCreativeGateway(result.snapshot, { reading_policy: readingPolicy });
    const replayed = compileP24GatewayResult(replayedGateway, 'signal');
    expect(transport.calls).toBe(callsBeforeReplay);
    expect(canonicalJson(replayedGateway.planning?.creative_plan)).toBe(canonicalJson(result.planning?.creative_plan));
    expect(canonicalJson(replayedGateway.creative_resolution)).toBe(canonicalJson(result.creative_resolution));
    expect(replayed.creative_compile.report.hashes.motion_spec).toBe(compiled.creative_compile.report.hashes.motion_spec);
    expect(replayed.p1.hashes.render_plan).toBe(compiled.p1.hashes.render_plan);
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
    expect(transport.requests.at(-1)?.schema.safeParse(transport.outputs.at(-1)).success).toBe(true);
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
    expect(result.report.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.target_not_allowed');
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
    const repairPayload = JSON.parse(transport.requests.at(-1)!.input) as {
      resolution_repair_request: {
        targets: Array<{
          subtitle_constraint: {
            current_word_count: number;
            current_character_count: number;
            current_line_count: number;
            maximum_lines: number;
            content_relative_maximum_words: number;
            maximum_recommended_characters: number;
            budget_basis: string;
          } | null;
          effective_concision: { maximum_words: number; limiting_constraints: string[] } | null;
        }>;
      };
    };
    const subtitleConstraint = repairPayload.resolution_repair_request.targets[0]?.subtitle_constraint;
    expect(subtitleConstraint).toMatchObject({
      maximum_lines: 2,
      budget_basis: 'current_content_prefix_exact_fit',
    });
    expect(subtitleConstraint?.current_line_count).toBeGreaterThan(2);
    expect(subtitleConstraint?.content_relative_maximum_words).toBeGreaterThan(0);
    expect(subtitleConstraint?.content_relative_maximum_words).toBeLessThan(subtitleConstraint?.current_word_count ?? 0);
    expect(subtitleConstraint?.maximum_recommended_characters).toBeLessThan(subtitleConstraint?.current_character_count ?? 0);
    expect(repairPayload.resolution_repair_request.targets[0]?.effective_concision).toMatchObject({
      maximum_words: subtitleConstraint?.content_relative_maximum_words,
      limiting_constraints: ['subtitle_geometry'],
    });
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.subtitle_plan.segments.length).toBeGreaterThan(0);
    expect(compiled.p1.preflight.issues.map((entry) => entry.code)).not.toContain('text.overflow');
  });

  it('rejette après patch un texte au bon nombre de mots mais toujours trop large', async () => {
    const transport = new OfflineStructuredTransport('subtitle_same_words_wide');
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
    expect(transport.requests.at(-1)?.schema.safeParse(transport.outputs.at(-1)).success).toBe(true);
    expect(result.report.diagnostics.map((entry) => entry.code)).toContain('gateway.output.subtitle_geometry_overflow');
  });

  it('rejette un patch géométrique qui dépasse le budget de concision annoncé', async () => {
    const transport = new OfflineStructuredTransport('subtitle_repair_still_long');
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
    expect(result.report.diagnostics.map((entry) => entry.code)).toContain('gateway.output.subtitle_geometry_overflow');
  });

  it('répare trois overflows géométriques ciblés puis atteint RenderPlan sans mutation hors cible', async () => {
    const transport = new OfflineStructuredTransport('subtitle_triple_repair');
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
    expect(result.ok, JSON.stringify(result.report.diagnostics)).toBe(true);
    const repairPayload = JSON.parse(transport.requests.at(-1)!.input) as {
      resolution_repair_request: {
        targets: Array<{
          target: { slot_id: string; scene_id: string | null };
          allowed_scene_ids: string[];
          subtitle_constraint: {
            content_relative_maximum_words: number;
            maximum_recommended_characters: number;
          } | null;
          effective_concision: { maximum_words: number } | null;
        }>;
      };
    };
    const targets = repairPayload.resolution_repair_request.targets;
    expect(targets).toHaveLength(3);
    expect(targets.every((entry) => (
      entry.subtitle_constraint !== null
      && entry.subtitle_constraint.content_relative_maximum_words > 0
      && entry.effective_concision?.maximum_words === entry.subtitle_constraint.content_relative_maximum_words
    ))).toBe(true);
    expect(new Set(targets.map((entry) => (
      entry.subtitle_constraint?.maximum_recommended_characters
    ))).size).toBe(3);
    const repairTransportRequest = transport.requests.at(-1)!;
    const repairPatch = transport.outputs.at(-1);
    expect(repairTransportRequest.schema.safeParse(repairPatch).success).toBe(true);
    expect(result.report.resolution_repair?.initial_invalid_targets).toHaveLength(3);
    expect(result.report.resolution_repair?.patched_targets).toHaveLength(3);
    const genericMultiScene = targets.find((entry) => (
      entry.target.scene_id === null && entry.allowed_scene_ids.length > 1
    ));
    expect(genericMultiScene).toBeDefined();
    const targetIds = new Set(targets.map((entry) => entry.target.slot_id));
    const initial = transport.outputs[0] as { content: Array<{ slot_id: string; scene_id?: string | null; text: string }> };
    const stableBefore = initial.content.filter((entry) => !targetIds.has(entry.slot_id)).map((entry) => ({
      ...entry, scene_id: entry.scene_id ?? undefined,
    }));
    const stableAfter = result.snapshot!.resolution_output.content.filter((entry) => !targetIds.has(entry.slot_id)).map((entry) => ({
      ...entry, scene_id: entry.scene_id ?? undefined,
    }));
    expect(stableAfter).toEqual(stableBefore);
    expect(result.snapshot!.resolution_output.content.find((entry) => (
      entry.slot_id === genericMultiScene?.target.slot_id
    ))?.scene_id).toBeUndefined();
    expect(result.report.diagnostics.map((entry) => entry.code))
      .not.toContain('gateway.output.required_scene_resolution_missing');
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(compiled.p1.preflight.issues.map((entry) => entry.code)).not.toContain('text.overflow');
    const callsBeforeReplay = transport.calls;
    const replayedGateway = replayCreativeGateway(result.snapshot, { reading_policy: readingPolicy });
    const replayed = compileP24GatewayResult(replayedGateway, 'signal');
    expect(transport.calls).toBe(callsBeforeReplay);
    expect(canonicalJson(replayedGateway.creative_resolution)).toBe(canonicalJson(result.creative_resolution));
    expect(replayed.creative_compile.report.hashes.motion_spec).toBe(compiled.creative_compile.report.hashes.motion_spec);
    expect(replayed.p1.hashes.render_plan).toBe(compiled.p1.hashes.render_plan);
  });

  it('répare en un patch une target violant simultanément temps et géométrie', async () => {
    const transport = new OfflineStructuredTransport('combined_repair');
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
      resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
        asset_slot: asset.slot, asset_ref: 'neutral_landscape', provenance: 'fixture' as const,
      })),
    });
    expect(result.ok, JSON.stringify(result.report.diagnostics)).toBe(true);
    const repairPayload = JSON.parse(transport.requests.at(-1)!.input) as {
      resolution_repair_request: { targets: Array<{ diagnostics: Array<{ code: string }> }> };
    };
    expect(repairPayload.resolution_repair_request.targets).toHaveLength(1);
    expect([...new Set(repairPayload.resolution_repair_request.targets[0]?.diagnostics.map((entry) => entry.code))]).toEqual([
      'gateway.output.content_reading_budget_exceeded',
      'gateway.output.subtitle_geometry_overflow',
    ]);
    const compiled = compileP24GatewayResult(result, 'signal');
    expect(compiled.p1.preflight.summary?.errors ?? 0).toBe(0);
  });
});
