import { describe, expect, it } from 'vitest';

import { hashCreativeDocument } from './canonical.ts';
import { loadValidFixture } from './test-support.ts';
import { validateCreativePlan } from './validation.ts';
import { CREATIVE_PLAN_MIGRATIONS, migrateCreativePlan, migrateVersionedCreativeDocument } from './versioning.ts';

describe('versioning et migrations CreativePlan', () => {
  it('accepte la version courante sans migration', () => {
    const result = migrateCreativePlan(loadValidFixture());
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual([]);
    expect(CREATIVE_PLAN_MIGRATIONS).toEqual([]);
  });

  it('refuse une version inconnue sans inventer de migration', () => {
    const input = { ...loadValidFixture(), schema_version: '9.9.9' };
    const result = validateCreativePlan(input);
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'migration.path_missing' })]),
    );
  });

  it('refuse une version absente', () => {
    const input = structuredClone(loadValidFixture()) as Record<string, unknown>;
    delete input.schema_version;
    const result = migrateCreativePlan(input);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'version.unsupported' })]));
  });

  it('démontre une chaîne future déterministe sans déclarer de faux format historique', () => {
    const input = { schema_version: 'draft', value: 'Électricité' };
    const steps = [
      {
        from: 'draft',
        to: '0.1.0',
        migrate: (document: Readonly<Record<string, unknown>>) => ({ ...document, schema_version: '0.1.0', normalized: true }),
      },
    ];
    const left = migrateVersionedCreativeDocument(input, '0.1.0', steps);
    const right = migrateVersionedCreativeDocument(input, '0.1.0', steps);
    expect(left.ok).toBe(true);
    expect(left.applied).toEqual(['draft->0.1.0']);
    expect(hashCreativeDocument(left.value)).toBe(hashCreativeDocument(right.value));
  });

  it('détecte un cycle du registre', () => {
    const result = migrateVersionedCreativeDocument(
      { schema_version: 'a' },
      'target',
      [
        { from: 'a', to: 'b', migrate: (document) => ({ ...document, schema_version: 'b' }) },
        { from: 'b', to: 'a', migrate: (document) => ({ ...document, schema_version: 'a' }) },
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'migration.cycle' })]));
  });
});
