import {
  hashCreativeDocument,
  sortCreativeDiagnostics,
  type ContentSlot,
  type CreativeDiagnostic,
} from '@motion-engine/creative-core';

import {
  RESOLUTION_REPAIR_CONTRACT_VERSION,
  ResolutionGenerationOutputSchema,
  ResolutionRepairPatchSchema,
  ResolutionRepairRequestSchema,
  type CreativeGenerationRequest,
  type ResolutionContent,
  type ResolutionGenerationOutput,
  type ResolutionRepairPatch,
  type ResolutionRepairRequest,
  type ResolutionRepairTarget,
  type ResolutionRepairTargetId,
} from './contracts.ts';
import type { ProviderResolutionContext } from './provider.ts';

export function resolutionRepairTargetKey(target: ResolutionRepairTargetId): string {
  return `${target.slot_id}:${target.scene_id ?? '*'}`;
}

function outputTarget(entry: ResolutionContent): ResolutionRepairTargetId {
  return { slot_id: entry.slot_id, scene_id: entry.scene_id ?? null };
}

function canonicalSourceRequired(target: ResolutionRepairTarget): boolean {
  return target.content_constraints.factual_requirement === 'source_required';
}

function canonicalProvenance(
  base: ResolutionGenerationOutput,
  target: ResolutionRepairTarget,
): ResolutionContent['provenance'] {
  return target.previous_content?.provenance ?? base.provenance;
}

function repairDiagnostic(
  code: string,
  path: string,
  message: string,
  suggestedAction: string,
  context?: CreativeDiagnostic['context'],
): CreativeDiagnostic {
  return {
    code,
    severity: 'error',
    path,
    message,
    suggested_action: suggestedAction,
    ...(context === undefined ? {} : { context }),
  };
}

