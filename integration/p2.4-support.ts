import {
  compilePipeline,
  type CompilerPipelineResult,
} from '@motion-engine/core';
import {
  SHORT_FORM_DEFAULT_PROFILE,
  compileCreativePlan,
  type CreativeCompileResult,
} from '@motion-engine/creative-compiler';
import {
  createCreativeGenerationRequest,
  replayCreativeGateway,
  runCreativeGateway,
  type CreativeGatewayResult,
  type CreateCreativeGenerationRequestInput,
} from '@motion-engine/creative-gateway';
import { ValidProvider } from '@motion-engine/creative-gateway/testing';

import { pattern, platforms } from './p1.2-support.ts';
import { p14FontResources } from './p1.4-support.ts';
import { p23Asset, p23Style, type P23StyleName } from './p2.3-support.ts';
import { readJson } from './support.ts';

interface RequestFixture {
  readonly fixture_schema: 'creative-generation-request-fixture';
  readonly fixture_version: '0.1.0';
  readonly request: CreateCreativeGenerationRequestInput;
}

export function p24Request() {
  const fixture = readJson('creative-gateway/fixtures/p2.4/dinosaurs.request-fixture.json') as RequestFixture;
  if (fixture.fixture_schema !== 'creative-generation-request-fixture' || fixture.fixture_version !== '0.1.0') {
    throw new Error('Fixture P2.4 incompatible.');
  }
  return createCreativeGenerationRequest(fixture.request);
}

export async function buildP24GatewayRun(): Promise<CreativeGatewayResult> {
  return runCreativeGateway(p24Request(), {
    provider: new ValidProvider(),
    max_repair_attempts: 1,
    timeout_ms: 1_000,
    resolve_asset_bindings: ({ asset_intents }) => asset_intents.map((asset) => ({
      asset_slot: asset.slot,
      asset_ref: 'neutral_landscape',
      provenance: 'fixture' as const,
      focus: { region: 'focus_disc' },
    })),
  });
}

export interface P24CompiledPipeline {
  readonly gateway: CreativeGatewayResult;
  readonly creative_compile: CreativeCompileResult;
  readonly p1: CompilerPipelineResult;
}

export function compileP24GatewayResult(
  gateway: CreativeGatewayResult,
  styleName: P23StyleName = 'signal',
): P24CompiledPipeline {
  if (!gateway.ok || !gateway.planning?.creative_plan || !gateway.creative_resolution) {
    throw new Error(`Gateway P2.4 invalide : ${JSON.stringify(gateway.report.diagnostics)}`);
  }
  const style = p23Style(styleName);
  const definition = pattern();
  const creativeCompile = compileCreativePlan(gateway.planning.creative_plan, {
    resolution: gateway.creative_resolution,
    profile: SHORT_FORM_DEFAULT_PROFILE,
    resolved_style: style,
    pattern: definition,
  });
  if (!creativeCompile.ok || !creativeCompile.motion_spec) {
    throw new Error(`Creative Compiler P2.3 invalide : ${JSON.stringify(creativeCompile.report.diagnostics)}`);
  }
  const asset = p23Asset();
  const p1 = compilePipeline({
    spec: creativeCompile.motion_spec,
    resolvedStyle: style,
    platformPresets: platforms(),
    pattern: definition,
    fontResources: p14FontResources(style),
    assetResources: { [asset.ref]: asset },
    config: {
      fps: SHORT_FORM_DEFAULT_PROFILE.fps,
      render_scale: 0.5,
      minimum_readable_size: 14,
    },
  });
  return { gateway, creative_compile: creativeCompile, p1 };
}

export async function buildP24Pipeline(style: P23StyleName = 'signal'): Promise<P24CompiledPipeline> {
  return compileP24GatewayResult(await buildP24GatewayRun(), style);
}

export async function buildP24ReplayPipeline(style: P23StyleName = 'signal'): Promise<P24CompiledPipeline> {
  const run = await buildP24GatewayRun();
  return compileP24GatewayResult(replayCreativeGateway(run.snapshot), style);
}
