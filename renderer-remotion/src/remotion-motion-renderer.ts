import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

import { assertRenderGate } from '@motion-engine/core';
import type { MotionRenderer, RenderFrameRequest, RenderFrameResult, RenderPlan, RenderVideoRequest, RenderVideoResult } from '@motion-engine/core';

import { assertP15Plan } from './interpreter.tsx';
import { REMOTION_CAPABILITIES } from './capabilities.ts';
import { REMOTION_RENDERER_VERSION, REMOTION_VERSION } from './version.ts';

export interface RemotionMotionRendererOptions {
  browserExecutable?: string;
}

function temporaryOutput(finalFile: string): string {
  const parsed = path.parse(finalFile);
  return path.join(parsed.dir, `.${parsed.name}.${process.pid}.${Date.now()}.partial${parsed.ext}`);
}

export function finalizeAtomicOutput(temporary: string, finalFile: string): void {
  if (!existsSync(temporary) || statSync(temporary).size <= 0) throw new Error(`Artefact temporaire invalide : ${temporary}`);
  const backup = `${finalFile}.previous`;
  if (existsSync(backup)) rmSync(backup, { force: true });
  if (existsSync(finalFile)) renameSync(finalFile, backup);
  try {
    renameSync(temporary, finalFile);
    if (existsSync(backup)) rmSync(backup, { force: true });
  } catch (error) {
    if (existsSync(backup) && !existsSync(finalFile)) renameSync(backup, finalFile);
    throw error;
  }
}

