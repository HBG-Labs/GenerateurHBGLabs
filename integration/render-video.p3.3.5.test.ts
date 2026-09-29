import { ensureBrowser } from '@remotion/renderer';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { canonicalJson, hashDocument } from '@motion-engine/core';
import {
  CHOREOGRAPHY_DEFINITIONS,
  ICON_DEFINITIONS,
  MATERIAL_DEFINITIONS,
  PROCEDURAL_ASSET_DEFINITIONS,
  PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT,
  PROCEDURAL_ASSET_PLAN_VERSION,
  PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
  componentTree,
} from '@motion-engine/procedural-asset-core';
import { RemotionMotionRenderer, REMOTION_P17_RENDERER_VERSION } from '@motion-engine/renderer-remotion';
import { hashVisualDocument } from '@motion-engine/visual-core';

import { browserExecutable, gitState, sha256File, toolchainFingerprint } from './p1.6-support.ts';
import { profileP33APipeline } from './p3.3a-support.ts';
import { profileP335Pipeline } from './p3.3.5-support.ts';
import { WORKSPACE } from './support.ts';
import { createGridBoard } from './visual-regression.ts';

function writeJson(file: string, value: unknown): void { writeFileSync(file, `${canonicalJson(value)}\n`, 'utf8'); }
function isMp4(file: string): boolean { const bytes = readFileSync(file).subarray(0, 12); return bytes.length >= 8 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'; }
function count(value: unknown, key: string): number { return JSON.stringify(value).split(`\"${key}\"`).length - 1; }
function sha256(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }

async function availableBrowser(): Promise<string> {
  const existing = browserExecutable();
  if (existing) return existing;
  const status = await ensureBrowser({ chromeMode: 'chrome-for-testing', logLevel: 'warn' });
  if (status.type === 'user-defined-path' || status.type === 'local-puppeteer-browser') return status.path;
  throw new Error(`Chromium indisponible (${status.type}).`);
}

function sideBySide(leftFile: string, rightFile: string, outputFile: string): void {
  const left = PNG.sync.read(readFileSync(leftFile)); const right = PNG.sync.read(readFileSync(rightFile));
  const height = Math.max(left.height, right.height); const output = new PNG({ width: left.width + right.width, height });
  for (let offset = 0; offset < output.data.length; offset += 4) { output.data[offset] = 2; output.data[offset + 1] = 8; output.data[offset + 2] = 23; output.data[offset + 3] = 255; }
  for (const [image, xOffset] of [[left, 0], [right, left.width]] as const) for (let y = 0; y < image.height; y += 1) {
    const sourceStart = y * image.width * 4; const destinationStart = (y * output.width + xOffset) * 4;
    image.data.copy(output.data, destinationStart, sourceStart, sourceStart + image.width * 4);
  }
  writeFileSync(outputFile, PNG.sync.write(output));
}

function publish(staging: string, output: string): void {
  const root = `${path.resolve(WORKSPACE, 'out', 'p3.3.5')}${path.sep}`; const resolved = path.resolve(output);
  if (!resolved.startsWith(root)) throw new Error(`Publication hors P3.3.5 refusée : ${resolved}`);
  const backup = `${output}.previous`; if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  if (existsSync(output)) renameSync(output, backup);
  try { renameSync(staging, output); if (existsSync(backup)) rmSync(backup, { recursive: true, force: true }); }
  catch (error) { if (existsSync(backup) && !existsSync(output)) renameSync(backup, output); throw error; }
}

describe('P3.3.5 — référence Product/App procédurale', () => {
  it('rend et publie atomiquement le package de human review', async () => {
    const browser = await availableBrowser();
    const baselineProfile = profileP33APipeline('product', 1);
    const profile = profileP335Pipeline('product', 1);
    const pipeline = profile.pipeline;
    expect(pipeline.asset_preflights.every((report) => report.summary.errors === 0)).toBe(true);
    expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);

    const root = path.join(WORKSPACE, 'out', 'p3.3.5'); const output = path.join(root, 'reference'); const staging = path.join(root, `.reference-staging-${process.pid}`);
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true }); mkdirSync(staging, { recursive: true });
    const plansDirectory = path.join(staging, 'procedural-asset-plans'); mkdirSync(plansDirectory, { recursive: true });
    pipeline.procedural_asset_plans.forEach((plan, index) => writeJson(path.join(plansDirectory, `${String(index + 1).padStart(2, '0')}-${plan.assets[0]!.asset_type.toLowerCase()}.json`), plan));
    writeJson(path.join(staging, 'procedural-asset-preflight.json'), pipeline.asset_preflights);
    writeJson(path.join(staging, 'asset-diversity-report.json'), pipeline.asset_diversity);
    writeJson(path.join(staging, 'component-trees.json'), pipeline.procedural_asset_plans.flatMap(componentTree));
    writeJson(path.join(staging, 'asset-inventory.json'), pipeline.procedural_asset_plans.flatMap((plan) => plan.assets.map((asset) => ({ asset_id: asset.asset_id, family: asset.asset_type, component_count: asset.components.length, material: asset.material, depth_roles: [...new Set(asset.components.map((entry) => entry.depth))], affordances: asset.affordances, persistent: asset.persistent }))));
    writeJson(path.join(staging, 'visual-direction-plan.json'), pipeline.direction_compile.direction_plan);
    writeJson(path.join(staging, 'visual-plan.json'), pipeline.visual_plan);
    writeJson(path.join(staging, 'visual-preflight.json'), pipeline.visual_compile.preflight);
    writeJson(path.join(staging, 'motion-spec.json'), pipeline.visual_compile.motion_spec);
    writeJson(path.join(staging, 'render-plan.json'), pipeline.p1.render_plan);
    writeJson(path.join(staging, 'p1-preflight.json'), pipeline.p1.preflight);

    const renderer = new RemotionMotionRenderer({ browserExecutable: browser, dynamicTypography: true });
    const video = path.join(staging, 'p3-3-5-product-app.mp4'); const framesDirectory = path.join(staging, 'frames'); mkdirSync(framesDirectory, { recursive: true });
    const frameFiles: string[] = []; const frameMetrics: unknown[] = [];
    let renderResult;
    try {
      renderResult = await renderer.renderVideo({ plan: pipeline.p1.render_plan, output_file: video, resource_root: WORKSPACE });
      expect(isMp4(video)).toBe(true);
      const total = pipeline.p1.render_plan.canvas.duration_frames;
      const points = [0, 0.12, 0.26, 0.42, 0.58, 0.74, 0.88, 0.98].map((ratio) => Math.min(total - 1, Math.round((total - 1) * ratio)));
      for (const [index, frame] of points.entries()) {
        const file = path.join(framesDirectory, `${String(index + 1).padStart(2, '0')}-${frame}.png`);
        const result = await renderer.renderFrame({ plan: pipeline.p1.render_plan, output_file: file, frame, resource_root: WORKSPACE });
        frameFiles.push(file); frameMetrics.push({ frame, render_ms: result.render_ms, bytes: result.bytes, bundle_reused: result.bundle_reused });
      }
    } finally { renderer.dispose(); }
    createGridBoard(frameFiles, 4, path.join(staging, 'p3-3-5-product-app-contact-sheet.png'));
    createGridBoard(frameFiles.slice(1, 6), 5, path.join(staging, 'p3-3-5-product-component-motion-strip.png'));

    const baselineVideo = path.join(WORKSPACE, 'out', 'p3.3a', 'reference', 'p3-3a-product-app.mp4');
    const baselineSheet = path.join(WORKSPACE, 'out', 'p3.3a', 'reference', 'p3-3a-product-app-contact-sheet.png');
    if (!existsSync(baselineVideo) || !existsSync(baselineSheet)) throw new Error('Baseline P3.3A Product/App absente.');
    copyFileSync(baselineVideo, path.join(staging, 'p3-3a-product-app-baseline.mp4'));
    sideBySide(baselineSheet, path.join(staging, 'p3-3-5-product-app-contact-sheet.png'), path.join(staging, 'p3-3a-vs-p3-3-5-product-comparison.png'));

    const complexity = {
      assets: pipeline.procedural_asset_plans.length,
      components: pipeline.procedural_asset_plans.flatMap((plan) => plan.assets).reduce((sum, asset) => sum + asset.components.length, 0),
      layers: count(pipeline.p1.render_plan, 'node_id'), paths: count(pipeline.p1.render_plan, 'd'), masks: count(pipeline.p1.render_plan, 'clip'), text_nodes: count(pipeline.p1.render_plan, 'lines'), tracks: count(pipeline.p1.render_plan, 'property'), keyframes: count(pipeline.p1.render_plan, 'frame'),
    };
    const baselineComplexity = { layers: count(baselineProfile.pipeline.p1.render_plan, 'node_id'), paths: count(baselineProfile.pipeline.p1.render_plan, 'd'), masks: count(baselineProfile.pipeline.p1.render_plan, 'clip'), text_nodes: count(baselineProfile.pipeline.p1.render_plan, 'lines'), tracks: count(baselineProfile.pipeline.p1.render_plan, 'property'), keyframes: count(baselineProfile.pipeline.p1.render_plan, 'frame') };
    const metrics = {
      schema: 'p3.3.5-certification-metrics', schema_version: '0.1.0',
      environment: { os: process.platform, arch: process.arch, node: process.version, renderer: REMOTION_P17_RENDERER_VERSION, local_gpu_required: false, render_mode: 'CPU/Chromium' },
      compile: profile.metrics, baseline_compile: baselineProfile.metrics,
      render: { ...renderResult, frames_per_second: renderResult.frames / (renderResult.render_ms / 1_000) }, control_frames: frameMetrics,
      memory: { node_peak_rss_bytes: process.resourceUsage().maxRSS * 1_024, chromium_ffmpeg_not_isolated: true }, complexity, baseline_complexity: baselineComplexity,
    };
    writeJson(path.join(staging, 'metrics.json'), metrics);
    const git = gitState(); const toolchain = toolchainFingerprint(browser);
    const hashes = {
      mp4: sha256File(video), baseline_mp4: sha256File(baselineVideo), procedural_asset_plans: pipeline.hashes.procedural_assets,
      visual_plan: hashVisualDocument(pipeline.visual_plan), motion_spec: hashDocument(pipeline.visual_compile.motion_spec), render_plan: hashDocument(pipeline.p1.render_plan),
      registries: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
    };
    writeJson(path.join(staging, 'hashes.json'), hashes);
    const manifestBase = {
      schema: 'p3.3.5-reference-manifest', schema_version: '0.1.0', commit: git.commit, tree_state: git.dirty ? 'dirty' : 'clean', branch: 'feature/social-procedural-assets',
      asset_grammar: { version: PROCEDURAL_ASSET_PLAN_VERSION, fingerprint: PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT }, registries: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
      asset_plans: pipeline.procedural_asset_plans.map((plan, index) => ({ plan_id: plan.plan_id, sha256: pipeline.hashes.procedural_assets[index], assets: plan.assets.map((asset) => ({ asset_id: asset.asset_id, family: asset.asset_type, components: asset.components.length, material: asset.material, choreography: asset.choreography, seed: asset.seed })) })),
      materials: MATERIAL_DEFINITIONS.map(({ id, version, support }) => ({ id, version, support })), icons: ICON_DEFINITIONS.map(({ id, version }) => ({ id, version })), choreographies: CHOREOGRAPHY_DEFINITIONS.map(({ id, version }) => ({ id, version })), families: PROCEDURAL_ASSET_DEFINITIONS.map(({ id, version }) => ({ id, version })),
      hashes, toolchain, capabilities: { structured_assets: true, component_targeting: true, component_extraction: true, deterministic_material_recipes: true, external_assets: false, provider_calls: false, true_3d: false },
      preflight: { asset_errors: pipeline.asset_preflights.reduce((sum, report) => sum + report.summary.errors, 0), visual_errors: pipeline.visual_compile.preflight.summary.errors, p1_errors: pipeline.p1.preflight.summary?.errors ?? 0 },
      reference_eligibility: false,
    };
    const manifest = { ...manifestBase, reference_eligibility: !git.dirty && manifestBase.preflight.asset_errors === 0 && manifestBase.preflight.visual_errors === 0 && manifestBase.preflight.p1_errors === 0 };
    const manifestHash = sha256(manifest); writeJson(path.join(staging, 'manifest.json'), { ...manifest, manifest_sha256: manifestHash });
    const serialized = canonicalJson({ manifest, metrics, hashes, plans: pipeline.procedural_asset_plans });
    const secretPatterns = [/sk-[a-z0-9_-]{16,}/giu, /api[_-]?key\s*[:=]/giu, /bearer\s+[a-z0-9._-]{16,}/giu];
    expect(secretPatterns.every((pattern) => !pattern.test(serialized))).toBe(true);
    publish(staging, output);
    expect(existsSync(path.join(output, 'p3-3-5-product-app.mp4'))).toBe(true);
  }, 1_800_000);
});
