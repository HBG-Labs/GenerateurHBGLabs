import type { z } from 'zod';

import { hashCreativeDocument } from '../canonical.ts';
import type { CreativeDiagnostic } from '../contracts/diagnostics.ts';
import { reportStatus, sortCreativeDiagnostics, summarizeDiagnostics } from '../diagnostics.ts';
import { inspectCreativeInput } from '../security.ts';
import { PlannerInputSchema, type PlannerInput, type PlannerValidationReport } from './contracts.ts';
import type { PlannerLimits } from './limits.ts';
import { DEFAULT_PLANNER_LIMITS } from './limits.ts';

export interface PlannerInputValidationResult {
  readonly ok: boolean;
  readonly value?: PlannerInput;
  readonly report: PlannerValidationReport;
}

function issuePath(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) return '$';
  return issue.path.reduce<string>(
    (path, part) => (typeof part === 'number' ? `${path}[${part}]` : `${path}.${String(part)}`),
    '$',
  );
}

function structuralDiagnostics(error: z.ZodError): CreativeDiagnostic[] {
  return error.issues.map((issue) => ({
    code: issue.code === 'unrecognized_keys' ? 'planner.schema.unknown_field' : 'planner.schema.invalid',
    severity: 'error',
    path: issuePath(issue),
    message: issue.message,
    context: { zod_code: issue.code },
    suggested_action:
      issue.code === 'unrecognized_keys'
        ? 'Supprimer les propriétés non déclarées du PlannerInput.'
        : 'Corriger la valeur selon le contrat PlannerInput.',
  }));
}

function report(input: PlannerInput | null, diagnostics: readonly CreativeDiagnostic[]): PlannerValidationReport {
  const ordered = sortCreativeDiagnostics(diagnostics);
  const status = reportStatus(ordered);
  return {
    schema: 'planner-validation-report',
    schema_version: '0.1.0',
    status,
    eligible_for_planning: status !== 'fail',
    planner_input_sha256: input ? hashCreativeDocument(input) : null,
    diagnostics: ordered,
    summary: summarizeDiagnostics(ordered),
  };
}

function inspectPlannerInput(input: unknown, limits: PlannerLimits): CreativeDiagnostic[] {
  const inspection = inspectCreativeInput(input, {
    max_json_bytes: limits.max_input_json_bytes,
    max_depth: limits.max_depth,
    max_nodes: limits.max_nodes,
    max_string_characters: limits.max_string_characters,
    max_scenes: limits.max_scenes,
    max_duration_seconds: limits.max_duration_ms / 1_000,
    max_script_characters: limits.max_provided_content_characters,
    max_on_screen_characters_per_scene: limits.max_string_characters,
    max_asset_intents: limits.max_asset_intents,
    max_elements_per_scene: limits.max_beats,
    max_content_items_per_scene: limits.max_content_slots,
    max_narrative_sections: limits.max_beats,
  });
  return inspection.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    code: diagnostic.code.replace(/^security\./u, 'planner.security.'),
    message: diagnostic.message.replace('CreativePlan', 'PlannerInput'),
  }));
}

