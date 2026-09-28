import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CreativeProvider } from './provider.ts';
import { createCreativeGenerationRequest, type CreateCreativeGenerationRequestInput } from './request.ts';
import type { CreativeGatewayOptions } from './gateway.ts';

interface RequestFixture {
  readonly fixture_schema: 'creative-generation-request-fixture';
  readonly fixture_version: '0.1.0';
  readonly request: CreateCreativeGenerationRequestInput;
}

export function dinosaurRequest() {
  const file = path.resolve(import.meta.dirname, '..', 'fixtures', 'p2.4', 'dinosaurs.request-fixture.json');
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as RequestFixture;
  if (fixture.fixture_schema !== 'creative-generation-request-fixture' || fixture.fixture_version !== '0.1.0') {
    throw new Error('Fixture request P2.4 incompatible.');
  }
  return createCreativeGenerationRequest(fixture.request);
}

export function gatewayOptions(provider: CreativeProvider): CreativeGatewayOptions {
  return {
    provider,
    max_repair_attempts: 1,
    timeout_ms: 1_000,
    resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
      asset_slot: asset.slot,
      asset_ref: 'neutral_landscape',
      provenance: 'fixture' as const,
      focus: { region: 'focus_disc' },
    })),
  };
}
