import { describe, expect, it } from 'vitest';

import { canonicalCreativeJson, hashCreativeDocument } from './canonical.ts';
import { deriveCreativeId } from './stable-id.ts';
import { loadValidFixture } from './test-support.ts';
import { validateCreativePlan } from './validation.ts';

describe('canonicalisation créative', () => {
  it('trie récursivement les clés, omet undefined et conserve les tableaux', () => {
    const left = { z: 2, a: { d: undefined, c: 1 }, list: [3, 1, 2] };
    const right = { list: [3, 1, 2], a: { c: 1 }, z: 2 };
    expect(canonicalCreativeJson(left)).toBe('{"a":{"c":1},"list":[3,1,2],"z":2}');
    expect(hashCreativeDocument(left)).toBe(hashCreativeDocument(right));
  });

  it('préserve Unicode sémantiquement sans normalisation implicite', () => {
    expect(canonicalCreativeJson({ text: 'Électricité — aujourd’hui' })).toContain('Électricité — aujourd’hui');
    expect(hashCreativeDocument({ text: 'é' })).not.toBe(hashCreativeDocument({ text: 'e\u0301' }));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('refuse le nombre non fini %s', (value) => {
    expect(() => canonicalCreativeJson({ value })).toThrow(/non fini/);
  });

  it('produit le même hash quelle que soit l’insertion des clés', () => {
    const plan = loadValidFixture('educational');
    const reversed = Object.fromEntries(Object.entries(plan).reverse());
    expect(hashCreativeDocument(plan)).toBe(hashCreativeDocument(reversed));
  });

  it('dérive des IDs stables et valides sans hasard', () => {
    const input = { topic: 'Électricité', role: 'hook' };
    expect(deriveCreativeId('scene', input)).toBe(deriveCreativeId('scene', input));
    expect(deriveCreativeId('scene', input)).toMatch(/^scene_[0-9a-f]{14}$/);
    expect(deriveCreativeId('scene', input)).not.toBe(deriveCreativeId('layer', input));
  });

  it('produit diagnostics et hash identiques à entrées identiques', () => {
    const plan = loadValidFixture('hypothetical');
    const left = validateCreativePlan(structuredClone(plan));
    const right = validateCreativePlan(structuredClone(plan));
    expect(left.canonical_sha256).toBe(right.canonical_sha256);
    expect(left.report).toEqual(right.report);
  });
});
