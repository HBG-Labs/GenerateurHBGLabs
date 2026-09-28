import type { CreativePlan } from './contracts/creative-plan.ts';
import { CREATIVE_PLAN_VERSION, CreativePlanSchema } from './contracts/creative-plan.ts';
import type { CreativeDiagnostic } from './contracts/diagnostics.ts';

export interface MigrationStep {
  readonly from: string;
  readonly to: string;
  readonly migrate: (document: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

export interface MigrationResult {
  readonly ok: boolean;
  readonly value?: Record<string, unknown>;
  readonly applied: readonly string[];
  readonly diagnostics: readonly CreativeDiagnostic[];
}

/** Aucun faux format historique : le registre est prêt, mais 0.1.0 est la première version réelle. */
export const CREATIVE_PLAN_MIGRATIONS: readonly MigrationStep[] = Object.freeze([]);

export function migrateVersionedCreativeDocument(
  input: Readonly<Record<string, unknown>>,
  targetVersion: string,
  steps: readonly MigrationStep[],
): MigrationResult {
  const initialVersion = input.schema_version;
  if (typeof initialVersion !== 'string') {
    return {
      ok: false,
      applied: [],
      diagnostics: [
        {
          code: 'version.missing',
          severity: 'error',
          path: '$.schema_version',
          message: 'La version du document est absente.',
          suggested_action: 'Fournir schema_version explicitement.',
        },
      ],
    };
  }
  let current: Record<string, unknown> = { ...input };
  let version = initialVersion;
  const applied: string[] = [];
  const visited = new Set<string>();
  while (version !== targetVersion) {
    if (visited.has(version)) {
      return {
        ok: false,
        value: current,
        applied,
        diagnostics: [
          {
            code: 'migration.cycle',
            severity: 'error',
            path: '$.schema_version',
            message: `Le registre de migration boucle sur la version « ${version} ».`,
            suggested_action: 'Corriger le registre de migration.',
          },
        ],
      };
    }
    visited.add(version);
    const step = steps.find((candidate) => candidate.from === version);
    if (!step) {
      return {
        ok: false,
        value: current,
        applied,
        diagnostics: [
          {
            code: 'migration.path_missing',
            severity: 'error',
            path: '$.schema_version',
            message: `Aucune migration n’est disponible de « ${version} » vers « ${targetVersion} ».`,
            context: { from: version, target: targetVersion },
            suggested_action: 'Ajouter une migration explicite ou utiliser une version supportée.',
          },
        ],
      };
    }
    current = step.migrate(Object.freeze({ ...current }));
    if (current.schema_version !== step.to) current = { ...current, schema_version: step.to };
    applied.push(`${step.from}->${step.to}`);
    version = step.to;
    if (applied.length > steps.length + 1) {
      return {
        ok: false,
        value: current,
        applied,
        diagnostics: [
          {
            code: 'migration.step_limit',
            severity: 'error',
            path: '$.schema_version',
            message: 'Le nombre maximal d’étapes de migration est dépassé.',
            suggested_action: 'Corriger le registre de migration.',
          },
        ],
      };
    }
  }
  return { ok: true, value: current, applied, diagnostics: [] };
}

export function migrateCreativePlan(input: unknown):
  | { readonly ok: true; readonly value: CreativePlan; readonly applied: readonly string[]; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly applied: readonly string[]; readonly diagnostics: readonly CreativeDiagnostic[] } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      applied: [],
      diagnostics: [
        {
          code: 'schema.document_expected',
          severity: 'error',
          path: '$',
          message: 'Un document CreativePlan JSON est attendu.',
          suggested_action: 'Fournir un objet JSON.',
        },
      ],
    };
  }
  const raw = input as Record<string, unknown>;
  const version = raw.schema_version;
  if (version !== CREATIVE_PLAN_VERSION && typeof version === 'string') {
    const migration = migrateVersionedCreativeDocument(raw, CREATIVE_PLAN_VERSION, CREATIVE_PLAN_MIGRATIONS);
    if (!migration.ok || !migration.value) return { ok: false, applied: migration.applied, diagnostics: migration.diagnostics };
    const parsed = CreativePlanSchema.safeParse(migration.value);
    if (parsed.success) return { ok: true, value: parsed.data, applied: migration.applied, diagnostics: [] };
  }
  if (version !== CREATIVE_PLAN_VERSION) {
    return {
      ok: false,
      applied: [],
      diagnostics: [
        {
          code: 'version.unsupported',
          severity: 'error',
          path: '$.schema_version',
          message: `Version CreativePlan non supportée : « ${String(version)} ».`,
          context: { supported: CREATIVE_PLAN_VERSION },
          suggested_action: 'Utiliser une version supportée ou fournir une migration explicite.',
        },
      ],
    };
  }
  const parsed = CreativePlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      applied: [],
      diagnostics: [
        {
          code: 'schema.invalid',
          severity: 'error',
          path: '$',
          message: 'Le document 0.1.0 ne respecte pas son schéma.',
          suggested_action: 'Corriger les erreurs de validation détaillées.',
        },
      ],
    };
  }
  return { ok: true, value: parsed.data, applied: [], diagnostics: [] };
}
