import type { RenderPlan } from '../contracts/render-plan.ts';

export interface RenderFrameRequest {
  plan: RenderPlan;
  output_file: string;
  frame: number;
  resource_root: string;
}

export interface RenderFrameResult {
  output_file: string;
  frame: number;
  bytes: number;
  bundle_ms: number;
  render_ms: number;
  max_rss_bytes: number;
  renderer: { name: string; version: string };
  browser: string | null;
}

/** Frontière générique : le cœur ne connaît ni React, ni Chromium, ni Remotion. */
export interface MotionRenderer {
  renderFrame(request: RenderFrameRequest): Promise<RenderFrameResult>;
}
