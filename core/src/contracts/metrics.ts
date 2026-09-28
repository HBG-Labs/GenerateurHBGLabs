import { z } from 'zod';

const measured = (unit: string) => z.strictObject({ value: z.number().finite().min(0), unit: z.literal(unit), kind: z.literal('measured') });
export const RenderMetricsSchema = z.strictObject({
  schema: z.literal('render-metrics'),
  schema_version: z.literal('0.1.0'),
  compile_ms: measured('ms'),
  text_shape_ms: measured('ms').nullable(),
  bundle_ms: measured('ms'),
  render_ms: measured('ms'),
  frames_per_second: measured('frames/s'),
  node_peak_memory: measured('bytes'),
  render_peak_memory: measured('bytes').nullable(),
  output_bytes: measured('bytes'),
  bundle_reused: z.boolean(),
});
export type RenderMetrics = z.infer<typeof RenderMetricsSchema>;
