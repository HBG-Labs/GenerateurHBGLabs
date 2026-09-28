import { describe, expect, it } from 'vitest';

import { validateCreativeGenerationRequest } from './request.ts';
import { dinosaurRequest } from './test-support.ts';

describe('P2.4 — sécurité des entrées Gateway', () => {
  it('refuse les propriétés inconnues', () => {
    const request = { ...dinosaurRequest(), motionSpec: { scenes: [] } };
    const result = validateCreativeGenerationRequest(request);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain('gateway.request.unknown_field');
  });

  it('refuse les graphes cycliques', () => {
    const request: any = { ...dinosaurRequest() };
    request.loop = request;
    const result = validateCreativeGenerationRequest(request);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.code.includes('cyclic_reference'))).toBe(true);
  });

  it('refuse les secrets dans une valeur pourtant textuelle', () => {
    const base = dinosaurRequest();
    const request = { ...base, idea: 'clé api_key=sk-abcdefghijk12345' };
    const result = validateCreativeGenerationRequest(request);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain('gateway.security.secret_detected');
  });

  it('refuse un payload excessif avant Zod', () => {
    const request = { ...dinosaurRequest(), idea: 'x'.repeat(25_000) };
    const result = validateCreativeGenerationRequest(request);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.code.includes('string_too_long'))).toBe(true);
  });

  it('refuse une identité modifiée manuellement', () => {
    const request = { ...dinosaurRequest(), idea: 'Autre idée' };
    const result = validateCreativeGenerationRequest(request);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain('gateway.request.identity_mismatch');
  });
});
