import { ProceduralAssetPlanSchema } from './contracts.ts';
import type { ProceduralAssetPlan } from './contracts.ts';

export interface ProceduralAssetMigration { readonly from: string; readonly to: string; readonly migrate: (input: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>> }
export const PROCEDURAL_ASSET_MIGRATIONS: readonly ProceduralAssetMigration[] = Object.freeze([]);

export function readProceduralAssetPlanVersioned(input: unknown, migrations: readonly ProceduralAssetMigration[] = PROCEDURAL_ASSET_MIGRATIONS): ProceduralAssetPlan {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('asset.migration.invalid_document');
  let current = input as Readonly<Record<string, unknown>>;
  let version = typeof current['schema_version'] === 'string' ? current['schema_version'] : '';
  if (version === '0.1.0') return ProceduralAssetPlanSchema.parse(current);
  const visited = new Set<string>();
  while (version !== '0.1.0') {
    if (visited.has(version)) throw new Error(`asset.migration.cycle:${version}`);
    visited.add(version);
    const migration = migrations.find((entry) => entry.from === version);
    if (!migration) throw new Error(`asset.migration.path_missing:${version}->0.1.0`);
    current = migration.migrate(current);
    version = migration.to;
  }
  return ProceduralAssetPlanSchema.parse(current);
}
