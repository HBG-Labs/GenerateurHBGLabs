import { ensureBrowser } from '@remotion/renderer';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  canonicalJson,
  compilePipeline,
  profileCompileForRender,
} from '@motion-engine/core';
import {
  SHORT_FORM_DEFAULT_PROFILE,
  compileCreativePlan,
} from '@motion-engine/creative-compiler';
import {
  createCreativeGenerationRequest,
  replayCreativeGateway,
  runCreativeGateway,
  type CreativeGatewayResult,
} from '@motion-engine/creative-gateway';
import {
  createOpenAIProviderFromEnvironment,
  type OpenAIProviderLogEvent,
} from '@motion-engine/provider-openai';
import {
  REMOTION_CAPABILITIES,
  REMOTION_RENDERER_VERSION,
  RemotionMotionRenderer,
  renderAtomically,
} from '@motion-engine/renderer-remotion';

import { pattern, platforms } from '../integration/p1.2-support.ts';
import { p14FontResources } from '../integration/p1.4-support.ts';
import {
  browserExecutable,
  controlFrames,
  gitState,
  sha256File,
  toolchainFingerprint,
} from '../integration/p1.6-support.ts';
import { p23Asset, p23Style } from '../integration/p2.3-support.ts';
import { WORKSPACE } from '../integration/support.ts';
import { createGridBoard } from '../integration/visual-regression.ts';

const DEFAULT_IDEA = "Et si les dinosaures existaient encore aujourd'hui ?";

interface AssetFallback {
  readonly asset_intent_id: string;
  readonly asset_slot: string;
  readonly requested_description: string;
  readonly policy: 'abstract_neutral_fixture';
  readonly asset_ref: 'neutral_landscape';
  readonly exact_semantic_match: false;
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8');
}

function ideaArgument(): string {
  const index = process.argv.indexOf('--idea');
  if (index < 0) return DEFAULT_IDEA;
  const value = process.argv[index + 1]?.trim();
  if (!value) throw new Error('L’option --idea exige une valeur non vide.');
  return value;
}

async function availableBrowser(): Promise<string> {
  const existing = browserExecutable();
  if (existing) return existing;
  const status = await ensureBrowser({ chromeMode: 'chrome-for-testing', logLevel: 'warn' });
  if (status.type === 'user-defined-path' || status.type === 'local-puppeteer-browser') return status.path;
  throw new Error(`Chromium indisponible après ensureBrowser (${status.type}).`);
}

function assertGatewayReady(gateway: CreativeGatewayResult): asserts gateway is CreativeGatewayResult & {
  planner_input: NonNullable<CreativeGatewayResult['planner_input']>;
  planning: NonNullable<CreativeGatewayResult['planning']> & {
    creative_plan: NonNullable<NonNullable<CreativeGatewayResult['planning']>['creative_plan']>;
  };
  creative_resolution: NonNullable<CreativeGatewayResult['creative_resolution']>;
  snapshot: NonNullable<CreativeGatewayResult['snapshot']>;
} {
  if (!gateway.ok || !gateway.planner_input || !gateway.planning?.creative_plan || !gateway.creative_resolution || !gateway.snapshot) {
    throw new Error(`Gateway P2.5 refusé : ${canonicalJson(gateway.report)}`);
  }
}

function prepareP1(gateway: CreativeGatewayResult) {
  assertGatewayReady(gateway);
  const style = p23Style('signal');
  const definition = pattern();
  const creativeStarted = performance.now();
  const creativeCompile = compileCreativePlan(gateway.planning.creative_plan, {
    resolution: gateway.creative_resolution,
    profile: SHORT_FORM_DEFAULT_PROFILE,
    resolved_style: style,
    pattern: definition,
  });
  const creativeCompileMs = performance.now() - creativeStarted;
  if (!creativeCompile.ok || !creativeCompile.motion_spec || !creativeCompile.provenance) {
    throw new Error(`Creative Compiler P2.5 refusé : ${canonicalJson(creativeCompile.report)}`);
  }
  const asset = p23Asset();
  const platform = platforms();
  return {
    gateway,
    style,
    definition,
    platform,
    asset,
    creativeCompile,
    creativeCompileMs,
    compileInput: {
      spec: creativeCompile.motion_spec,
      resolvedStyle: style,
      platformPresets: platform,
      pattern: definition,
      fontResources: p14FontResources(style),
      assetResources: { [asset.ref]: asset },
      config: { fps: 30, render_scale: 1, minimum_readable_size: 28 },
    },
  };
}

function listFiles(directory: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(absolute));
    else if (entry.isFile() && entry.name !== 'artifact-integrity.json') output.push(absolute);
  }
  return output.sort();
}

