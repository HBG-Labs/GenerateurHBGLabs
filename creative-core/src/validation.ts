import type { z } from 'zod';

import { hashCreativeDocument } from './canonical.ts';
import { CreativePlanSchema, type CreativePlan } from './contracts/creative-plan.ts';
import type { CreativeDiagnostic, CreativePreflightReport } from './contracts/diagnostics.ts';
import { reportStatus, sortCreativeDiagnostics, summarizeDiagnostics } from './diagnostics.ts';
import type { CreativeLimits } from './limits.ts';
import { DEFAULT_CREATIVE_LIMITS } from './limits.ts';
import { DEFAULT_CREATIVE_PREFLIGHT_POLICY, runCreativePreflight } from './preflight.ts';
import { inspectCreativeInput } from './security.ts';
import { CREATIVE_PLAN_MIGRATIONS, migrateVersionedCreativeDocument } from './versioning.ts';

export interface CreativeValidationOptions {
  readonly limits?: CreativeLimits;
  readonly require_hook?: boolean;
  readonly migrate?: boolean;
}

export interface CreativeValidationResult {
  readonly ok: boolean;
  readonly value?: CreativePlan;
  readonly canonical_sha256?: string;
  readonly migrations_applied: readonly string[];
  readonly report: CreativePreflightReport;
}

function zodPath(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) return '$';
  return issue.path.reduce<string>((path, part) => {
    if (typeof part === 'number') return `${path}[${part}]`;
    return `${path}.${String(part)}`;
  }, '$');
}

function zodDiagnostics(error: z.ZodError): CreativeDiagnostic[] {
  return error.issues.map((issue) => {
    const unknown = issue.code === 'unrecognized_keys';
    return {
      code: unknown ? 'schema.unknown_field' : 'schema.invalid',
      severity: 'error',
      path: zodPath(issue),
      message: issue.message,
      context: { zod_code: issue.code },
      suggested_action: unknown ? 'Supprimer les propriétés non déclarées.' : 'Corriger la valeur selon le contrat CreativePlan.',
    };
  });
}

function failedReport(diagnostics: readonly CreativeDiagnostic[]): CreativePreflightReport {
  const ordered = sortCreativeDiagnostics(diagnostics);
  return {
    schema: 'creative-preflight-report',
    schema_version: '0.1.0',
    status: reportStatus(ordered),
    eligible_for_compilation: false,
    creative_plan_sha256: null,
    diagnostics: ordered,
    summary: summarizeDiagnostics(ordered),
    checks: { scenes: 0, structural_ids: 0, content_items: 0, asset_intents: 0, references: 0 },
  };
}

export function validateCreativePlan(
  input: unknown,
  options: CreativeValidationOptions = {},
): CreativeValidationResult {
  const limits = options.limits ?? DEFAULT_CREATIVE_LIMITS;
  const inspection = inspectCreativeInput(input, limits);
  if (inspection.diagnostics.some((issue) => issue.severity === 'error')) {
    return { ok: false, migrations_applied: [], report: failedReport(inspection.diagnostics) };
  }

  let candidate = input;
  let migrationsApplied: readonly string[] = [];
  if (options.migrate !== false && candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const raw = candidate as Record<string, unknown>;
    if (raw.schema_version !== '0.1.0' && typeof raw.schema_version === 'string') {
      const migration = migrateVersionedCreativeDocument(raw, '0.1.0', CREATIVE_PLAN_MIGRATIONS);
      if (!migration.ok || !migration.value) {
        return { ok: false, migrations_applied: migration.applied, report: failedReport(migration.diagnostics) };
      }
      candidate = migration.value;
      migrationsApplied = migration.applied;
    }
  }

  const parsed = CreativePlanSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, migrations_applied: migrationsApplied, report: failedReport(zodDiagnostics(parsed.error)) };
  }
  const report = runCreativePreflight(parsed.data, {
    require_hook: options.require_hook ?? DEFAULT_CREATIVE_PREFLIGHT_POLICY.require_hook,
    limits,
  });
  return {
    ok: report.status !== 'fail',
    value: parsed.data,
    canonical_sha256: hashCreativeDocument(parsed.data),
    migrations_applied: migrationsApplied,
    report,
  };
}
