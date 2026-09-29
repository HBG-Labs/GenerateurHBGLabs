import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { hashDocument } from "@motion-engine/core";
import { hashVisualDocument } from "@motion-engine/visual-core";

import { buildP336Pipeline } from "./p3.3.6-support.ts";

function hashes() {
  const pipeline = buildP336Pipeline(0.25);
  return {
    design: pipeline.hashes.premium_design,
    assets: pipeline.hashes.procedural_assets,
    visual_plan: hashVisualDocument(pipeline.visual_plan),
    motion_spec: hashDocument(pipeline.visual_compile.motion_spec),
    render_plan: hashDocument(pipeline.p1.render_plan),
  };
}

describe("P3.3.6 — déterminisme et replay", () => {
  it("produit les mêmes plans et hashes dans le processus courant", () => {
    expect(hashes()).toEqual(hashes());
  });
  it("produit strictement les mêmes hashes dans deux processus Node", () => {
    const script = `import {hashDocument} from './core/src/index.ts';import {hashVisualDocument} from './visual-core/src/index.ts';import {buildP336Pipeline} from './integration/p3.3.6-support.ts';const p=buildP336Pipeline(0.25);console.log(JSON.stringify({design:p.hashes.premium_design,assets:p.hashes.procedural_assets,visual_plan:hashVisualDocument(p.visual_plan),motion_spec:hashDocument(p.visual_compile.motion_spec),render_plan:hashDocument(p.p1.render_plan)}));`;
    const run = () =>
      spawnSync(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", script],
        { cwd: process.cwd(), encoding: "utf8" },
      );
    const first = run();
    const second = run();
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(first.stdout.trim()).toBe(second.stdout.trim());
    expect(JSON.parse(first.stdout)).toEqual(hashes());
  });
});
