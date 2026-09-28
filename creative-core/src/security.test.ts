import { describe, expect, it } from 'vitest';

import { DEFAULT_CREATIVE_LIMITS } from './limits.ts';
import { inspectCreativeInput } from './security.ts';
import { loadValidFixture } from './test-support.ts';
import { validateCreativePlan } from './validation.ts';

function nested(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index += 1) value = { value };
  return value;
}

describe('sécurité des entrées CreativePlan', () => {
  it('refuse les clés de prototype pollution', () => {
    const malicious = JSON.parse('{"schema":"creative-plan","__proto__":{"polluted":true}}') as unknown;
    const result = inspectCreativeInput(malicious);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'security.forbidden_property', severity: 'error' })]),
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('refuse les objets dont le prototype a été altéré', () => {
    const malicious = { safe: true, __proto__: { polluted: true } };
    expect(inspectCreativeInput(malicious).diagnostics.some((issue) => issue.code === 'security.invalid_object_prototype')).toBe(true);
  });

  it('refuse les références cycliques sans lever une exception', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(inspectCreativeInput(cyclic).diagnostics.some((issue) => issue.code === 'security.cyclic_reference')).toBe(true);
    expect(validateCreativePlan(cyclic).ok).toBe(false);
  });

  it('accepte la profondeur exacte et refuse + 1', () => {
    const exact = inspectCreativeInput(nested(DEFAULT_CREATIVE_LIMITS.max_depth));
    const over = inspectCreativeInput(nested(DEFAULT_CREATIVE_LIMITS.max_depth + 1));
    expect(exact.diagnostics.some((issue) => issue.code === 'security.depth_exceeded')).toBe(false);
    expect(over.diagnostics.some((issue) => issue.code === 'security.depth_exceeded')).toBe(true);
  });

  it('refuse les nombres non finis', () => {
    expect(inspectCreativeInput({ value: Number.NaN }).diagnostics.some((issue) => issue.code === 'security.non_finite_number')).toBe(true);
  });

  it('applique exactement la limite JSON en octets', () => {
    const input = { value: 'électricité' };
    const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    const atLimit = inspectCreativeInput(input, { ...DEFAULT_CREATIVE_LIMITS, max_json_bytes: bytes });
    const over = inspectCreativeInput(input, { ...DEFAULT_CREATIVE_LIMITS, max_json_bytes: bytes - 1 });
    expect(atLimit.diagnostics.some((issue) => issue.code === 'security.payload_too_large')).toBe(false);
    expect(over.diagnostics.some((issue) => issue.code === 'security.payload_too_large')).toBe(true);
  });

  it('refuse un identifiant malformé et une propriété inattendue', () => {
    const invalid = structuredClone(loadValidFixture());
    (invalid as any).plan_id = '../escape';
    (invalid as any).unexpected = true;
    const result = validateCreativePlan(invalid);
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['schema.invalid', 'schema.unknown_field']),
    );
  });

  it('refuse une chaîne excessive avant le schéma coûteux', () => {
    const result = inspectCreativeInput({ value: 'x'.repeat(DEFAULT_CREATIVE_LIMITS.max_string_characters + 1) });
    expect(result.diagnostics.some((issue) => issue.code === 'security.string_too_long')).toBe(true);
  });
});
