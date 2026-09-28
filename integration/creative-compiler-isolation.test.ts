import { describe, expect, it } from 'vitest';

import { buildP23Pipeline } from './p2.3-support.ts';

describe('P2.3 — isolation du renderer et du réseau', () => {
  it('compile offline jusqu’au RenderPlan sans importer le renderer', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('network forbidden'); };
    try {
      const result = buildP23Pipeline('minimal-5s', 'signal');
      expect(result.creative_compile.ok).toBe(true);
      expect(result.p1.preflight.summary?.errors ?? 0).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
