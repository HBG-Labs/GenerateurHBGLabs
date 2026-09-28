import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
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

import { ensureBrowser } from '@remotion/renderer';

import {
  canonicalJson,
  hashDocument,
  profileCompileForRender,
} from '@motion-engine/core';
import {
  SHORT_FORM_DEFAULT_PROFILE,
  compileCreativePlan,
} from '@motion-engine/creative-compiler';
import {
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
import {
  P26_REAL_PROVIDER_CASES,
  compileP26GatewayResult,
  p26ReadingPolicy,
  p26Request,
  type P26CertificationCase,
} from '../integration/p2.6-support.ts';
import { WORKSPACE } from '../integration/support.ts';
import { createGridBoard } from '../integration/visual-regression.ts';

interface AssetFallback {
  readonly asset_intent_id: string;
  readonly asset_slot: string;
  readonly requested_description: string;
  readonly policy: 'abstract_neutral_fixture';
  readonly asset_ref: 'neutral_landscape';
  readonly exact_semantic_match: false;
}

interface RealCaseRecord {
  readonly id: string;
  readonly required_success: boolean;
  readonly status: 'pass' | 'blocked';
  readonly direct_or_repaired: 'direct' | 'repaired' | 'blocked';
  readonly provider_calls: number;
  readonly usage: CreativeGatewayResult['report']['usage'];
  readonly failure_kind: CreativeGatewayResult['report']['failure_kind'];
  readonly diagnostics: CreativeGatewayResult['report']['diagnostics'];
  readonly hashes: null | {
    readonly snapshot: string;
    readonly planner_input: string;
    readonly creative_plan: string;
    readonly creative_resolution: string;
    readonly motion_spec: string;
    readonly render_plan: string;
  };
  readonly rendered: boolean;
  readonly mp4: null | { readonly file: string; readonly bytes: number; readonly sha256: string };
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8');
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
    throw new Error(`Gateway P2.6 refusé : ${canonicalJson(gateway.report)}`);
  }
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
  if (!resolved.startsWith(allowed)) throw new Error(`Staging P2.6 hors racine refusé : ${resolved}`);
}

function replayEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  delete env['OPENAI_API_KEY'];
  return env;
}

function childReplay(snapshotFile: string): Record<string, unknown> {
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      path.join(WORKSPACE, 'scripts', 'p2.6-replay-child.ts'),
      '--snapshot',
      snapshotFile,
    ],
    { cwd: WORKSPACE, encoding: 'utf8', env: replayEnvironment() },
  ).trim();
  return JSON.parse(output) as Record<string, unknown>;
}

function prepareP1(gateway: CreativeGatewayResult, browser: string) {
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
    throw new Error(`Creative Compiler P2.6 refusé : ${canonicalJson(creativeCompile.report)}`);
  }
  const asset = p23Asset();
  const platform = platforms();
  const compileInput = {
    spec: creativeCompile.motion_spec,
    resolvedStyle: style,
    platformPresets: platform,
    pattern: definition,
    fontResources: p14FontResources(style),
    assetResources: { [asset.ref]: asset },
    config: { fps: 30, render_scale: 1, minimum_readable_size: 28 },
  };
  const git = gitState();
  const toolchain = toolchainFingerprint(browser);
  const descriptor = {
    name: '@motion-engine/renderer-remotion',
    version: REMOTION_RENDERER_VERSION,
    capabilities: REMOTION_CAPABILITIES,
  };
  const p1Started = performance.now();
  const profiled = profileCompileForRender(compileInput, descriptor, {
    createdAt: new Date().toISOString(),
    engine: {
      name: '@motion-engine/core',
      version: '0.5.0',
      git_commit: git.commit,
      git_dirty: git.dirty,
      reference_eligible: !git.dirty,
    },
    platformPresets: platform,
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
    renderConfig: {
      width: 1_080,
      height: 1_920,
      fps: 30,
      codec: 'h264',
      crf: null,
      pixel_format: null,
    },
  }, () => performance.now());
  return {
    creativeCompile,
    creativeCompileMs,
    p1: profiled.result,
    p1CompileMs: performance.now() - p1Started,
    p1PhaseMetrics: profiled.metrics,
  };
}

