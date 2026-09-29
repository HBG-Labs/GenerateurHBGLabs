import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { ensureBrowser } from "@remotion/renderer";
import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  hashDocument,
  type PlanNode,
  type RenderPlan,
} from "@motion-engine/core";
import {
  CHART_LANGUAGE_DEFINITIONS,
  DESIGN_RECIPE_DEFINITIONS,
  PREMIUM_DESIGN_FINGERPRINTS,
  PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
  PREMIUM_DESIGN_SYSTEM_VERSION,
  PREMIUM_ICON_DEFINITIONS,
  PREMIUM_MATERIAL_DEFINITIONS,
} from "@motion-engine/premium-design-core";
import {
  PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT,
  PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS,
  componentTree,
} from "@motion-engine/procedural-asset-core";
import {
  RemotionMotionRenderer,
  REMOTION_P17_RENDERER_VERSION,
} from "@motion-engine/renderer-remotion";
import { hashVisualDocument } from "@motion-engine/visual-core";

import {
  browserExecutable,
  gitState,
  sha256File,
  toolchainFingerprint,
} from "./p1.6-support.ts";
import { profileP33APipeline } from "./p3.3a-support.ts";
import { profileP335Pipeline } from "./p3.3.5-support.ts";
import { profileP336Pipeline } from "./p3.3.6-support.ts";
import { WORKSPACE } from "./support.ts";
import { createGridBoard } from "./visual-regression.ts";

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${canonicalJson(value)}\n`, "utf8");
}
function isMp4(file: string): boolean {
  const bytes = readFileSync(file).subarray(0, 12);
  return bytes.length >= 8 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
}
function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

async function availableBrowser(): Promise<string> {
  const existing = browserExecutable();
  if (existing) return existing;
  const status = await ensureBrowser({
    chromeMode: "chrome-for-testing",
    logLevel: "warn",
  });
  if (
    status.type === "user-defined-path" ||
    status.type === "local-puppeteer-browser"
  )
    return status.path;
  throw new Error(`Chromium indisponible (${status.type}).`);
}

function publish(staging: string, output: string): void {
  const root = `${path.resolve(WORKSPACE, "out", "p3.3.6")}${path.sep}`;
  const resolvedStaging = path.resolve(staging);
  const resolvedOutput = path.resolve(output);
  if (!resolvedStaging.startsWith(root) || !resolvedOutput.startsWith(root))
    throw new Error(`Publication hors P3.3.6 refusée : ${resolvedOutput}`);
  const backup = `${resolvedOutput}.previous`;
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  if (existsSync(resolvedOutput)) renameSync(resolvedOutput, backup);
  try {
    renameSync(resolvedStaging, resolvedOutput);
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(backup) && !existsSync(resolvedOutput))
      renameSync(backup, resolvedOutput);
    throw error;
  }
}

function planComplexity(plan: RenderPlan): {
  nodes: number;
  svg_nodes: number;
  text_nodes: number;
  masks: number;
  effects: number;
  tracks: number;
  keyframes: number;
} {
  let nodes = 0;
  let svgNodes = 0;
  let textNodes = 0;
  let masks = 0;
  let effects = 0;
  let tracks = 0;
  let keyframes = 0;
  const visit = (node: PlanNode): void => {
    nodes += 1;
    if (node.type === "path") svgNodes += 1;
    if (node.type === "text") textNodes += 1;
    if (node.type === "mask") masks += 1;
    tracks += node.tracks.length;
    keyframes += node.tracks.reduce((sum, track) => sum + track.keys.length, 0);
    if (
      node.opacity !== 1 ||
      ((node.type === "shape" || node.type === "path") && node.stroke !== null)
    )
      effects += 1;
    if (node.type === "group" || node.type === "mask")
      node.children.forEach(visit);
  };
  plan.scenes.forEach((scene) => scene.nodes.forEach(visit));
  return {
    nodes,
    svg_nodes: svgNodes,
    text_nodes: textNodes,
    masks,
    effects,
    tracks,
    keyframes,
  };
}

function framePoints(plan: RenderPlan): number[] {
  const total = plan.canvas.duration_frames;
  return [0.04, 0.14, 0.28, 0.42, 0.57, 0.72, 0.86, 0.97].map((ratio) =>
    Math.min(total - 1, Math.round((total - 1) * ratio)),
  );
}

async function renderFrames(
  renderer: RemotionMotionRenderer,
  plan: RenderPlan,
  directory: string,
): Promise<{ files: string[]; metrics: unknown[] }> {
  mkdirSync(directory, { recursive: true });
  const files: string[] = [];
  const metrics: unknown[] = [];
  for (const [index, frame] of framePoints(plan).entries()) {
    const file = path.join(
      directory,
      `${String(index + 1).padStart(2, "0")}-${frame}.png`,
    );
    const result = await renderer.renderFrame({
      plan,
      output_file: file,
      frame,
      resource_root: WORKSPACE,
    });
    files.push(file);
    metrics.push({
      frame,
      render_ms: result.render_ms,
      bytes: result.bytes,
      bundle_reused: result.bundle_reused,
    });
  }
  return { files, metrics };
}

describe("P3.3.6 — référence Product/App premium procédurale", () => {
  it("rend et publie atomiquement le package de human review", async () => {
    const scale = Number(process.env["P336_RENDER_SCALE"] ?? "1");
    expect([0.5, 1]).toContain(scale);
    const browser = await availableBrowser();
    const a = profileP33APipeline("product", scale);
    const b = profileP335Pipeline("product", scale);
    const c = profileP336Pipeline(scale);
    const pipeline = c.pipeline;
    expect(
      pipeline.design_preflights.every((report) => report.summary.errors === 0),
    ).toBe(true);
    expect(
      pipeline.asset_preflights.every((report) => report.summary.errors === 0),
    ).toBe(true);
    expect(pipeline.visual_compile.preflight.summary.errors).toBe(0);
    expect(pipeline.p1.preflight.summary?.errors ?? 0).toBe(0);

    const root = path.join(WORKSPACE, "out", "p3.3.6");
    const name = scale === 1 ? "reference" : "draft";
    const output = path.join(root, name);
    const staging = path.join(root, `.${name}-staging-${process.pid}`);
    const resolvedStaging = path.resolve(staging);
    if (!resolvedStaging.startsWith(`${path.resolve(root)}${path.sep}`))
      throw new Error("Staging P3.3.6 invalide.");
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    const plansDirectory = path.join(staging, "procedural-asset-plans");
    const designDirectory = path.join(staging, "premium-design-plans");
    mkdirSync(plansDirectory, { recursive: true });
    mkdirSync(designDirectory, { recursive: true });
    pipeline.procedural_asset_plans.forEach((plan, index) =>
      writeJson(
        path.join(
          plansDirectory,
          `${String(index + 1).padStart(2, "0")}-${plan.assets[0]!.asset_type.toLowerCase()}.json`,
        ),
        plan,
      ),
    );
    pipeline.premium_design_plans.forEach((plan, index) =>
      writeJson(
        path.join(
          designDirectory,
          `${String(index + 1).padStart(2, "0")}-${plan.selection.recipe.id.toLowerCase()}.json`,
        ),
        plan,
      ),
    );
    writeJson(
      path.join(staging, "premium-design-preflight.json"),
      pipeline.design_preflights,
    );
    writeJson(
      path.join(staging, "procedural-asset-preflight.json"),
      pipeline.asset_preflights,
    );
    writeJson(
      path.join(staging, "design-decision-traces.json"),
      pipeline.decision_traces,
    );
    writeJson(
      path.join(staging, "design-system-report.json"),
      pipeline.design_system_report,
    );
    writeJson(
      path.join(staging, "design-token-report.json"),
      pipeline.premium_design_plans.map((plan) => ({
        design_plan_id: plan.design_plan_id,
        recipe: plan.selection.recipe,
        density: plan.selection.density,
        hierarchy: plan.selection.hierarchy,
        tokens: plan.tokens,
      })),
    );
    writeJson(
      path.join(staging, "asset-diversity-report.json"),
      pipeline.asset_diversity,
    );
    writeJson(
      path.join(staging, "component-trees.json"),
      pipeline.procedural_asset_plans.flatMap(componentTree),
    );
    writeJson(
      path.join(staging, "visual-direction-plan.json"),
      pipeline.direction_compile.direction_plan,
    );
    writeJson(path.join(staging, "visual-plan.json"), pipeline.visual_plan);
    writeJson(
      path.join(staging, "visual-preflight.json"),
      pipeline.visual_compile.preflight,
    );
    writeJson(
      path.join(staging, "motion-spec.json"),
      pipeline.visual_compile.motion_spec,
    );
    writeJson(path.join(staging, "render-plan.json"), pipeline.p1.render_plan);
    writeJson(path.join(staging, "p1-preflight.json"), pipeline.p1.preflight);
    writeJson(path.join(staging, "visual-quality-gap-matrix.json"), {
      schema: "p3.3.5-to-p3.3.6-visual-quality-gap-matrix",
      schema_version: "0.1.0",
      rows: [
        {
          gap: "product_hierarchy",
          before: "structured_but_flat",
          status: "addressed",
          mechanism: "single focal metric and staged supporting metadata",
        },
        {
          gap: "spacing_and_proportion",
          before: "coarse region placement",
          status: "addressed",
          mechanism: "versioned token scales and nested proportional groups",
        },
        {
          gap: "device_credibility",
          before: "rudimentary frame",
          status: "addressed",
          mechanism:
            "body, elevation, screen inset and navigation relationship",
        },
        {
          gap: "surface_material",
          before: "uniform flat surfaces",
          status: "partially_addressed",
          mechanism: "bounded layer-based elevation, edges and accent fields",
        },
        {
          gap: "chart_storytelling",
          before: "functional line only",
          status: "addressed",
          mechanism:
            "context, focal value, selective grid, series and focus point",
        },
        {
          gap: "photographic_or_true_3d_detail",
          before: "absent",
          status: "future_external_asset_dependency",
          mechanism: "out of scope",
        },
      ],
    });

    const renderer = new RemotionMotionRenderer({
      browserExecutable: browser,
      dynamicTypography: true,
    });
    const videos = {
      a: path.join(staging, "p3-3a-product-app.mp4"),
      b: path.join(staging, "p3-3-5-product-app.mp4"),
      c: path.join(staging, "p3-3-6-product-app.mp4"),
    };
    let renderA;
    let renderB;
    let renderC;
    let framesA;
    let framesB;
    let framesC;
    try {
      renderA = await renderer.renderVideo({
        plan: a.pipeline.p1.render_plan,
        output_file: videos.a,
        resource_root: WORKSPACE,
      });
      renderB = await renderer.renderVideo({
        plan: b.pipeline.p1.render_plan,
        output_file: videos.b,
        resource_root: WORKSPACE,
      });
      renderC = await renderer.renderVideo({
        plan: pipeline.p1.render_plan,
        output_file: videos.c,
        resource_root: WORKSPACE,
      });
      expect(isMp4(videos.a) && isMp4(videos.b) && isMp4(videos.c)).toBe(true);
      framesA = await renderFrames(
        renderer,
        a.pipeline.p1.render_plan,
        path.join(staging, "frames-p3.3a"),
      );
      framesB = await renderFrames(
        renderer,
        b.pipeline.p1.render_plan,
        path.join(staging, "frames-p3.3.5"),
      );
      framesC = await renderFrames(
        renderer,
        pipeline.p1.render_plan,
        path.join(staging, "frames-p3.3.6"),
      );
    } finally {
      renderer.dispose();
    }
    createGridBoard(
      framesC.files,
      4,
      path.join(staging, "p3-3-6-product-app-contact-sheet.png"),
    );
    createGridBoard(
      framesC.files.slice(1, 6),
      5,
      path.join(staging, "p3-3-6-product-component-motion-strip.png"),
    );
    createGridBoard(
      [
        framesC.files[1]!,
        framesC.files[2]!,
        framesC.files[4]!,
        framesC.files[5]!,
      ],
      4,
      path.join(staging, "p3-3-6-product-ui-detail-strip.png"),
    );
    createGridBoard(
      [
        framesC.files[0]!,
        framesC.files[3]!,
        framesC.files[5]!,
        framesC.files[6]!,
      ],
      4,
      path.join(staging, "p3-3-6-product-material-strip.png"),
    );
    const comparisonFrames = framesA.files
      .slice(1, 7)
      .flatMap((file, index) => [
        file,
        framesB.files[index + 1]!,
        framesC.files[index + 1]!,
      ]);
    createGridBoard(
      comparisonFrames,
      3,
      path.join(staging, "p3-3a-p3-3-5-p3-3-6-product-comparison.png"),
    );

    const complexity = {
      p33a: planComplexity(a.pipeline.p1.render_plan),
      p335: planComplexity(b.pipeline.p1.render_plan),
      p336: planComplexity(pipeline.p1.render_plan),
      semantic_components: pipeline.procedural_asset_plans
        .flatMap((plan) => plan.assets)
        .reduce((sum, asset) => sum + asset.components.length, 0),
    };
    const metrics = {
      schema: "p3.3.6-certification-metrics",
      schema_version: "0.1.0",
      scale,
      environment: {
        os: process.platform,
        arch: process.arch,
        node: process.version,
        renderer: REMOTION_P17_RENDERER_VERSION,
        local_gpu_required: false,
        render_mode: "CPU/Chromium",
      },
      compile: { p33a: a.metrics, p335: b.metrics, p336: c.metrics },
      render: {
        p33a: {
          ...renderA,
          frames_per_second: renderA.frames / (renderA.render_ms / 1_000),
        },
        p335: {
          ...renderB,
          frames_per_second: renderB.frames / (renderB.render_ms / 1_000),
        },
        p336: {
          ...renderC,
          frames_per_second: renderC.frames / (renderC.render_ms / 1_000),
        },
      },
      control_frames: {
        p33a: framesA.metrics,
        p335: framesB.metrics,
        p336: framesC.metrics,
      },
      memory: {
        node_peak_rss_bytes: process.resourceUsage().maxRSS * 1_024,
        chromium_rss_not_isolated: true,
      },
      dom_complexity: complexity,
      design_feature_costs: [
        {
          feature: "layered_surfaces",
          cost_class: "LOW",
          compile_delta_ms: null,
          render_delta_ms: null,
        },
        {
          feature: "internal_icon_paths",
          cost_class: "LOW",
          compile_delta_ms: null,
          render_delta_ms: null,
        },
        {
          feature: "selective_chart_grid",
          cost_class: "LOW",
          compile_delta_ms: null,
          render_delta_ms: null,
        },
        {
          feature: "accent_fields",
          cost_class: "LOW",
          compile_delta_ms: null,
          render_delta_ms: null,
        },
      ],
    };
    writeJson(path.join(staging, "metrics.json"), metrics);
    writeJson(path.join(staging, "dom-complexity.json"), complexity);
    const git = gitState();
    const toolchain = toolchainFingerprint(browser);
    const hashes = {
      design_system: PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
      design_registries: PREMIUM_DESIGN_FINGERPRINTS,
      asset_registry: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS.assets,
      material_registry: PROCEDURAL_ASSET_REGISTRY_FINGERPRINTS.materials,
      icon_registry: PREMIUM_DESIGN_FINGERPRINTS.icons,
      visual_direction_plan: sha256(pipeline.direction_compile.direction_plan),
      premium_design_plans: pipeline.hashes.premium_design,
      procedural_asset_plans: pipeline.hashes.procedural_assets,
      visual_plan: hashVisualDocument(pipeline.visual_plan),
      motion_spec: hashDocument(pipeline.visual_compile.motion_spec),
      render_plan: hashDocument(pipeline.p1.render_plan),
      p33a_mp4: sha256File(videos.a),
      p335_mp4: sha256File(videos.b),
      p336_mp4: sha256File(videos.c),
    };
    writeJson(path.join(staging, "hashes.json"), hashes);
    const preflight = {
      design_errors: pipeline.design_preflights.reduce(
        (sum, report) => sum + report.summary.errors,
        0,
      ),
      asset_errors: pipeline.asset_preflights.reduce(
        (sum, report) => sum + report.summary.errors,
        0,
      ),
      visual_errors: pipeline.visual_compile.preflight.summary.errors,
      p1_errors: pipeline.p1.preflight.summary?.errors ?? 0,
    };
    const manifestBase = {
      schema: "p3.3.6-reference-manifest",
      schema_version: "0.1.0",
      commit: git.commit,
      tree_state: git.dirty ? "dirty" : "clean",
      branch: "feature/social-premium-design-system",
      render_scale: scale,
      design_system: {
        version: PREMIUM_DESIGN_SYSTEM_VERSION,
        fingerprint: PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
      },
      design_registries: PREMIUM_DESIGN_FINGERPRINTS,
      procedural_asset_grammar: PROCEDURAL_ASSET_GRAMMAR_FINGERPRINT,
      recipes: DESIGN_RECIPE_DEFINITIONS.map(({ id, version }) => ({
        id,
        version,
      })),
      materials: PREMIUM_MATERIAL_DEFINITIONS.map(
        ({ id, version, support }) => ({ id, version, support }),
      ),
      icons: PREMIUM_ICON_DEFINITIONS.map(({ id, version }) => ({
        id,
        version,
      })),
      charts: CHART_LANGUAGE_DEFINITIONS.map(({ id, version }) => ({
        id,
        version,
      })),
      design_plans: pipeline.premium_design_plans.map((plan, index) => ({
        id: plan.design_plan_id,
        hash: pipeline.hashes.premium_design[index],
        recipe: plan.selection.recipe,
      })),
      assets: pipeline.procedural_asset_plans.flatMap((plan, planIndex) =>
        plan.assets.map((asset) => ({
          plan_hash: pipeline.hashes.procedural_assets[planIndex],
          asset_id: asset.asset_id,
          family: asset.asset_type,
          version: asset.version,
          components: asset.components.length,
          material: asset.material,
        })),
      ),
      hashes,
      preflight,
      toolchain,
      capabilities: {
        provider_calls: false,
        network: false,
        external_assets: false,
        local_gpu_required: false,
        true_3d: false,
        procedural_only: true,
        component_targeting: true,
      },
      reference_eligibility: false,
    };
    const referenceEligibility =
      scale === 1 &&
      !git.dirty &&
      Object.values(preflight).every((count) => count === 0);
    const manifest = {
      ...manifestBase,
      reference_eligibility: referenceEligibility,
    };
    const manifestSha256 = sha256(manifest);
    writeJson(path.join(staging, "manifest.json"), {
      ...manifest,
      manifest_sha256: manifestSha256,
    });
    const artifactHashes = {
      ...hashes,
      manifest: sha256File(path.join(staging, "manifest.json")),
      contact_sheet: sha256File(
        path.join(staging, "p3-3-6-product-app-contact-sheet.png"),
      ),
      comparison: sha256File(
        path.join(staging, "p3-3a-p3-3-5-p3-3-6-product-comparison.png"),
      ),
    };
    writeJson(path.join(staging, "artifact-hashes.json"), artifactHashes);
    const serialized = canonicalJson({
      manifest,
      metrics,
      hashes,
      plans: pipeline.premium_design_plans,
      assets: pipeline.procedural_asset_plans,
    });
    const secretPatterns = [
      /sk-[a-z0-9_-]{16,}/giu,
      /api[_-]?key\s*[:=]/giu,
      /bearer\s+[a-z0-9._-]{16,}/giu,
    ];
    expect(secretPatterns.every((pattern) => !pattern.test(serialized))).toBe(
      true,
    );
    publish(staging, output);
    expect(existsSync(path.join(output, "p3-3-6-product-app.mp4"))).toBe(true);
  }, 2_400_000);
});
