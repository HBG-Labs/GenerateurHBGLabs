import { describe, expect, it } from 'vitest';

import { runCreativeGateway } from '@motion-engine/creative-gateway';
import { ValidProvider } from '@motion-engine/creative-gateway/testing';

import { p24Request } from './p2.4-support.ts';

describe('P2.4 — isolation provider, renderer et réseau', () => {
  it('fonctionne offline sans renderer et sans accès réseau', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('network forbidden'); };
    try {
      const result = await runCreativeGateway(p24Request(), {
        provider: new ValidProvider(),
        resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
          asset_slot: asset.slot,
          asset_ref: 'neutral_landscape',
          provenance: 'fixture' as const,
        })),
      });
      expect(result.ok).toBe(true);
      expect(result.state).toBe('READY_FOR_COMPILE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
