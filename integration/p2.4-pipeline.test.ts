import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@motion-engine/core';
import { replayCreativeGateway } from '@motion-engine/creative-gateway';

import { buildP24GatewayRun, buildP24Pipeline, compileP24GatewayResult } from './p2.4-support.ts';

describe('P2.4 — Gateway vers RenderPlan P1', () => {
  it('atteint un RenderPlan depuis la fixture dinosaures via le Fake Provider', async () => {
    const result = await buildP24Pipeline('signal');
    expect(result.gateway.ok).toBe(true);
    expect(result.gateway.report.state).toBe('READY_FOR_COMPILE');
    expect(result.creative_compile.ok).toBe(true);
    expect(result.p1.preflight.summary?.errors ?? 0).toBe(0);
    expect(result.p1.render_plan.canvas.duration_frames).toBe(900);
    expect(result.p1.hashes.render_plan).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejoue le snapshot jusqu’au même MotionSpec et RenderPlan', async () => {
    const run = await buildP24GatewayRun();
    const direct = compileP24GatewayResult(run, 'signal');
    const replayedGateway = replayCreativeGateway(run.snapshot);
    const replayed = compileP24GatewayResult(replayedGateway, 'signal');
    expect(canonicalJson(replayedGateway.planner_input)).toBe(canonicalJson(run.planner_input));
    expect(canonicalJson(replayedGateway.planning?.creative_plan)).toBe(canonicalJson(run.planning?.creative_plan));
    expect(canonicalJson(replayedGateway.creative_resolution)).toBe(canonicalJson(run.creative_resolution));
    expect(replayed.creative_compile.report.hashes.motion_spec).toBe(direct.creative_compile.report.hashes.motion_spec);
    expect(replayed.p1.hashes.render_plan).toBe(direct.p1.hashes.render_plan);
  });

  it('sépare les descriptions provider des bindings d’assets approuvés par l’hôte', async () => {
    const run = await buildP24GatewayRun();
    expect(run.snapshot?.resolution_output.asset_descriptions.length).toBeGreaterThan(0);
    expect(JSON.stringify(run.snapshot?.resolution_output)).not.toContain('neutral_landscape');
    expect(run.snapshot?.asset_bindings.every((binding) => binding.asset_ref === 'neutral_landscape')).toBe(true);
  });
});
