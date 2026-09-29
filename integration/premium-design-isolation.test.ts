import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { WORKSPACE } from "./support.ts";

function sources(): string[] {
  const root = path.join(WORKSPACE, "premium-design-core", "src");
  return readdirSync(root)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(path.join(root, file), "utf8"));
}

describe("P3.3.6 — isolation et contamination", () => {
  it("reste indépendant du renderer, providers, réseau et applications", () => {
    const content = sources().join("\n").toLowerCase();
    const imports = content
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");
    for (const forbidden of [
      "react",
      "remotion",
      "chromium",
      "ffmpeg",
      "provider-openai",
      "blender",
      "child_process",
    ])
      expect(imports).not.toContain(forbidden);
    for (const forbidden of ["fetch(", "xmlhttprequest"])
      expect(content).not.toContain(forbidden);
  });
  it("ne contient aucune logique benchmark, fixture, campagne ou marque", () => {
    const content = sources().join("\n").toLowerCase();
    for (const forbidden of [
      "blue sky",
      "pourquoi le ciel",
      "rezo360",
      "tiime",
      "fiesta latina",
      "will taylor",
      "denis gimaev",
      "iphone",
      "stripe",
      "notion",
      "linear",
    ])
      expect(content).not.toContain(forbidden);
  });
  it("n’expose aucune surface exécutable ou média arbitraire", () => {
    const content = sources().join("\n");
    for (const forbidden of [
      "eval(",
      "new Function",
      "dangerouslySetInnerHTML",
      "raw_svg",
      "arbitrary_css",
    ])
      expect(content).not.toContain(forbidden);
  });
});