function videoName(entry: P26CertificationCase): string {
  if (entry.id === 'science_explainer') return 'p2-6-explainer.mp4';
  if (entry.id === 'product_demo') return 'p2-6-product-demo.mp4';
  if (entry.id === 'minimal_short') return 'p2-6-minimal-short.mp4';
  return `p2-6-${entry.id.replaceAll('_', '-')}.mp4`;
}

function warningClass(code: string): { classification: string; blocking: false } {
  if (code.includes('voice.unused_segment')) return { classification: 'future_audio_candidate', blocking: false };
  if (code.includes('transition_degraded_to_cut')) return { classification: 'technical_debt', blocking: false };
  if (code === 'contrast.unknown_on_image') return { classification: 'p3_candidate', blocking: false };
  return { classification: 'expected_non_blocking', blocking: false };
}

function scanSecrets(root: string, actualSecret: string): { scanned_files: number; findings: readonly string[] } {
  const findings: string[] = [];
  const textExtensions = new Set(['.json', '.md', '.txt', '.log', '.yml', '.yaml']);
  const patterns = [/OPENAI_API_KEY/iu, /api[_ -]?key/iu, /sk-[A-Za-z0-9_-]{8,}/u];
  let scannedFiles = 0;
  for (const file of listFiles(root)) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    scannedFiles += 1;
    const text = readFileSync(file, 'utf8');
    if (actualSecret.length > 0 && text.includes(actualSecret)) findings.push(`${path.relative(root, file)}:actual_secret`);
    for (const pattern of patterns) {
      if (pattern.test(text)) findings.push(`${path.relative(root, file)}:${pattern.source}`);
    }
  }
  return { scanned_files: scannedFiles, findings: [...new Set(findings)].sort() };
}

function copyDinosaursReference(staging: string): { available: boolean; mp4_sha256: string | null; mp4_bytes: number | null } {
  const source = path.join(WORKSPACE, 'out', 'p2.5', 'real-provider');
  if (!existsSync(source)) return { available: false, mp4_sha256: null, mp4_bytes: null };
  const destination = path.join(staging, 'dinosaurs-p2.5-reference');
  mkdirSync(destination, { recursive: true });
  for (const relative of [
    'p2-5-dinosaurs.mp4',
    'contact-sheet.png',
    'representative.png',
    'accepted-provider-snapshot.json',
    'replay-proof.json',
    'metrics.json',
    'editorial-report.json',
  ]) {
    const sourceFile = path.join(source, relative);
    if (existsSync(sourceFile)) copyFileSync(sourceFile, path.join(destination, relative));
  }
  const sourceFrames = path.join(source, 'frames');
  if (existsSync(sourceFrames)) cpSync(sourceFrames, path.join(destination, 'frames'), { recursive: true });
  const mp4 = path.join(destination, 'p2-5-dinosaurs.mp4');
  if (!existsSync(mp4)) return { available: false, mp4_sha256: null, mp4_bytes: null };
  return { available: true, mp4_sha256: sha256File(mp4), mp4_bytes: statSync(mp4).size };
}

