import { describe, expect, it } from 'vitest';

import { hashCreativeDocument, type ContentSlot, type CreativeDiagnostic } from '@motion-engine/creative-core';

import type {
  CreativeGenerationRequest,
  ResolutionGenerationOutput,
  ResolutionRepairPatch,
} from './contracts.ts';
import { RESOLUTION_REPAIR_CONTRACT_VERSION, ResolutionRepairRequestSchema } from './contracts.ts';
import type { ProviderResolutionContext } from './provider.ts';
import {
  buildResolutionRepairRequest,
  mergeResolutionRepairPatch,
} from './resolution-repair.ts';

const request = {
  schema: 'creative-generation-request', schema_version: '0.1.0',
  request_id: 'request_repair', idempotency_key: 'a'.repeat(64), idea: 'Fixture repair',
  creative_goal: 'explain', target_duration_ms: 30_000, target_format: 'vertical_short',
  audience: { description: 'Public test', knowledge_level: 'mixed' },
  language: 'fr', locale: 'fr-FR', tone: ['precise'], desired_reaction: 'comprendre',
  factual_mode: 'creative', cta: { mode: 'none' }, constraints: [],
} satisfies CreativeGenerationRequest;

function slot(index: number): ContentSlot {
  return {
    id: `slot_${index}`, beat_id: `beat_${index}`, role: 'narration', required: true,
    language: 'fr', semantic_context: `Contexte ${index}`,
    constraints: { max_characters: 120, channels: ['spoken', 'on_screen'] },
    factual_requirement: 'none', status: 'unresolved',
  };
}

const slots = Array.from({ length: 7 }, (_, index) => slot(index + 1));
const resolutionContext: ProviderResolutionContext = {
  plan_id: 'plan_repair',
  content_slots: slots.map((entry, index) => ({
    slot_id: entry.id, beat_id: entry.beat_id, role: entry.role,
    semantic_context: entry.semantic_context, constraints: entry.constraints,
    required: entry.required, language: entry.language,
    factual_requirement: entry.factual_requirement, status: entry.status,
    allowed_scene_ids: index === 0 ? ['scene_1', 'scene_1_alternative'] : [`scene_${index + 1}`], reading_budget_applies: true,
    scene_time_budgets: [{
      scene_id: `scene_${index + 1}`, available_ms: 2_904, maximum_total_words: 11,
      maximum_recommended_characters_per_entry: 72,
    }],
    generic_time_budget: {
      scene_id: `scene_${index + 1}`, available_ms: 2_904, maximum_total_words: 11,
      maximum_recommended_characters_per_entry: 72,
    },
    subtitle_fit_applies: true,
    scene_subtitle_budgets: [{
      scene_id: `scene_${index + 1}`, preferred_size: 40, minimum_size: 30,
      maximum_lines: 2, available_width: 896, available_height: 321.6,
    }],
    generic_subtitle_budget: {
      scene_id: `scene_${index + 1}`, preferred_size: 40, minimum_size: 30,
      maximum_lines: 2, available_width: 896, available_height: 321.6,
    },
    generic_resolution_allowed: true,
  })),
  asset_intents: [],
};

const output: ResolutionGenerationOutput = {
  schema: 'creative-generation-output', schema_version: '0.1.0', stage: 'resolution',
  request_id: request.request_id, plan_id: resolutionContext.plan_id, provenance: 'provider_generated',
  content: slots.map((entry) => ({
    slot_id: entry.id, text: `Texte valide ${entry.id}`, provenance: 'provider_generated',
    uncertainty: 'none', source_required: false,
  })),
  asset_descriptions: [],
};

