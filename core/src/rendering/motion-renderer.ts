import type { RenderPlan } from '../contracts/render-plan.ts';
import type { RendererDescriptor } from './capabilities.ts';

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
  bundle_reused: boolean;
  render_ms: number;
  max_rss_bytes: number;
  renderer: { name: string; version: string };
  browser: string | null;
}

export interface RenderVideoRequest {
  plan: RenderPlan;
  output_file: string;
  resource_root: string;
}

export interface RenderVideoResult {
  output_file: string;
  bytes: number;
  bundle_ms: number;
  bundle_reused: boolean;
  render_ms: number;
  max_rss_bytes: number;
  renderer: { name: string; version: string };
  browser: string | null;
  codec: 'h264';
  frames: number;
  fps: number;
}

/** Frontière générique : le cœur ne connaît ni React, ni Chromium, ni Remotion. */
export interface MotionRenderer {
  readonly descriptor: RendererDescriptor;
  renderFrame(request: RenderFrameRequest): Promise<RenderFrameResult>;
  renderVideo(request: RenderVideoRequest): Promise<RenderVideoResult>;
}
