import { P32_VISUAL_PLAN_VERSION, P335_VISUAL_PLAN_VERSION, VisualPlanSchema, VISUAL_PLAN_VERSION } from './contracts.ts';
import type { VisualPlan } from './contracts.ts';

export interface VisualMigration {
  readonly from: string;
  readonly to: string;
  readonly migrate: (input: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>;
}
export const VISUAL_PLAN_MIGRATIONS: readonly VisualMigration[] = Object.freeze([]);

export function readVisualPlanVersioned(input: unknown, migrations: readonly VisualMigration[] = VISUAL_PLAN_MIGRATIONS): VisualPlan {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('visual.migration.invalid_document');
  let current = input as Readonly<Record<string, unknown>>;
  let version = typeof current['schema_version'] === 'string' ? current['schema_version'] : '';
  if (version === VISUAL_PLAN_VERSION || version === P32_VISUAL_PLAN_VERSION || version === P335_VISUAL_PLAN_VERSION) return VisualPlanSchema.parse(current);
  const visited = new Set<string>();
  while (version !== P335_VISUAL_PLAN_VERSION) {
    if (visited.has(version)) throw new Error(`visual.migration.cycle:${version}`);
    visited.add(version);
    const migration = migrations.find((entry) => entry.from === version);
    if (!migration) throw new Error(`visual.migration.path_missing:${version}->${P335_VISUAL_PLAN_VERSION}`);
    current = migration.migrate(current);
    version = migration.to;
  }
  return VisualPlanSchema.parse(current);
}
