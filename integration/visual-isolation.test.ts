import { describe, expect, it } from 'vitest';

import { buildP31Pipeline } from './p3.1-support.ts';

describe('P3.1 — isolation', () => {
  it('compile offline sans renderer, provider ou réseau', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('network forbidden'); };
    try {
      const pipeline = buildP31Pipeline();
      expect(pipeline.visual_compile.ok).toBe(true);
      expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