function semanticDiagnostics(input: PlannerInput, limits: PlannerLimits): CreativeDiagnostic[] {
  const diagnostics: CreativeDiagnostic[] = [];
  const add = (diagnostic: CreativeDiagnostic) => diagnostics.push(diagnostic);

  if (input.target_duration_ms < limits.min_duration_ms || input.target_duration_ms > limits.max_duration_ms) {
    add({
      code: 'planner.duration_out_of_bounds',
      severity: 'error',
      path: '$.target_duration_ms',
      message: `La durée doit rester entre ${limits.min_duration_ms} et ${limits.max_duration_ms} ms.`,
      context: { actual: input.target_duration_ms, min: limits.min_duration_ms, max: limits.max_duration_ms },
      suggested_action: 'Choisir une durée compatible avec les limites du planner.',
    });
  }
  if (input.constraints.length > limits.max_constraints) {
    add({
      code: 'planner.limit.constraints_exceeded',
      severity: 'error',
      path: '$.constraints',
      message: 'Le nombre de contraintes dépasse la limite du planner.',
      context: { actual: input.constraints.length, limit: limits.max_constraints },
      suggested_action: 'Réduire ou consolider les contraintes.',
    });
  }
  if (input.provided_content.length > limits.max_provided_content) {
    add({
      code: 'planner.limit.provided_content_exceeded',
      severity: 'error',
      path: '$.provided_content',
      message: 'Le nombre de contenus fournis dépasse la limite du planner.',
      context: { actual: input.provided_content.length, limit: limits.max_provided_content },
      suggested_action: 'Réduire les contenus fournis.',
    });
  }
  const providedCharacters = input.provided_content.reduce((sum, content) => sum + [...content.text].length, 0);
  if (providedCharacters > limits.max_provided_content_characters) {
    add({
      code: 'planner.limit.content_characters_exceeded',
      severity: 'error',
      path: '$.provided_content',
      message: 'Le volume de contenu fourni dépasse la limite du planner.',
      context: { actual: providedCharacters, limit: limits.max_provided_content_characters },
      suggested_action: 'Réduire ou segmenter le contenu fourni.',
    });
  }
  if (!input.locale.toLowerCase().startsWith(`${input.language.toLowerCase()}-`) && input.locale !== input.language) {
    add({
      code: 'planner.locale_language_mismatch',
      severity: 'error',
      path: '$.locale',
      message: `La locale « ${input.locale} » ne correspond pas à la langue « ${input.language} ».`,
      suggested_action: 'Aligner language et locale sans demander au planner de traduire.',
    });
  }
  if (input.cta.mode === 'none' && input.cta.text !== undefined) {
    add({
      code: 'planner.cta_incompatible',
      severity: 'error',
      path: '$.cta',
      message: 'Un CTA désactivé ne peut pas contenir de texte.',
      suggested_action: 'Supprimer le texte ou choisir soft/explicit.',
    });
  }

  const structuralIds = [...input.constraints.map((constraint) => constraint.id), ...input.provided_content.map((content) => content.id)];
  const duplicates = structuralIds.filter((id, index) => structuralIds.indexOf(id) !== index);
  [...new Set(duplicates)].forEach((id) =>
    add({
      code: 'planner.id.duplicate',
      severity: 'error',
      path: '$',
      node_id: id,
      message: `L’identifiant « ${id} » est déclaré plusieurs fois dans PlannerInput.`,
      suggested_action: 'Attribuer un identifiant stable unique.',
    }),
  );

  input.provided_content.forEach((content, index) => {
    if (new Set(content.channels).size !== content.channels.length) {
      add({
        code: 'planner.content_channel_duplicate',
        severity: 'error',
        path: `$.provided_content[${index}].channels`,
        node_id: content.id,
        message: 'Un canal de contenu est répété.',
        suggested_action: 'Conserver chaque canal une seule fois.',
      });
    }
  });

  const requiredRoles = new Set(input.constraints.filter((item) => item.kind === 'require_role').map((item) => item.role));
  const forbiddenRoles = new Set(input.constraints.filter((item) => item.kind === 'forbid_role').map((item) => item.role));
  for (const role of requiredRoles) {
    if (!forbiddenRoles.has(role)) continue;
    add({
      code: 'planner.constraint.role_conflict',
      severity: 'error',
      path: '$.constraints',
      message: `Le rôle « ${role} » est simultanément requis et interdit.`,
      context: { role },
      suggested_action: 'Supprimer l’une des contraintes contradictoires.',
    });
  }
  const minScenes = input.constraints.filter((item) => item.kind === 'min_scenes').map((item) => item.value);
  const maxScenes = input.constraints.filter((item) => item.kind === 'max_scenes').map((item) => item.value);
  if (minScenes.length > 0 && maxScenes.length > 0 && Math.max(...minScenes) > Math.min(...maxScenes)) {
    add({
      code: 'planner.constraint.scene_count_conflict',
      severity: 'error',
      path: '$.constraints',
      message: 'La contrainte minimale de scènes dépasse la contrainte maximale.',
      suggested_action: 'Rendre les bornes de scènes cohérentes.',
    });
  }
  const requiresNarration = input.constraints.some((item) => item.kind === 'require_narration');
  const forbidsNarration = input.constraints.some((item) => item.kind === 'forbid_narration');
  if (requiresNarration && forbidsNarration) {
    add({
      code: 'planner.constraint.narration_conflict',
      severity: 'error',
      path: '$.constraints',
      message: 'La narration est simultanément requise et interdite.',
      suggested_action: 'Supprimer l’une des contraintes contradictoires.',
    });
  }
  if (forbidsNarration && input.provided_content.some((content) => content.channels.includes('spoken'))) {
    add({
      code: 'planner.constraint.narration_content_conflict',
      severity: 'error',
      path: '$.provided_content',
      message: 'Du contenu parlé est fourni alors que la narration est interdite.',
      suggested_action: 'Retirer le canal spoken ou autoriser la narration.',
    });
  }
  const requiredAssets = new Set(
    input.constraints.filter((item) => item.kind === 'require_asset').map((item) => item.asset_kind),
  );
  const forbiddenAssets = new Set(
    input.constraints.filter((item) => item.kind === 'forbid_asset').map((item) => item.asset_kind),
  );
  for (const kind of requiredAssets) {
    if (!forbiddenAssets.has(kind)) continue;
    add({
      code: 'planner.constraint.asset_conflict',
      severity: 'error',
      path: '$.constraints',
      message: `L’asset « ${kind} » est simultanément requis et interdit.`,
      context: { asset_kind: kind },
      suggested_action: 'Supprimer l’une des contraintes contradictoires.',
    });
  }
  if (requiredAssets.has('none') && [...requiredAssets].some((kind) => kind !== 'none')) {
    add({
      code: 'planner.constraint.asset_none_conflict',
      severity: 'error',
      path: '$.constraints',
      message: '« no asset » est requis en même temps qu’un asset concret.',
      suggested_action: 'Choisir soit aucun asset, soit les assets nécessaires.',
    });
  }
  return diagnostics;
}

export function validatePlannerInput(
  input: unknown,
  limits: PlannerLimits = DEFAULT_PLANNER_LIMITS,
): PlannerInputValidationResult {
  const securityDiagnostics = inspectPlannerInput(input, limits);
  if (securityDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, report: report(null, securityDiagnostics) };
  }
  const parsed = PlannerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, report: report(null, structuralDiagnostics(parsed.error)) };
  const diagnostics = semanticDiagnostics(parsed.data, limits);
  const validationReport = report(parsed.data, diagnostics);
  return {
    ok: validationReport.status !== 'fail',
    value: parsed.data,
    report: validationReport,
  };
}
