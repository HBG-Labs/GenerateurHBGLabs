import { VisualDirectionPlanSchema, VISUAL_DIRECTION_PLAN_VERSION } from './contracts.ts';
import type { VisualDirectionPlan } from './contracts.ts';

export interface VisualDirectionMigration {
  readonly from: string;
  readonly to: string;
  readonly migrate: (value: unknown) => unknown;
}

export const VISUAL_DIRECTION_MIGRATIONS: readonly VisualDirectionMigration[] = Object.freeze([]);

export function readVisualDirectionPlanVersioned(input: unknown, migrations: readonly VisualDirectionMigration[] = VISUAL_DIRECTION_MIGRATIONS): VisualDirectionPlan {
  if (typeof input !== 'object' || input === null || !('schema_version' in input) || typeof input.schema_version !== 'string') throw new Error('visual_direction.migration.path_missing');
  let current: unknown = input;
  let version = input.schema_version;
  const visited = new Set<string>();
  while (version !== VISUAL_DIRECTION_PLAN_VERSION) {
    if (visited.has(version)) throw new Error('visual_direction.migration.cycle');
    visited.add(version);
    const migration = migrations.find((entry) => entry.from === version);
    if (!migration) throw new Error(`visual_direction.migration.path_missing:${version}`);
    current = migration.migrate(current);
    version = migration.to;
  }
  return VisualDirectionPlanSchema.parse(current);
}