function violation(slotId: string, code: string, geometry = false): CreativeDiagnostic {
  return {
    code, severity: 'error', path: '$.content', message: 'Contenu invalide.',
    suggested_action: 'Raccourcir le contenu.',
    context: geometry
      ? {
          slot_id: slotId, scene_id: `scene_${slotId.slice(5)}`, repair_target: true,
          preferred_size: 40, minimum_size: 30, line_count: 3, maximum_lines: 2,
          available_width: 896, available_height: 321.6,
          current_word_count: 14, current_character_count: 92,
          content_relative_maximum_words: 8, maximum_recommended_characters: 54,
          concision_budget_basis: 'current_content_prefix_exact_fit',
        }
      : {
          slot_id: slotId, scene_id: `scene_${slotId.slice(5)}`, repair_target: true,
          available_scene_ms: 2_904, already_allocated_ms: 132, remaining_slot_ms: 2_772,
          effective_remaining_slot_ms: 2_772, current_required_ms: 4_032,
          current_word_count: 16, effective_maximum_slot_words: 11,
        },
  };
}

function repairRequest() {
  const built = buildResolutionRepairRequest({
    request, output,
    diagnostics: [
      violation('slot_1', 'gateway.output.content_reading_budget_exceeded'),
      violation('slot_1', 'gateway.output.subtitle_geometry_overflow', true),
      violation('slot_2', 'gateway.output.content_reading_budget_exceeded'),
    ],
    resolution_context: resolutionContext,
    content_slots: slots,
    attempt: 1,
  });
  if (!built) throw new Error('Repair request absent.');
  return built;
}

function validPatch(): ResolutionRepairPatch {
  const repair = repairRequest();
  return {
    schema: 'resolution-repair-patch', schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
    request_id: repair.request_id, plan_id: repair.plan_id,
    items: repair.targets.map((target) => ({
      target: target.target,
      replacement: {
        scene_id: target.target.scene_id,
        text: 'Texte bref', provenance: 'provider_generated', uncertainty: 'none', source_required: false,
      },
    })),
  };
}

function repairRequestWithFactualRequirement(requirement: ContentSlot['factual_requirement']) {
  const repair = repairRequest();
  return ResolutionRepairRequestSchema.parse({
    ...repair,
    targets: repair.targets.map((target) => ({
      ...target,
      content_constraints: { ...target.content_constraints, factual_requirement: requirement },
    })),
  });
}

function specificRepairRequest() {
  const specificOutput: ResolutionGenerationOutput = {
    ...output,
    content: output.content.map((entry) => entry.slot_id === 'slot_1'
      ? { ...entry, scene_id: 'scene_1' }
      : entry),
  };
  const built = buildResolutionRepairRequest({
    request,
    output: specificOutput,
    diagnostics: [violation('slot_1', 'gateway.output.content_reading_budget_exceeded')],
    resolution_context: resolutionContext,
    content_slots: slots,
    attempt: 1,
  });
  if (!built) throw new Error('Specific repair request absent.');
  return { request: built, output: specificOutput };
}

function specificPatch(): ResolutionRepairPatch {
  const specific = specificRepairRequest();
  return {
    schema: 'resolution-repair-patch', schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
    request_id: specific.request.request_id, plan_id: specific.request.plan_id,
    items: [{
      target: { slot_id: 'slot_1', scene_id: 'scene_1' },
      replacement: {
        scene_id: 'scene_1', text: 'Texte bref', provenance: 'provider_generated',
        uncertainty: 'none', source_required: false,
      },
    }],
  };
}