export async function renderAtomically(finalFile: string, producer: (temporaryFile: string) => Promise<void>): Promise<void> {
  const temporary = temporaryOutput(finalFile);
  try {
    await producer(temporary);
    finalizeAtomicOutput(temporary, finalFile);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function safeRemove(directory: string): void {
  const resolved = path.resolve(directory);
  const temp = `${path.resolve(tmpdir())}${path.sep}`;
  if (!resolved.startsWith(temp)) throw new Error(`Refus de supprimer un chemin hors du dossier temporaire : ${resolved}`);
  rmSync(resolved, { recursive: true, force: true });
}

function containedPath(root: string, file: string): string {
  if (/^[a-z]+:\/\//iu.test(file)) throw new Error(`Ressource réseau interdite : ${file}`);
  if (path.isAbsolute(file)) throw new Error(`Chemin absolu interdit dans le RenderPlan : ${file}`);
  const base = path.resolve(root);
  const resolved = path.resolve(base, file);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`Ressource hors racine autorisée : ${file}`);
  return resolved;
}

function verifiedDataUrl(root: string, file: string, expectedHash: string, mime: string): string {
  const source = containedPath(root, file);
  if (!existsSync(source)) throw new Error(`Ressource du RenderPlan introuvable : ${source}`);
  const bytes = readFileSync(source);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`Empreinte invalide pour ${file} : ${hash} ≠ ${expectedHash}`);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function prepareResources(plan: RenderPlan, root: string): { fontUrls: Record<string, string>; assetUrls: Record<string, string> } {
  const fontUrls = Object.fromEntries(plan.fonts.map((font) => [font.id, verifiedDataUrl(root, font.file, font.sha256, 'font/ttf')]));
  const assetUrls = Object.fromEntries(plan.assets.map((asset) => [asset.ref, verifiedDataUrl(root, asset.file, asset.sha256, asset.mime)]));
  return { fontUrls, assetUrls };
}

export class RemotionMotionRenderer implements MotionRenderer {
  readonly descriptor = Object.freeze({
    name: '@motion-engine/renderer-remotion', version: REMOTION_RENDERER_VERSION, capabilities: REMOTION_CAPABILITIES,
  });
  readonly #browserExecutable: string | undefined;
  #serveUrl: string | null = null;
  #bundlePromise: Promise<{ serveUrl: string; bundleMs: number }> | null = null;

  constructor(options: RemotionMotionRendererOptions = {}) {
    this.#browserExecutable = options.browserExecutable;
  }

  async #ensureBundle(): Promise<{ serveUrl: string; bundleMs: number; reused: boolean }> {
    if (this.#serveUrl) return { serveUrl: this.#serveUrl, bundleMs: 0, reused: true };
    if (!this.#bundlePromise) {
      this.#bundlePromise = (async () => {
        const started = performance.now();
        const serveUrl = await bundle({ entryPoint: fileURLToPath(new URL('./entry.tsx', import.meta.url)), onProgress: () => undefined });
        return { serveUrl, bundleMs: performance.now() - started };
      })();
    }
    const result = await this.#bundlePromise;
    const reused = this.#serveUrl !== null;
    this.#serveUrl = result.serveUrl;
    return { serveUrl: result.serveUrl, bundleMs: reused ? 0 : result.bundleMs, reused };
  }

  dispose(): void {
    if (this.#serveUrl) safeRemove(this.#serveUrl);
    this.#serveUrl = null;
    this.#bundlePromise = null;
  }

  async renderFrame(request: RenderFrameRequest): Promise<RenderFrameResult> {
    assertP15Plan(request.plan);
    assertRenderGate(request.plan, this.descriptor);
    if (this.#browserExecutable && !existsSync(this.#browserExecutable)) throw new Error(`Chromium explicitement indisponible : ${this.#browserExecutable}`);
    if (request.frame < 0 || request.frame >= request.plan.canvas.duration_frames) throw new Error(`Frame ${request.frame} hors du RenderPlan.`);
    const resources = prepareResources(request.plan, request.resource_root);
    mkdirSync(path.dirname(request.output_file), { recursive: true });
    const bundled = await this.#ensureBundle();
    const inputProps = { plan: request.plan, ...resources };
    const browserOptions = this.#browserExecutable ? { browserExecutable: this.#browserExecutable, chromeMode: 'chrome-for-testing' as const } : {};
    const composition = await selectComposition({ serveUrl: bundled.serveUrl, id: 'MotionEngine', inputProps, ...browserOptions });
    const renderStarted = performance.now();
    await renderAtomically(request.output_file, async (temporary) => {
      await renderStill({ composition, serveUrl: bundled.serveUrl, inputProps, output: temporary, frame: request.frame, imageFormat: 'png', overwrite: true, logLevel: 'warn', ...browserOptions });
    });
    return {
      output_file: request.output_file,
      frame: request.frame,
      bytes: statSync(request.output_file).size,
      bundle_ms: bundled.bundleMs,
      bundle_reused: bundled.reused,
      render_ms: performance.now() - renderStarted,
      max_rss_bytes: process.resourceUsage().maxRSS * 1024,
      renderer: { name: '@motion-engine/renderer-remotion', version: REMOTION_RENDERER_VERSION },
      browser: this.#browserExecutable ?? null,
    };
  }

  async renderVideo(request: RenderVideoRequest): Promise<RenderVideoResult> {
    assertP15Plan(request.plan);
    assertRenderGate(request.plan, this.descriptor);
    if (this.#browserExecutable && !existsSync(this.#browserExecutable)) throw new Error(`Chromium explicitement indisponible : ${this.#browserExecutable}`);
    const resources = prepareResources(request.plan, request.resource_root);
    mkdirSync(path.dirname(request.output_file), { recursive: true });
    const bundled = await this.#ensureBundle();
    const inputProps = { plan: request.plan, ...resources };
    const browserOptions = this.#browserExecutable ? { browserExecutable: this.#browserExecutable, chromeMode: 'chrome-for-testing' as const } : {};
    const composition = await selectComposition({ serveUrl: bundled.serveUrl, id: 'MotionEngine', inputProps, ...browserOptions });
    const renderStarted = performance.now();
    await renderAtomically(request.output_file, async (temporary) => {
      await renderMedia({ composition, serveUrl: bundled.serveUrl, inputProps, outputLocation: temporary, codec: 'h264', overwrite: true, logLevel: 'warn', ...browserOptions });
    });
    return {
      output_file: request.output_file,
      bytes: statSync(request.output_file).size,
      bundle_ms: bundled.bundleMs,
      bundle_reused: bundled.reused,
      render_ms: performance.now() - renderStarted,
      max_rss_bytes: process.resourceUsage().maxRSS * 1024,
      renderer: { name: '@motion-engine/renderer-remotion', version: REMOTION_RENDERER_VERSION },
      browser: this.#browserExecutable ?? null,
      codec: 'h264',
      frames: request.plan.canvas.duration_frames,
      fps: request.plan.canvas.fps,
    };
  }
}

export const remotionToolchainVersion = REMOTION_VERSION;
