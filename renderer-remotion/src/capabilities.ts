import type { RenderCapability } from '@motion-engine/core';

export const REMOTION_CAPABILITIES: readonly RenderCapability[] = Object.freeze([
  'TEXT', 'SHAPE', 'IMAGE', 'PATH', 'MASK', 'GROUP', 'TRANSFORM', 'OPACITY', 'CLIP',
  'PATH_PROGRESS', 'COLOR', 'VARIABLE_FONT', 'CUT',
]);

export const REMOTION_P17_CAPABILITIES: readonly RenderCapability[] = Object.freeze([
  ...REMOTION_CAPABILITIES,
  'DYNAMIC_TYPOGRAPHY',
]);
