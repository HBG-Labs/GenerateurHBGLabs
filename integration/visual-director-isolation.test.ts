import { describe, expect, it } from 'vitest';

import { buildP33ADirectionFixture } from './p3.3a-support.ts';

describe('P3.3A — isolation', () => {
  it('valide et résout offline sans renderer, provider, réseau ou GPU', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('network forbidden'); };
    try {
      const fixture = buildP33ADirectionFixture('science');
      expect(fixture.direction_compile.ok).toBe(true);
      expect(fixture.direction_compile.visual_preflight?.summary.errors).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
