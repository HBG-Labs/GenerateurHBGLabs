import React from 'react';
import { Composition } from 'remotion';

import type { RenderPlan } from '@motion-engine/core';

import { GenericComposition } from './interpreter.tsx';
import type { GenericCompositionProps } from './interpreter.tsx';

const EMPTY_PLAN: RenderPlan = {
  schema: 'render-plan',
  schema_version: '0.2.0',
  spec: { spec_id: 'empty_plan', revision: 1, sha256: '0'.repeat(64) },
  style: { mode: 'creative', sha256: '0'.repeat(64) },
  compiler_version: '0.3.0',
  canvas: { width: 1080, height: 1920, fps: 30, duration_frames: 1 },
  safe_zone: { x: 0, y: 0, w: 1080, h: 1920 },
  provenance: {
    timing_source: 'explicit_duration',
    behavior_registry_fingerprint: '0'.repeat(64),
    text_engine: {
      name: 'harfbuzzjs',
      package_version: '1.6.2',
      native_version: '14.5.0',
      shaping_configuration: { direction: 'auto', kerning: true, ligatures: true, cluster_level: 'monotone_graphemes' },
    },
  },
  fonts: [],
  assets: [],
  scenes: [{ id: 'empty_scene', from: 0, to: 1, background: '#000000', nodes: [], transition_out: null }],
  preflight: { status: 'pass', issues: [], checks: { fonts: 0, assets: 0, text_nodes: 0, safe_nodes: 0, contrast_pairs: 0 } },
};

const defaultProps: GenericCompositionProps = { plan: EMPTY_PLAN, fontUrls: {}, assetUrls: {} };

export const MotionEngineRoot: React.FC = () => (
  <Composition
    id="MotionEngine"
    component={GenericComposition}
    defaultProps={defaultProps}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    calculateMetadata={({ props }) => ({
      width: props.plan.canvas.width,
      height: props.plan.canvas.height,
      fps: props.plan.canvas.fps,
      durationInFrames: props.plan.canvas.duration_frames,
    })}
  />
);
