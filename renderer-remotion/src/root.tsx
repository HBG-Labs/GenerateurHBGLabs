import React from 'react';
import { Composition } from 'remotion';

import type { RenderPlan } from '@motion-engine/core';

import { GenericComposition } from './interpreter.tsx';
import type { GenericCompositionProps } from './interpreter.tsx';

const EMPTY_PLAN: RenderPlan = {
  schema: 'render-plan',
  schema_version: '0.1.0',
  spec: { spec_id: 'empty_plan', revision: 1, sha256: '0'.repeat(64) },
  style: { mode: 'creative', sha256: '0'.repeat(64) },
  compiler_version: '0.1.0',
  canvas: { width: 1080, height: 1920, fps: 30, duration_frames: 1 },
  fonts: [],
  assets: [],
  scenes: [{ id: 'empty_scene', from: 0, to: 1, background: '#000000', nodes: [] }],
};

const defaultProps: GenericCompositionProps = { plan: EMPTY_PLAN, fontUrls: {} };

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