function validateStagingPath(staging: string, root: string): void {
  const resolved = path.resolve(staging);
  const allowed = `${path.resolve(root)}${path.sep}.staging-`;
  if (!resolved.startsWith(allowed)) throw new Error(`Staging P2.5 hors racine refusé : ${resolved}`);
}

async function main(): Promise<void> {
  if (!process.env['OPENAI_API_KEY']?.trim()) {
    console.log('REAL PROVIDER NOT EXECUTED — OPENAI_API_KEY absent; P2.5 real gate SKIPPED.');
    return;
  }

  const totalStarted = performance.now();
  const idea = ideaArgument();
  const browser = await availableBrowser();
  const providerLogs: OpenAIProviderLogEvent[] = [];
  const provider = createOpenAIProviderFromEnvironment({
    logger: (event) => {
      providerLogs.push(event);
      console.log(`[provider] request=${event.request_id} stage=${event.stage} model=${event.model} attempt=${event.attempt} result=${event.result} latency_ms=${event.latency_ms.toFixed(1)}`);
    },
  });
  const request = createCreativeGenerationRequest({
    idea,
    creative_goal: 'curiosity',
    target_duration_ms: 30_000,
    target_format: 'vertical_short',
    audience: {
      description: 'Public francophone curieux de sciences et de scénarios hypothétiques',
      knowledge_level: 'mixed',
    },
    language: 'fr',
    locale: 'fr-FR',
    tone: ['dramatic'],
    desired_reaction: 'surprise',
    factual_mode: 'creative',
    cta: { mode: 'none' },
    constraints: [],
  });

  const assetFallbacks: AssetFallback[] = [];
  const gateway = await runCreativeGateway(request, {
    provider,
    max_repair_attempts: 1,
    timeout_ms: provider.config.timeout_ms,
    resolve_asset_bindings: ({ asset_intents, descriptions }) => asset_intents.map((asset) => {
      const description = descriptions.find((entry) => entry.asset_slot === asset.slot)?.description ?? asset.purpose;
      assetFallbacks.push({
        asset_intent_id: asset.id,
        asset_slot: asset.slot,
        requested_description: description,
        policy: 'abstract_neutral_fixture',
        asset_ref: 'neutral_landscape',
        exact_semantic_match: false,
      });
      return {
        asset_slot: asset.slot,
        asset_ref: 'neutral_landscape',
        provenance: 'fixture' as const,
        focus: { region: 'focus_disc' as const },
      };
    }),
  });
  assertGatewayReady(gateway);

  const direct = prepareP1(gateway);
  const replayCallsBefore = provider.callCount;
  const replayedGateway = replayCreativeGateway(gateway.snapshot);
  assertGatewayReady(replayedGateway);
  const replayed = prepareP1(replayedGateway);
  const replayP1 = compilePipeline(replayed.compileInput);
  if (provider.callCount !== replayCallsBefore) throw new Error('Le replay a rappelé le provider.');

  const git = gitState();
  const toolchain = toolchainFingerprint(browser);
  const descriptor = {
    name: '@motion-engine/renderer-remotion',
    version: REMOTION_RENDERER_VERSION,
    capabilities: REMOTION_CAPABILITIES,
  };
  const p1Started = performance.now();
  const profiled = profileCompileForRender(direct.compileInput, descriptor, {
    createdAt: new Date().toISOString(),
    engine: {
      name: '@motion-engine/core', version: '0.5.0', git_commit: git.commit,
      git_dirty: git.dirty, reference_eligible: !git.dirty,
    },
    platformPresets: direct.platform,
    toolchain: {
      node: toolchain.node,
      package_manager: toolchain.package_manager,
      lockfile_sha256: toolchain.lockfile_sha256,
      remotion: toolchain.remotion,
      chromium: toolchain.chromium,
      ffmpeg: toolchain.ffmpeg,
      harfbuzzjs: toolchain.harfbuzzjs,
      renderer_package: toolchain.renderer_package,
      os: toolchain.os,
      arch: toolchain.arch,
    },
    renderConfig: { width: 1080, height: 1920, fps: 30, codec: 'h264', crf: null, pixel_format: null },
  }, () => performance.now());
  const p1CompileMs = performance.now() - p1Started;
  const p1 = profiled.result;

  const replayProof = {
    schema: 'p2.5-replay-proof',
    schema_version: '0.1.0',
    provider_calls_before_replay: replayCallsBefore,
    provider_calls_after_replay: provider.callCount,
    no_provider_call_during_replay: provider.callCount === replayCallsBefore,
    planner_input_equal: canonicalJson(replayedGateway.planner_input) === canonicalJson(gateway.planner_input),
    creative_plan_equal: canonicalJson(replayedGateway.planning.creative_plan) === canonicalJson(gateway.planning.creative_plan),
    creative_resolution_equal: canonicalJson(replayedGateway.creative_resolution) === canonicalJson(gateway.creative_resolution),
    motion_spec_equal: replayed.creativeCompile.report.hashes.motion_spec === direct.creativeCompile.report.hashes.motion_spec,
    render_plan_equal: replayP1.hashes.render_plan === p1.hashes.render_plan,
    direct: {
      snapshot: gateway.snapshot.snapshot_sha256,
      motion_spec: direct.creativeCompile.report.hashes.motion_spec,
      render_plan: p1.hashes.render_plan,
    },
    replay: {
      snapshot: replayedGateway.snapshot.snapshot_sha256,
      motion_spec: replayed.creativeCompile.report.hashes.motion_spec,
      render_plan: replayP1.hashes.render_plan,
    },
  };
  if (!Object.entries(replayProof)
    .filter(([key]) => key.endsWith('_equal') || key === 'no_provider_call_during_replay')
    .every(([, value]) => value === true)) throw new Error(`Replay P2.5 non déterministe : ${canonicalJson(replayProof)}`);

  const p25Root = path.join(WORKSPACE, 'out', 'p2.5');
  const finalOut = path.join(p25Root, 'real-provider');
  if (existsSync(finalOut)) throw new Error(`Sortie P2.5 existante : ${finalOut}. Aucune mise à jour silencieuse n’est autorisée.`);
  mkdirSync(p25Root, { recursive: true });
  const staging = path.join(p25Root, `.staging-${process.pid}`);
  validateStagingPath(staging, p25Root);
  mkdirSync(staging, { recursive: false });

  try {
    const framesDirectory = path.join(staging, 'frames');
    mkdirSync(framesDirectory, { recursive: true });
    const videoFile = path.join(staging, 'p2-5-dinosaurs.mp4');
    const renderer = new RemotionMotionRenderer({ browserExecutable: browser });
    const renderCapture: { value: Awaited<ReturnType<RemotionMotionRenderer['renderVideo']>> | null } = { value: null };
    const frameMetrics: Array<{ phase: string; frame: number; render_ms: number; bytes: number }> = [];
    const frameFiles: string[] = [];
    try {
      await renderAtomically(videoFile, async (temporary) => {
        renderCapture.value = await renderer.renderVideo({ plan: p1.render_plan, output_file: temporary, resource_root: WORKSPACE });
      });
      for (const point of controlFrames(p1.render_plan.canvas.duration_frames)) {
        const file = path.join(framesDirectory, `${point.phase.toLowerCase()}.png`);
        const rendered = await renderer.renderFrame({
          plan: p1.render_plan,
          output_file: file,
          frame: point.frame,
          resource_root: WORKSPACE,
        });
        frameMetrics.push({ phase: point.phase, frame: point.frame, render_ms: rendered.render_ms, bytes: rendered.bytes });
        frameFiles.push(file);
      }
    } finally {
      renderer.dispose();
    }
    const videoMetrics = renderCapture.value;
    if (!videoMetrics || statSync(videoFile).size <= 0 || readFileSync(videoFile).subarray(4, 8).toString('ascii') !== 'ftyp') {
      throw new Error('Le renderer n’a pas produit un MP4 final valide.');
    }
    createGridBoard(frameFiles, frameFiles.length, path.join(staging, 'contact-sheet.png'));
    const holdFrame = frameFiles.find((file) => path.basename(file) === 'hold.png') ?? frameFiles[0];
    if (!holdFrame) throw new Error('Aucune frame représentative produite.');
    copyFileSync(holdFrame, path.join(staging, 'representative.png'));

    const slotById = new Map(gateway.planning.content_slots.map((slot) => [slot.id, slot]));
    const resolvedContent = gateway.snapshot.resolution_output.content.map((entry) => ({
      ...entry,
      role: slotById.get(entry.slot_id)?.role ?? 'unknown',
      channels: slotById.get(entry.slot_id)?.constraints.channels ?? [],
    }));
    const warnings = [
      ...gateway.report.diagnostics,
      ...direct.creativeCompile.report.diagnostics,
      ...p1.preflight.issues,
    ].filter((item) => item.severity === 'warning');
    const editorialReport = {
      schema: 'p2.5-editorial-report', schema_version: '0.1.0',
      idea,
      hook: resolvedContent.find((entry) => entry.role === 'hook_text')?.text ?? null,
      scene_count: gateway.planning.creative_plan.scenes.length,
      narration: resolvedContent.filter((entry) => entry.channels.includes('spoken')).map((entry) => ({ slot_id: entry.slot_id, text: entry.text })),
      on_screen_text: resolvedContent.filter((entry) => entry.channels.includes('on_screen')).map((entry) => ({ slot_id: entry.slot_id, text: entry.text })),
      unresolved_facts: resolvedContent.filter((entry) => entry.source_required || entry.uncertainty !== 'none').map((entry) => ({
        slot_id: entry.slot_id, uncertainty: entry.uncertainty, source_required: entry.source_required,
      })),
      asset_fallbacks: assetFallbacks,
      warnings,
      provider: gateway.snapshot.provider.provider_id,
      model: provider.config.model,
      prompt_versions: provider.fingerprint.prompts,
      snapshot_sha256: gateway.snapshot.snapshot_sha256,
      human_review_required: true,
      human_review_status: 'pending',
    };

    writeJson(path.join(staging, 'generation-request.json'), request);
    writeJson(path.join(staging, 'provider-config-fingerprint.json'), provider.fingerprint);
    writeJson(path.join(staging, 'accepted-provider-snapshot.json'), gateway.snapshot);
    writeJson(path.join(staging, 'gateway-report.json'), gateway.report);
    writeJson(path.join(staging, 'provider-log.json'), providerLogs);
    writeJson(path.join(staging, 'planner-input.json'), gateway.planner_input);
    writeJson(path.join(staging, 'creative-plan.json'), gateway.planning.creative_plan);
    writeJson(path.join(staging, 'creative-resolution.json'), gateway.creative_resolution);
    writeJson(path.join(staging, 'motion-spec.json'), direct.creativeCompile.motion_spec);
    writeJson(path.join(staging, 'creative-compile-report.json'), direct.creativeCompile.report);
    writeJson(path.join(staging, 'creative-provenance.json'), direct.creativeCompile.provenance);
    writeJson(path.join(staging, 'render-plan.json'), p1.render_plan);
    writeJson(path.join(staging, 'audio-plan.json'), p1.audio_plan);
    writeJson(path.join(staging, 'subtitle-plan.json'), p1.subtitle_plan);
    writeJson(path.join(staging, 'dependency-graph.json'), p1.dependency_graph);
    writeJson(path.join(staging, 'preflight.json'), p1.preflight);
    writeJson(path.join(staging, 'manifest.json'), p1.manifest);
    writeJson(path.join(staging, 'replay-proof.json'), replayProof);
    writeJson(path.join(staging, 'editorial-report.json'), editorialReport);
    writeJson(path.join(staging, 'metrics.json'), {
      schema: 'p2.5-metrics', schema_version: '0.1.0', measured: true,
      provider_planning_ms: providerLogs.filter((entry) => entry.stage === 'planning').reduce((sum, entry) => sum + entry.latency_ms, 0),
      provider_resolution_ms: providerLogs.filter((entry) => entry.stage === 'resolution').reduce((sum, entry) => sum + entry.latency_ms, 0),
      gateway_validation_ms: gateway.report.metrics.validation_ms,
      p2_2_planning_ms: gateway.report.metrics.planning_ms,
      resolution_build_ms: gateway.report.metrics.resolution_ms,
      p2_3_compile_ms: direct.creativeCompileMs,
      p1_compile_ms: p1CompileMs,
      p1_compile_phases_ms: profiled.metrics,
      render_ms: videoMetrics.render_ms,
      render_frames_per_second: videoMetrics.frames / (videoMetrics.render_ms / 1_000),
      bundle_ms: videoMetrics.bundle_ms,
      bundle_reused: videoMetrics.bundle_reused,
      frame_metrics: frameMetrics,
      node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
      total_ms: performance.now() - totalStarted,
      usage: gateway.report.usage,
    });
    writeJson(path.join(staging, 'artifact-integrity.json'), listFiles(staging).map((file) => ({
      file: path.relative(staging, file).replaceAll('\\', '/'),
      bytes: statSync(file).size,
      sha256: sha256File(file),
    })));
    renameSync(staging, finalOut);
    console.log(`P2.5 REAL PROVIDER PASS — ${finalOut}`);
    console.log(`snapshot=${gateway.snapshot.snapshot_sha256} render_plan=${p1.hashes.render_plan}`);
    console.log('HUMAN REVIEW REQUIRED — inspect p2-5-dinosaurs.mp4 before judging editorial quality.');
  } catch (error) {
    if (existsSync(staging)) {
      validateStagingPath(staging, p25Root);
      rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }
}

await main();