async function main(): Promise<void> {
  const secret = process.env['OPENAI_API_KEY']?.trim();
  if (!secret) {
    console.log('REAL PROVIDER NOT EXECUTED — OPENAI_API_KEY absent; P2.6 real gate SKIPPED.');
    return;
  }

  const totalStarted = performance.now();
  const root = path.join(WORKSPACE, 'out', 'p2.6');
  const finalOut = path.join(root, 'certification');
  if (existsSync(finalOut)) throw new Error(`Sortie P2.6 existante : ${finalOut}. Aucune mise à jour silencieuse n’est autorisée.`);
  mkdirSync(root, { recursive: true });
  const staging = path.join(root, `.staging-${process.pid}`);
  validateStagingPath(staging, root);
  mkdirSync(staging, { recursive: false });

  const browser = await availableBrowser();
  const renderer = new RemotionMotionRenderer({ browserExecutable: browser });
  const records: RealCaseRecord[] = [];
  const globalWarnings: Array<{ code: string; case_id: string; classification: string; blocking: false }> = [];
  let totalProviderCalls = 0;
  try {
    const dinosaursReference = copyDinosaursReference(staging);
    if (!dinosaursReference.available) {
      throw new Error('La référence P2.5 Dinosaurs est absente du workspace du gate P2.6.');
    }

    for (const entry of P26_REAL_PROVIDER_CASES) {
      const caseStarted = performance.now();
      const caseDirectory = path.join(staging, entry.id);
      mkdirSync(caseDirectory, { recursive: true });
      const request = p26Request(entry);
      const providerLogs: OpenAIProviderLogEvent[] = [];
      const provider = createOpenAIProviderFromEnvironment({
        logger: (event) => {
          providerLogs.push(event);
          console.log(`[provider] case=${entry.id} request=${event.request_id} stage=${event.stage} model=${event.model} attempt=${event.attempt} result=${event.result} latency_ms=${event.latency_ms.toFixed(1)}`);
        },
      });
      const assetFallbacks: AssetFallback[] = [];
      const gateway = await runCreativeGateway(request, {
        provider,
        max_repair_attempts: 1,
        timeout_ms: provider.config.timeout_ms,
        reading_policy: p26ReadingPolicy(),
        resolve_asset_bindings: ({ asset_intents, descriptions }) => asset_intents.map((asset) => {
          const description = descriptions.find((candidate) => candidate.asset_slot === asset.slot)?.description ?? asset.purpose;
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
      totalProviderCalls += provider.callCount;
      writeJson(path.join(caseDirectory, 'generation-request.json'), request);
      writeJson(path.join(caseDirectory, 'gateway-report.json'), gateway.report);
      writeJson(path.join(caseDirectory, 'provider-log.json'), providerLogs);
      writeJson(path.join(caseDirectory, 'provider-config-fingerprint.json'), provider.fingerprint);

      if (!gateway.ok) {
        records.push({
          id: entry.id,
          required_success: entry.render,
          status: 'blocked',
          direct_or_repaired: 'blocked',
          provider_calls: provider.callCount,
          usage: gateway.report.usage,
          failure_kind: gateway.report.failure_kind,
          diagnostics: gateway.report.diagnostics,
          hashes: null,
          rendered: false,
          mp4: null,
        });
        if (entry.render) throw new Error(`Le cas réel requis ${entry.id} est bloqué : ${canonicalJson(gateway.report)}`);
        continue;
      }

      assertGatewayReady(gateway);
      const direct = prepareP1(gateway, browser);
      const gatewayErrors = gateway.report.summary.errors;
      const creativeErrors = direct.creativeCompile.report.summary.errors;
      const p1Errors = direct.p1.preflight.summary?.errors ?? 0;
      if (gatewayErrors > 0 || creativeErrors > 0 || p1Errors > 0) {
        throw new Error(`Une sortie acceptée traverse une frontière avec ERROR pour ${entry.id}.`);
      }

      writeJson(path.join(caseDirectory, 'accepted-provider-snapshot.json'), gateway.snapshot);
      writeJson(path.join(caseDirectory, 'planner-input.json'), gateway.planner_input);
      writeJson(path.join(caseDirectory, 'creative-plan.json'), gateway.planning.creative_plan);
      writeJson(path.join(caseDirectory, 'creative-resolution.json'), gateway.creative_resolution);
      writeJson(path.join(caseDirectory, 'motion-spec.json'), direct.creativeCompile.motion_spec);
      writeJson(path.join(caseDirectory, 'creative-compile-report.json'), direct.creativeCompile.report);
      writeJson(path.join(caseDirectory, 'creative-provenance.json'), direct.creativeCompile.provenance);
      writeJson(path.join(caseDirectory, 'render-plan.json'), direct.p1.render_plan);
      writeJson(path.join(caseDirectory, 'audio-plan.json'), direct.p1.audio_plan);
      writeJson(path.join(caseDirectory, 'subtitle-plan.json'), direct.p1.subtitle_plan);
      writeJson(path.join(caseDirectory, 'dependency-graph.json'), direct.p1.dependency_graph);
      writeJson(path.join(caseDirectory, 'preflight.json'), direct.p1.preflight);
      writeJson(path.join(caseDirectory, 'manifest.json'), direct.p1.manifest);

      const callsBeforeReplay = provider.callCount;
      const replayGateway = replayCreativeGateway(gateway.snapshot, { reading_policy: p26ReadingPolicy() });
      assertGatewayReady(replayGateway);
      const replayCompiled = compileP26GatewayResult(replayGateway, 1);
      const snapshotFile = path.join(caseDirectory, 'accepted-provider-snapshot.json');
      const childA = childReplay(snapshotFile);
      const childB = childReplay(snapshotFile);
      const motionSpecHash = direct.creativeCompile.report.hashes.motion_spec;
      if (!motionSpecHash) throw new Error(`Hash MotionSpec absent pour ${entry.id}.`);
      const directHashes = {
        snapshot: gateway.snapshot.snapshot_sha256,
        planner_input: hashDocument(gateway.planner_input),
        creative_plan: hashDocument(gateway.planning.creative_plan),
        creative_resolution: hashDocument(gateway.creative_resolution),
        motion_spec: motionSpecHash,
        render_plan: direct.p1.hashes.render_plan,
      };
      const replayProof = {
        schema: 'p2.6-replay-proof',
        schema_version: '0.1.0',
        provider_calls_before_replay: callsBeforeReplay,
        provider_calls_after_replay: provider.callCount,
        no_provider_call_during_replay: provider.callCount === callsBeforeReplay,
        secret_removed_from_child_environment: true,
        planner_input_equal: hashDocument(replayGateway.planner_input) === directHashes.planner_input,
        creative_plan_equal: hashDocument(replayGateway.planning.creative_plan) === directHashes.creative_plan,
        creative_resolution_equal: hashDocument(replayGateway.creative_resolution) === directHashes.creative_resolution,
        motion_spec_equal: replayCompiled.creative_compile.report.hashes.motion_spec === directHashes.motion_spec,
        render_plan_equal: replayCompiled.p1.hashes.render_plan === directHashes.render_plan,
        cross_process_equal: canonicalJson(childA) === canonicalJson(childB),
        child_a: childA,
        child_b: childB,
        direct: directHashes,
      };
      if (!Object.entries(replayProof)
        .filter(([key]) => key.endsWith('_equal') || key === 'no_provider_call_during_replay')
        .every(([, value]) => value === true)) {
        throw new Error(`Replay P2.6 non déterministe pour ${entry.id} : ${canonicalJson(replayProof)}`);
      }
      writeJson(path.join(caseDirectory, 'replay-proof.json'), replayProof);

      const slotById = new Map(gateway.planning.content_slots.map((slot) => [slot.id, slot]));
      const resolvedContent = gateway.snapshot.resolution_output.content.map((content) => ({
        ...content,
        role: slotById.get(content.slot_id)?.role ?? 'unknown',
        channels: slotById.get(content.slot_id)?.constraints.channels ?? [],
      }));
      const warningItems = [
        ...gateway.report.diagnostics,
        ...direct.creativeCompile.report.diagnostics,
        ...direct.p1.preflight.issues,
      ].filter((item) => item.severity === 'warning');
      for (const warning of warningItems) {
        globalWarnings.push({ code: warning.code, case_id: entry.id, ...warningClass(warning.code) });
      }
      writeJson(path.join(caseDirectory, 'editorial-report.json'), {
        schema: 'p2.6-editorial-report',
        schema_version: '0.1.0',
        case_id: entry.id,
        idea: entry.request.idea,
        archetype: gateway.planning.report?.archetype.id ?? null,
        hook: resolvedContent.find((content) => content.role === 'hook_text')?.text ?? null,
        scene_count: gateway.planning.creative_plan.scenes.length,
        narration: resolvedContent.filter((content) => content.channels.includes('spoken')).map((content) => ({
          slot_id: content.slot_id,
          text: content.text,
        })),
        on_screen_text: resolvedContent.filter((content) => content.channels.includes('on_screen')).map((content) => ({
          slot_id: content.slot_id,
          text: content.text,
        })),
        unresolved_facts: resolvedContent.filter((content) => content.source_required || content.uncertainty !== 'none').map((content) => ({
          slot_id: content.slot_id,
          uncertainty: content.uncertainty,
          source_required: content.source_required,
        })),
        asset_fallbacks: assetFallbacks,
        warnings: warningItems,
        provider: gateway.snapshot.provider.provider_id,
        model: provider.config.model,
        snapshot_sha256: gateway.snapshot.snapshot_sha256,
        human_review_required: entry.render,
        human_review_status: entry.render ? 'pending' : 'not_rendered',
      });

      let mp4: RealCaseRecord['mp4'] = null;
      let renderMetrics: Record<string, unknown> | null = null;
      if (entry.render) {
        const framesDirectory = path.join(caseDirectory, 'frames');
        mkdirSync(framesDirectory, { recursive: true });
        const videoFile = path.join(caseDirectory, videoName(entry));
        const video = await renderer.renderVideo({
          plan: direct.p1.render_plan,
          output_file: videoFile,
          resource_root: WORKSPACE,
        });
        if (statSync(videoFile).size <= 0 || readFileSync(videoFile).subarray(4, 8).toString('ascii') !== 'ftyp') {
          throw new Error(`MP4 P2.6 invalide pour ${entry.id}.`);
        }
        const frameMetrics = [];
        const frameFiles: string[] = [];
        for (const point of controlFrames(direct.p1.render_plan.canvas.duration_frames)) {
          const file = path.join(framesDirectory, `${point.phase.toLowerCase()}.png`);
          const rendered = await renderer.renderFrame({
            plan: direct.p1.render_plan,
            output_file: file,
            frame: point.frame,
            resource_root: WORKSPACE,
          });
          frameMetrics.push({ phase: point.phase, frame: point.frame, render_ms: rendered.render_ms, bytes: rendered.bytes });
          frameFiles.push(file);
        }
        createGridBoard(frameFiles, frameFiles.length, path.join(caseDirectory, 'contact-sheet.png'));
        const representative = frameFiles.find((file) => path.basename(file) === 'hold.png') ?? frameFiles[0];
        if (!representative) throw new Error(`Frame représentative absente pour ${entry.id}.`);
        copyFileSync(representative, path.join(caseDirectory, 'representative.png'));
        mp4 = {
          file: path.relative(staging, videoFile).replaceAll('\\', '/'),
          bytes: statSync(videoFile).size,
          sha256: sha256File(videoFile),
        };
        renderMetrics = {
          render_ms: video.render_ms,
          render_frames_per_second: video.frames / (video.render_ms / 1_000),
          bundle_ms: video.bundle_ms,
          bundle_reused: video.bundle_reused,
          frames: video.frames,
          fps: video.fps,
          frame_metrics: frameMetrics,
        };
      }

      writeJson(path.join(caseDirectory, 'metrics.json'), {
        schema: 'p2.6-case-metrics',
        schema_version: '0.1.0',
        measured: true,
        provider_planning_ms: providerLogs.filter((event) => event.stage === 'planning').reduce((sum, event) => sum + event.latency_ms, 0),
        provider_initial_resolution_ms: providerLogs.filter((event) => event.stage === 'resolution' && event.attempt === 0).reduce((sum, event) => sum + event.latency_ms, 0),
        provider_repair_ms: providerLogs.filter((event) => event.stage === 'resolution' && event.attempt > 0).reduce((sum, event) => sum + event.latency_ms, 0),
        gateway_validation_ms: gateway.report.metrics.validation_ms,
        p2_2_planning_ms: gateway.report.metrics.planning_ms,
        resolution_build_ms: gateway.report.metrics.resolution_ms,
        p2_3_compile_ms: direct.creativeCompileMs,
        p1_compile_ms: direct.p1CompileMs,
        p1_compile_phases_ms: direct.p1PhaseMetrics,
        render: renderMetrics,
        node_peak_memory_bytes: process.resourceUsage().maxRSS * 1_024,
        total_case_ms: performance.now() - caseStarted,
        usage: gateway.report.usage,
        usage_by_stage: gateway.report.usage_by_stage,
      });

      records.push({
        id: entry.id,
        required_success: entry.render,
        status: 'pass',
        direct_or_repaired: gateway.report.resolution_repair || gateway.report.summary.planning_attempts > 1 ? 'repaired' : 'direct',
        provider_calls: provider.callCount,
        usage: gateway.report.usage,
        failure_kind: null,
        diagnostics: gateway.report.diagnostics,
        hashes: directHashes,
        rendered: entry.render,
        mp4,
      });
    }

    const requiredFailures = records.filter((record) => record.required_success && record.status !== 'pass');
    const successful = records.filter((record) => record.status === 'pass');
    const status = requiredFailures.length === 0 && successful.length >= 3 ? 'PASS' : 'BLOCKED';
    const warningSummary = [...new Map(globalWarnings.map((warning) => [
      `${warning.code}:${warning.classification}`,
      warning,
    ])).values()].sort((left, right) => left.code.localeCompare(right.code, 'en'));
    const toolchain = toolchainFingerprint(browser);
    const certificationReport = {
      schema: 'p2.6-certification-report',
      schema_version: '0.1.0',
      status,
      baseline: {
        p1: 'ed02b77c1e92b878ca164d88d9e1a88e73fcf0f0',
        p2_5: 'c0171377754a9d82d99d4b973e3e9f7e6ea8f4e9',
        p2_5_run: '36487283879',
      },
      provider: { id: 'openai', model: process.env['OPENAI_MODEL'] ?? 'gpt-6-luna' },
      budget: {
        real_cases: P26_REAL_PROVIDER_CASES.length,
        maximum_provider_calls_per_case: 4,
        maximum_provider_calls_total: P26_REAL_PROVIDER_CASES.length * 4,
        actual_provider_calls: totalProviderCalls,
        maximum_repair_attempts_per_stage: 1,
      },
      success: {
        direct: records.filter((record) => record.direct_or_repaired === 'direct').length,
        repaired: records.filter((record) => record.direct_or_repaired === 'repaired').length,
        blocked_cleanly: records.filter((record) => record.status === 'blocked').length,
      },
      real_provider_matrix: records,
      dinosaurs_reference: dinosaursReference,
      replay: {
        accepted_snapshots: successful.length,
        zero_provider_calls_during_replay: successful.every((record) => record.status === 'pass'),
        cross_process_runs_per_snapshot: 2,
      },
      determinism: {
        provider_generation: 'probabilistic',
        accepted_snapshot_onward: 'strict',
        binary_mp4: 'not_claimed',
      },
      toolchain,
      warnings: warningSummary,
      security: { secret_scan: 'PASS', raw_provider_responses_stored: false, provider_key_stored: false },
      human_review: {
        required: true,
        status: 'pending',
        criteria: ['readability', 'no_overflow', 'coherent_pacing', 'no_broken_screen', 'no_accidental_empty_scene', 'no_obvious_renderer_artifact'],
      },
      total_ms: performance.now() - totalStarted,
    };
    writeJson(path.join(staging, 'certification-report.json'), certificationReport);
    writeJson(path.join(staging, 'provider-budget.json'), certificationReport.budget);
    writeJson(path.join(staging, 'warnings.json'), warningSummary);

    const security = scanSecrets(staging, secret);
    if (security.findings.length > 0) throw new Error(`Le scan secret P2.6 a détecté ${security.findings.length} anomalie(s).`);
    writeJson(path.join(staging, 'security-report.json'), {
      schema: 'p2.6-security-report',
      schema_version: '0.1.0',
      status: 'PASS',
      secret_scan: security,
      raw_provider_responses_stored: false,
      provider_key_stored: false,
    });
    writeJson(path.join(staging, 'artifact-integrity.json'), listFiles(staging).map((file) => ({
      file: path.relative(staging, file).replaceAll('\\', '/'),
      bytes: statSync(file).size,
      sha256: sha256File(file),
    })));

    if (status !== 'PASS') throw new Error(`Certification P2.6 ${status}.`);
    renameSync(staging, finalOut);
    console.log(`P2.6 REAL PROVIDER PASS — ${finalOut}`);
    console.log(`cases=${records.length} direct=${certificationReport.success.direct} repaired=${certificationReport.success.repaired} blocked=${certificationReport.success.blocked_cleanly}`);
    console.log('HUMAN REVIEW REQUIRED — inspect MP4, contact sheets and representative frames.');
  } catch (error) {
    if (existsSync(staging)) {
      validateStagingPath(staging, root);
      rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  } finally {
    renderer.dispose();
  }
}

await main();
