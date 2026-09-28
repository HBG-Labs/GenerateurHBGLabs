import { z } from 'zod';

import { IdSchema, SemVerSchema, Sha256Schema } from './common.ts';

export const DEPENDENCY_GRAPH_VERSION = '0.1.0';
export const DependencyNodeKindSchema = z.enum([
  'scene', 'layer', 'asset', 'font', 'behavior', 'track', 'audio_cue', 'subtitle_segment',
]);
export const DependencyGraphNodeSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_:.-]{0,159}$/),
  kind: DependencyNodeKindSchema,
  source_id: IdSchema.nullable(),
  fingerprint: Sha256Schema.nullable(),
});
export const DependencyGraphEdgeSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.enum(['contains', 'uses', 'drives', 'anchors', 'times', 'shapes', 'renders']),
});
export const DependencyGraphSchema = z.strictObject({
  schema: z.literal('dependency-graph'),
  schema_version: SemVerSchema,
  nodes: z.array(DependencyGraphNodeSchema),
  edges: z.array(DependencyGraphEdgeSchema),
  sha256: Sha256Schema,
});
export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

