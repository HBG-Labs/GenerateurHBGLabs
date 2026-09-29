import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { canonicalJson, hashDocument } from "@motion-engine/core";
import {
  PREMIUM_DESIGN_FINGERPRINTS,
  PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
} from "@motion-engine/premium-design-core";
import { hashVisualDocument } from "@motion-engine/visual-core";

import { buildP336Pipeline } from "../integration/p3.3.6-support.ts";

const workspace = path.resolve(import.meta.dirname, "..");
const output = path.join(
  workspace,
  "premium-design-core",
  "goldens",
  "p3.3.6",
  "semantic-golden.json",
);
const update = process.argv.includes("--update");
const pipeline = buildP336Pipeline(0.25);
const golden = `${canonicalJson({
  schema: "p3.3.6-semantic-golden",
  schema_version: "0.1.0",
  design_system: {
    fingerprint: PREMIUM_DESIGN_SYSTEM_FINGERPRINT,
    registries: PREMIUM_DESIGN_FINGERPRINTS,
  },
  design_plans: pipeline.premium_design_plans,
  design_preflights: pipeline.design_preflights,
  decision_traces: pipeline.decision_traces,
  procedural_asset_plan_hashes: pipeline.hashes.procedural_assets,
  visual_plan_sha256: hashVisualDocument(pipeline.visual_plan),
  motion_spec_sha256: hashDocument(pipeline.visual_compile.motion_spec),
  render_plan_sha256: hashDocument(pipeline.p1.render_plan),
})}\n`;

if (update) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, golden, "utf8");
  process.stdout.write("Golden sémantique P3.3.6 mis à jour explicitement.\n");
} else {
  if (!existsSync(output))
    throw new Error(
      "Golden P3.3.6 absent. Utiliser explicitement golden:update:p3.3.6.",
    );
  if (readFileSync(output, "utf8") !== golden)
    throw new Error(
      "Dérive du golden P3.3.6. La mise à jour doit être explicite.",
    );
  process.stdout.write("Golden sémantique P3.3.6 vérifié.\n");
}
