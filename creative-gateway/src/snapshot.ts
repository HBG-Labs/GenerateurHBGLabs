import { hashCreativeDocument } from '@motion-engine/creative-core';

import {
  CreativeGatewaySnapshotSchema,
  GatewaySnapshotPayloadSchema,
  type CreativeGatewaySnapshot,
  type GatewaySnapshotPayload,
} from './contracts.ts';

export function createGatewaySnapshot(payload: GatewaySnapshotPayload): CreativeGatewaySnapshot {
  const validated = GatewaySnapshotPayloadSchema.parse(payload);
  return CreativeGatewaySnapshotSchema.parse({
    ...validated,
    snapshot_sha256: hashCreativeDocument(validated),
  });
}

export function verifyGatewaySnapshot(snapshot: CreativeGatewaySnapshot): boolean {
  const { snapshot_sha256: claimed, ...payload } = snapshot;
  return claimed === hashCreativeDocument(GatewaySnapshotPayloadSchema.parse(payload));
}