function numberContext(diagnostic: CreativeDiagnostic, key: string): number | null {
  const value = diagnostic.context?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function aggregateTemporal(diagnostics: readonly CreativeDiagnostic[]): ResolutionRepairTarget['temporal_constraint'] {
  const relevant = diagnostics.filter((entry) => entry.code === 'gateway.output.content_reading_budget_exceeded');
  if (relevant.length === 0) return null;
  const values = (key: string) => relevant.map((entry) => numberContext(entry, key)).filter((value): value is number => value !== null);
  const minimum = (key: string) => Math.min(...values(key));
  const maximum = (key: string) => Math.max(...values(key));
  return {
    available_scene_ms: minimum('available_scene_ms'),
    already_allocated_ms: maximum('already_allocated_ms'),
    remaining_slot_ms: minimum('effective_remaining_slot_ms'),
    current_required_ms: maximum('current_required_ms'),
    current_word_count: maximum('current_word_count'),
    maximum_slot_words: minimum('effective_maximum_slot_words'),
  };
}

function aggregateSubtitle(diagnostics: readonly CreativeDiagnostic[]): ResolutionRepairTarget['subtitle_constraint'] {
  const relevant = diagnostics.filter((entry) => entry.code === 'gateway.output.subtitle_geometry_overflow');
  if (relevant.length === 0) return null;
  const values = (key: string) => relevant.map((entry) => numberContext(entry, key)).filter((value): value is number => value !== null);
  const minimum = (key: string) => Math.min(...values(key));
  const maximum = (key: string) => Math.max(...values(key));
  return {
    current_word_count: maximum('current_word_count'),
    current_character_count: maximum('current_character_count'),
    current_line_count: maximum('line_count'),
    maximum_lines: minimum('maximum_lines'),
    preferred_size: maximum('preferred_size'),
    minimum_size: maximum('minimum_size'),
    available_width: minimum('available_width'),
    available_height: minimum('available_height'),
    content_relative_maximum_words: minimum('content_relative_maximum_words'),
    maximum_recommended_characters: minimum('maximum_recommended_characters'),
    budget_basis: 'current_content_prefix_exact_fit',
  };
}

function effectiveConcision(
  temporal: ResolutionRepairTarget['temporal_constraint'],
  subtitle: ResolutionRepairTarget['subtitle_constraint'],
): ResolutionRepairTarget['effective_concision'] {
  const candidates = [
    ...(temporal === null ? [] : [{ source: 'temporal' as const, value: temporal.maximum_slot_words }]),
    ...(subtitle === null ? [] : [{ source: 'subtitle_geometry' as const, value: subtitle.content_relative_maximum_words }]),
  ];
  if (candidates.length === 0) return null;
  const maximumWords = Math.min(...candidates.map((entry) => entry.value));
  return {
    maximum_words: maximumWords,
    temporal_maximum_words: temporal?.maximum_slot_words ?? null,
    subtitle_maximum_words: subtitle?.content_relative_maximum_words ?? null,
    limiting_constraints: candidates
      .filter((entry) => entry.value === maximumWords)
      .map((entry) => entry.source),
  };
}

function diagnosticTarget(
  diagnostic: CreativeDiagnostic,
  output: ResolutionGenerationOutput,
): ResolutionRepairTargetId | null {
  if (diagnostic.severity !== 'error' || diagnostic.context?.['repair_target'] !== true) return null;
  const slotId = diagnostic.context['slot_id'];
  if (typeof slotId !== 'string') return null;
  const entries = output.content.filter((entry) => entry.slot_id === slotId);
  const generic = entries.find((entry) => entry.scene_id === undefined);
  if (generic) return outputTarget(generic);
  const sceneId = diagnostic.context['scene_id'] ?? diagnostic.context['received_scene_id'];
  if (typeof sceneId === 'string') {
    const exact = entries.find((entry) => entry.scene_id === sceneId);
    if (exact) return outputTarget(exact);
    return { slot_id: slotId, scene_id: sceneId };
  }
  return entries.length === 1 ? outputTarget(entries[0]!) : null;
}

export interface BuildResolutionRepairRequestInput {
  readonly request: CreativeGenerationRequest;
  readonly output: ResolutionGenerationOutput;
  readonly diagnostics: readonly CreativeDiagnostic[];
  readonly resolution_context: ProviderResolutionContext;
  readonly content_slots: readonly ContentSlot[];
  readonly attempt: number;
}

export function buildResolutionRepairRequest(
  input: BuildResolutionRepairRequestInput,
): ResolutionRepairRequest | null {
  const grouped = new Map<string, { target: ResolutionRepairTargetId; diagnostics: CreativeDiagnostic[] }>();
  input.diagnostics.forEach((entry) => {
    const target = diagnosticTarget(entry, input.output);
    if (!target) return;
    const key = resolutionRepairTargetKey(target);
    const current = grouped.get(key) ?? { target, diagnostics: [] };
    current.diagnostics.push(entry);
    grouped.set(key, current);
  });
  if (grouped.size === 0) return null;

  const slotMap = new Map(input.content_slots.map((slot) => [slot.id, slot]));
  const contextMap = new Map(input.resolution_context.content_slots.map((slot) => [slot.slot_id, slot]));
  const targets = [...grouped.values()]
    .sort((left, right) => resolutionRepairTargetKey(left.target).localeCompare(resolutionRepairTargetKey(right.target), 'en'))
    .map(({ target, diagnostics }): ResolutionRepairTarget => {
      const slot = slotMap.get(target.slot_id);
      const context = contextMap.get(target.slot_id);
      if (!slot || !context) throw new Error(`Cible de repair absente du contexte canonique: ${target.slot_id}`);
      const previous = input.output.content.find((entry) => resolutionRepairTargetKey(outputTarget(entry)) === resolutionRepairTargetKey(target));
      const temporalConstraint = aggregateTemporal(diagnostics);
      const subtitleConstraint = aggregateSubtitle(diagnostics);
      return {
        target,
        previous_content: previous
          ? {
              scene_id: previous.scene_id ?? null,
              text: previous.text,
              provenance: previous.provenance,
              uncertainty: previous.uncertainty,
              source_required: previous.source_required,
            }
          : null,
        semantic_role: slot.role,
        semantic_context: slot.semantic_context,
        language: slot.language,
        locale: input.request.locale,
        required: slot.required,
        content_constraints: {
          max_characters: slot.constraints.max_characters,
          channels: [...slot.constraints.channels],
          factual_requirement: slot.factual_requirement,
        },
        allowed_scene_ids: [...context.allowed_scene_ids],
        generic_resolution_allowed: context.generic_resolution_allowed,
        diagnostics: sortCreativeDiagnostics(diagnostics),
        temporal_constraint: temporalConstraint,
        subtitle_constraint: subtitleConstraint,
        effective_concision: effectiveConcision(temporalConstraint, subtitleConstraint),
      };
    });

  return ResolutionRepairRequestSchema.parse({
    schema: 'resolution-repair-request',
    schema_version: RESOLUTION_REPAIR_CONTRACT_VERSION,
    request_id: input.request.request_id,
    plan_id: input.resolution_context.plan_id,
    attempt: input.attempt,
    targets,
  });
}

export interface MergeResolutionRepairResult {
  readonly ok: boolean;
  readonly output: ResolutionGenerationOutput | null;
  readonly patch: ResolutionRepairPatch | null;
  readonly diagnostics: readonly CreativeDiagnostic[];
}

export function mergeResolutionRepairPatch(
  base: ResolutionGenerationOutput,
  request: ResolutionRepairRequest,
  patchInput: unknown,
): MergeResolutionRepairResult {
  const parsed = ResolutionRepairPatchSchema.safeParse(patchInput);
  if (!parsed.success) {
    return {
      ok: false,
      output: null,
      patch: null,
      diagnostics: parsed.error.issues.map((issue) => repairDiagnostic(
        issue.code === 'unrecognized_keys' ? 'gateway.repair_patch.unknown_field' : 'gateway.repair_patch.schema_invalid',
        issue.path.reduce<string>((path, part) => typeof part === 'number' ? `${path}[${part}]` : `${path}.${String(part)}`, '$'),
        issue.message,
        'Produire uniquement le patch ciblé strict demandé.',
      )),
    };
  }
  const patch = parsed.data;
  const diagnostics: CreativeDiagnostic[] = [];
  if (patch.request_id !== request.request_id) diagnostics.push(repairDiagnostic(
    'gateway.repair_patch.request_mismatch', '$.request_id', 'Le patch ne cible pas la requête courante.',
    'Recopier exactement request_id depuis ResolutionRepairRequest.',
  ));
  if (patch.plan_id !== request.plan_id) diagnostics.push(repairDiagnostic(
    'gateway.repair_patch.plan_mismatch', '$.plan_id', 'Le patch ne cible pas le CreativePlan courant.',
    'Recopier exactement plan_id depuis ResolutionRepairRequest.',
  ));
  const allowed = new Map(request.targets.map((target) => [resolutionRepairTargetKey(target.target), target]));
  const seen = new Set<string>();
  patch.items.forEach((item, index) => {
    const key = resolutionRepairTargetKey(item.target);
    if (seen.has(key)) diagnostics.push(repairDiagnostic(
      'gateway.repair_patch.duplicate_target', `$.items[${index}].target`, 'Une cible est patchée plusieurs fois.',
      'Retourner exactement un item par cible autorisée.', { slot_id: item.target.slot_id, scene_id: item.target.scene_id },
    ));
    seen.add(key);
    const target = allowed.get(key);
    if (!target) diagnostics.push(repairDiagnostic(
      'gateway.repair_patch.target_not_allowed', `$.items[${index}].target`, 'Le patch cible un slot ou une scène absent de l’allowlist.',
      'Retourner uniquement les targets présentes dans ResolutionRepairRequest.',
      { slot_id: item.target.slot_id, scene_id: item.target.scene_id },
    ));
    if (target) {
      const replacementScene = item.replacement.scene_id;
      if (replacementScene !== target.target.scene_id) diagnostics.push(repairDiagnostic(
        'gateway.repair_scope_mismatch', `$.items[${index}].replacement.scene_id`,
        'Le patch tente de modifier la portée scène de la target canonique.',
        'Recopier exactement scene_id depuis target sans rendre une cible générique spécifique, ni l’inverse.',
        {
          slot_id: item.target.slot_id,
          target_scene_id: target.target.scene_id,
          replacement_scene_id: replacementScene,
          allowed_scene_ids: target.allowed_scene_ids.join(','),
        },
      ));
      else {
        if (replacementScene === null && !target.generic_resolution_allowed) diagnostics.push(repairDiagnostic(
          'gateway.repair_patch.generic_resolution_forbidden', `$.items[${index}].replacement.scene_id`,
          'Cette cible n’autorise pas de résolution générique.', 'Choisir une scène autorisée.',
          { slot_id: item.target.slot_id },
        ));
        if (replacementScene !== null && !target.allowed_scene_ids.includes(replacementScene)) diagnostics.push(repairDiagnostic(
          'gateway.repair_patch.scene_not_allowed', `$.items[${index}].replacement.scene_id`,
          'La scène de remplacement n’est pas autorisée pour ce ContentSlot.', 'Choisir une scène de allowed_scene_ids.',
          { slot_id: item.target.slot_id, scene_id: replacementScene, allowed_scene_ids: target.allowed_scene_ids.join(',') },
        ));
      }
      const expectedSourceRequired = canonicalSourceRequired(target);
      if (item.replacement.source_required !== expectedSourceRequired) diagnostics.push(repairDiagnostic(
        'gateway.output.factual_requirement_changed', `$.items[${index}].replacement.source_required`,
        'Le patch tente de modifier l’exigence factuelle canonique du ContentSlot.',
        'Recopier exactement source_required depuis la contrainte factuelle canonique de la target.',
        {
          slot_id: item.target.slot_id,
          scene_id: item.target.scene_id,
          expected_source_required: expectedSourceRequired,
          received_source_required: item.replacement.source_required,
          repair_target: true,
        },
      ));
      const expectedProvenance = canonicalProvenance(base, target);
      if (item.replacement.provenance !== expectedProvenance) diagnostics.push(repairDiagnostic(
        'gateway.repair_patch.provenance_changed', `$.items[${index}].replacement.provenance`,
        'Le patch tente de modifier la provenance canonique de la résolution.',
        'Conserver exactement la provenance de la sortie acceptée pendant le targeted repair.',
        {
          slot_id: item.target.slot_id,
          scene_id: item.target.scene_id,
          expected_provenance: expectedProvenance,
          received_provenance: item.replacement.provenance,
        },
      ));
    }
  });
  request.targets.forEach((target) => {
    const key = resolutionRepairTargetKey(target.target);
    if (!seen.has(key)) diagnostics.push(repairDiagnostic(
      'gateway.repair_patch.target_missing', '$.items', 'Une cible obligatoire ne possède aucun patch.',
      'Retourner exactement un item exploitable pour chaque target.',
      { slot_id: target.target.slot_id, scene_id: target.target.scene_id },
    ));
  });
  if (diagnostics.length > 0) return { ok: false, output: null, patch, diagnostics: sortCreativeDiagnostics(diagnostics) };

  const patchByKey = new Map(patch.items.map((item) => [resolutionRepairTargetKey(item.target), item]));
  const inserted = new Set<string>();
  const mergedContent: ResolutionContent[] = [];
  base.content.forEach((entry) => {
    const key = resolutionRepairTargetKey(outputTarget(entry));
    const item = patchByKey.get(key);
    if (!item) {
      mergedContent.push(entry);
      return;
    }
    if (inserted.has(key)) return;
    inserted.add(key);
    mergedContent.push({
      slot_id: item.target.slot_id,
      ...(item.replacement.scene_id === null ? {} : { scene_id: item.replacement.scene_id }),
      text: item.replacement.text,
      provenance: item.replacement.provenance,
      uncertainty: item.replacement.uncertainty,
      source_required: item.replacement.source_required,
    });
  });
  [...patchByKey.entries()]
    .filter(([key]) => !inserted.has(key))
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .forEach(([, item]) => mergedContent.push({
      slot_id: item.target.slot_id,
      ...(item.replacement.scene_id === null ? {} : { scene_id: item.replacement.scene_id }),
      text: item.replacement.text,
      provenance: item.replacement.provenance,
      uncertainty: item.replacement.uncertainty,
      source_required: item.replacement.source_required,
    }));

  const output = ResolutionGenerationOutputSchema.parse({ ...base, content: mergedContent });
  const lostScopes = request.targets.filter((target) => !output.content.some((entry) => (
    resolutionRepairTargetKey(outputTarget(entry)) === resolutionRepairTargetKey(target.target)
  )));
  if (lostScopes.length > 0) {
    return {
      ok: false,
      output: null,
      patch,
      diagnostics: lostScopes.map((target) => repairDiagnostic(
        'gateway.repair_scope_mismatch', '$.items',
        'Le résultat fusionné ne conserve pas la portée scène canonique de la target.',
        'Conserver exactement le slot_id et le scene_id de chaque target pendant le repair.',
        {
          slot_id: target.target.slot_id,
          target_scene_id: target.target.scene_id,
          allowed_scene_ids: target.allowed_scene_ids.join(','),
        },
      )),
    };
  }
  const targetKeys = new Set(request.targets.map((target) => resolutionRepairTargetKey(target.target)));
  const beforeStable = base.content.filter((entry) => !targetKeys.has(resolutionRepairTargetKey(outputTarget(entry))));
  const remainingHashes = new Map<string, number>();
  output.content.forEach((entry) => {
    const hash = hashCreativeDocument(entry);
    remainingHashes.set(hash, (remainingHashes.get(hash) ?? 0) + 1);
  });
  const stablePreserved = beforeStable.every((entry) => {
    const hash = hashCreativeDocument(entry);
    const count = remainingHashes.get(hash) ?? 0;
    if (count === 0) return false;
    remainingHashes.set(hash, count - 1);
    return true;
  });
  if (!stablePreserved || hashCreativeDocument(base.asset_descriptions) !== hashCreativeDocument(output.asset_descriptions)) {
    return {
      ok: false,
      output: null,
      patch,
      diagnostics: [repairDiagnostic(
        'gateway.repair_patch.non_target_mutation', '$.items',
        'Le merge a modifié un contenu ou un asset hors allowlist.',
        'Conserver canoniquement tous les non-targets.',
      )],
    };
  }
  return { ok: true, output, patch, diagnostics: [] };
}
