import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

import type { MotionRenderer, RenderFrameRequest, RenderFrameResult } from '@motion-engine/core';

import { assertP12Plan } from './interpreter.tsx';
import { REMOTION_RENDERER_VERSION, REMOTION_VERSION } from './version.ts';

export interface RemotionMotionRendererOptions {
  browserExecutable?: string;
}

function safeRemove(directory: string): void {
  const resolved = path.resolve(directory);
  const temp = `${path.resolve(tmpdir())}${path.sep}`;
  if (!resolved.startsWith(temp)) throw new Error(`Refus de supprimer un chemin hors du dossier temporaire : ${resolved}`);
  rmSync(resolved, { recursive: true, force: true });
}

export class RemotionMotionRenderer implements MotionRenderer {
  readonly #browserExecutable: string | undefined;

  constructor(options: RemotionMotionRendererOptions = {}) {
    this.#browserExecutable = options.browserExecutable;
  }

  async renderFrame(request: RenderFrameRequest): Promise<RenderFrameResult> {
    assertP12Plan(request.plan);
    if (request.frame < 0 || request.frame >= request.plan.canvas.duration_frames) {
      throw new Error(`Frame ${request.frame} hors du RenderPlan.`);
    }
    const staging = mkdtempSync(path.join(tmpdir(), 'motion-remotion-'));
    const publicDir = path.join(staging, 'public');
    const fontDir = path.join(publicDir, 'fonts');
    mkdirSync(fontDir, { recursive: true });
    const fontUrls: Record<string, string> = {};
    for (const font of request.plan.fonts) {
      const source = path.resolve(request.resource_root, font.file);
      if (!existsSync(source)) throw new Error(`Police du RenderPlan introuvable : ${source}`);
      const name = `${font.id}-${font.sha256.slice(0, 12)}.ttf`;
      copyFileSync(source, path.join(fontDir, name));
      fontUrls[font.id] = `fonts/${name}`;
    }
    mkdirSync(path.dirname(request.output_file), { recursive: true });

    let serveUrl: string | null = null;
    try {
      const bundleStarted = performance.now();
      serveUrl = await bundle({
        entryPoint: fileURLToPath(new URL('./entry.tsx', import.meta.url)),
        publicDir,
        onProgress: () => undefined,
      });
      const bundleMs = performance.now() - bundleStarted;
      const inputProps = { plan: request.plan, fontUrls };
      const browserOptions = this.#browserExecutable
        ? { browserExecutable: this.#browserExecutable, chromeMode: 'chrome-for-testing' as const }
        : {};
      const composition = await selectComposition({
        serveUrl,
        id: 'MotionEngine',
        inputProps,
        ...browserOptions,
      });
      const renderStarted = performance.now();
      await renderStill({
        composition,
        serveUrl,
        inputProps,
        output: request.output_file,
        frame: request.frame,
        imageFormat: 'png',
        overwrite: true,
        logLevel: 'warn',
        ...browserOptions,
      });
      const renderMs = performance.now() - renderStarted;
      return {
        output_file: request.output_file,
        frame: request.frame,
        bytes: statSync(request.output_file).size,
        bundle_ms: bundleMs,
        render_ms: renderMs,
        max_rss_bytes: process.resourceUsage().maxRSS * 1024,
        renderer: { name: '@motion-engine/renderer-remotion', version: REMOTION_RENDERER_VERSION },
        browser: this.#browserExecutable ?? null,
      };
    } finally {
      safeRemove(staging);
      if (serveUrl) safeRemove(serveUrl);
    }
  }
}

export const remotionToolchainVersion = REMOTION_VERSION;