describe('Resolution targeted repair', () => {
  it('dérive exactement deux targets parmi sept slots et agrège les diagnostics', () => {
    const repair = repairRequest();
    expect(repair.targets.map((target) => target.target.slot_id)).toEqual(['slot_1', 'slot_2']);
    expect(repair.targets[0]?.diagnostics.map((entry) => entry.code)).toEqual([
      'gateway.output.content_reading_budget_exceeded',
      'gateway.output.subtitle_geometry_overflow',
    ]);
    expect(repair.targets[0]?.temporal_constraint?.maximum_slot_words).toBe(11);
    expect(repair.targets[0]?.subtitle_constraint?.maximum_lines).toBe(2);
    expect(repair.targets[0]?.subtitle_constraint?.content_relative_maximum_words).toBe(8);
    expect(repair.targets[0]?.effective_concision).toEqual({
      maximum_words: 8,
      temporal_maximum_words: 11,
      subtitle_maximum_words: 8,
      limiting_constraints: ['subtitle_geometry'],
    });
  });

  it('fusionne les deux patches sans modifier les cinq non-targets', () => {
    const merged = mergeResolutionRepairPatch(output, repairRequest(), validPatch());
    expect(merged.ok).toBe(true);
    const stableBefore = output.content.filter((entry) => !['slot_1', 'slot_2'].includes(entry.slot_id));
    const stableAfter = merged.output?.content.filter((entry) => !['slot_1', 'slot_2'].includes(entry.slot_id));
    expect(hashCreativeDocument(stableAfter)).toBe(hashCreativeDocument(stableBefore));
  });

  it('préserve la portée générique et donc toutes les scènes autorisées', () => {
    const requestForRepair = repairRequest();
    const merged = mergeResolutionRepairPatch(output, requestForRepair, validPatch());
    expect(merged.ok).toBe(true);
    expect(requestForRepair.targets[0]?.allowed_scene_ids).toEqual(['scene_1', 'scene_1_alternative']);
    expect(merged.output?.content.find((entry) => entry.slot_id === 'slot_1')?.scene_id).toBeUndefined();
  });

  it('refuse qu’une target générique devienne spécifique avant merge', () => {
    const patch = validPatch();
    patch.items[0] = {
      ...patch.items[0]!,
      replacement: { ...patch.items[0]!.replacement, scene_id: 'scene_1' },
    };
    const result = mergeResolutionRepairPatch(output, repairRequest(), patch);
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_scope_mismatch');
  });

  it('accepte une target spécifique uniquement lorsque sa scène reste identique', () => {
    const specific = specificRepairRequest();
    const result = mergeResolutionRepairPatch(specific.output, specific.request, specificPatch());
    expect(result.ok).toBe(true);
    expect(result.output?.content.find((entry) => entry.slot_id === 'slot_1')?.scene_id).toBe('scene_1');
  });

  it('refuse qu’une target spécifique devienne générique', () => {
    const specific = specificRepairRequest();
    const patch = specificPatch();
    patch.items[0] = { ...patch.items[0]!, replacement: { ...patch.items[0]!.replacement, scene_id: null } };
    const result = mergeResolutionRepairPatch(specific.output, specific.request, patch);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_scope_mismatch');
  });

  it('refuse qu’une target spécifique change vers une autre scène pourtant autorisée', () => {
    const specific = specificRepairRequest();
    const patch = specificPatch();
    patch.items[0] = {
      ...patch.items[0]!,
      replacement: { ...patch.items[0]!.replacement, scene_id: 'scene_1_alternative' },
    };
    const result = mergeResolutionRepairPatch(specific.output, specific.request, patch);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_scope_mismatch');
  });

  it.each([
    ['source_required', true],
    ['none', false],
  ] as const)('accepte source_required=%s lorsque le patch conserve la valeur canonique', (requirement, sourceRequired) => {
    const repair = repairRequestWithFactualRequirement(requirement);
    const patch = validPatch();
    patch.items = patch.items.map((item) => ({
      ...item,
      replacement: { ...item.replacement, source_required: sourceRequired },
    }));
    const result = mergeResolutionRepairPatch(output, repair, patch);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.output?.content
      .filter((entry) => ['slot_1', 'slot_2'].includes(entry.slot_id))
      .every((entry) => entry.source_required === sourceRequired)).toBe(true);
  });

  it.each([
    ['source_required', false, true],
    ['none', true, false],
  ] as const)(
    'rejette source_required=%s lorsqu’il diverge de la valeur canonique',
    (requirement, receivedSourceRequired, expectedSourceRequired) => {
      const repair = repairRequestWithFactualRequirement(requirement);
      const patch = validPatch();
      patch.items = patch.items.map((item) => ({
        ...item,
        replacement: { ...item.replacement, source_required: receivedSourceRequired },
      }));
      const result = mergeResolutionRepairPatch(output, repair, patch);
      expect(result.ok).toBe(false);
      expect(result.output).toBeNull();
      expect(result.diagnostics.every((entry) => entry.code === 'gateway.output.factual_requirement_changed')).toBe(true);
      expect(result.diagnostics[0]?.context).toMatchObject({ expected_source_required: expectedSourceRequired });
    },
  );

  it('rejette localement toute mutation de provenance canonique', () => {
    const patch = validPatch();
    patch.items = patch.items.map((item) => ({
      ...item,
      replacement: { ...item.replacement, provenance: 'fixture' },
    }));
    const result = mergeResolutionRepairPatch(output, repairRequest(), patch);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.every((entry) => entry.code === 'gateway.repair_patch.provenance_changed')).toBe(true);
  });

  it.each(['semantic_role', 'required', 'allowed_scene_ids'] as const)(
    'n’expose pas le champ canonique %s dans un patch',
    (field) => {
      const patch = validPatch();
      const first = patch.items[0]!;
      const result = mergeResolutionRepairPatch(output, repairRequest(), {
        ...patch,
        items: [{ ...first, [field]: field === 'required' ? false : 'mutation' }, ...patch.items.slice(1)],
      });
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.unknown_field');
    },
  );

  it('autorise uniquement text et uncertainty comme valeurs créatives de remplacement', () => {
    const patch = validPatch();
    patch.items = patch.items.map((item) => ({
      ...item,
      replacement: {
        ...item.replacement,
        text: 'Sens reformulé',
        uncertainty: 'low',
      },
    }));
    const result = mergeResolutionRepairPatch(output, repairRequest(), patch);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.output?.content
      .filter((entry) => ['slot_1', 'slot_2'].includes(entry.slot_id))
      .every((entry) => (
        entry.text === 'Sens reformulé'
        && entry.uncertainty === 'low'
        && entry.provenance === 'provider_generated'
        && entry.source_required === false
      ))).toBe(true);
  });

  it('refuse une troisième cible non autorisée', () => {
    const patch = validPatch();
    const extra = output.content[2]!;
    const result = mergeResolutionRepairPatch(output, repairRequest(), {
      ...patch,
      items: [...patch.items, {
        target: { slot_id: extra.slot_id, scene_id: null },
        replacement: { scene_id: null, text: 'Mutation', provenance: 'provider_generated', uncertainty: 'none', source_required: false },
      }],
    });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.target_not_allowed');
  });

  it('refuse une target inconnue', () => {
    const patch = validPatch();
    patch.items[0] = { ...patch.items[0]!, target: { slot_id: 'slot_unknown', scene_id: null } };
    const result = mergeResolutionRepairPatch(output, repairRequest(), patch);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.target_not_allowed');
  });

  it('refuse un scene_id de remplacement différent de la target', () => {
    const patch = validPatch();
    patch.items[0] = { ...patch.items[0]!, replacement: { ...patch.items[0]!.replacement, scene_id: 'scene_unknown' } };
    const result = mergeResolutionRepairPatch(output, repairRequest(), patch);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_scope_mismatch');
  });

  it('refuse une target manquante', () => {
    const patch = validPatch();
    const result = mergeResolutionRepairPatch(output, repairRequest(), { ...patch, items: patch.items.slice(0, 1) });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.target_missing');
  });

  it('refuse une target dupliquée', () => {
    const patch = validPatch();
    const result = mergeResolutionRepairPatch(output, repairRequest(), { ...patch, items: [...patch.items, patch.items[0]!] });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.duplicate_target');
  });

  it('refuse un patch vide lorsque des targets sont requises', () => {
    const patch = validPatch();
    const result = mergeResolutionRepairPatch(output, repairRequest(), { ...patch, items: [] });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.schema_invalid');
  });

  it('refuse toute propriété supplémentaire', () => {
    const patch = validPatch();
    const result = mergeResolutionRepairPatch(output, repairRequest(), { ...patch, shellCommand: 'echo unsafe' });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('gateway.repair_patch.unknown_field');
  });

  it('fusionne indépendamment de l’ordre accidentel des items', () => {
    const patch = validPatch();
    const left = mergeResolutionRepairPatch(output, repairRequest(), patch);
    const right = mergeResolutionRepairPatch(output, repairRequest(), { ...patch, items: [...patch.items].reverse() });
    expect(left.ok).toBe(true);
    expect(hashCreativeDocument(left.output)).toBe(hashCreativeDocument(right.output));
  });
});
