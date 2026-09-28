import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { finalizeAtomicOutput, renderAtomically } from './remotion-motion-renderer.ts';

describe('finalisation atomique P1.5', () => {
  it('ne remplace la sortie finale qu’après validation du temporaire', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'motion-p15-'));
    const final = path.join(directory, 'video.mp4');
    const temporary = path.join(directory, '.video.partial.mp4');
    try {
      writeFileSync(final, 'ancien');
      writeFileSync(temporary, 'nouveau-valide');
      finalizeAtomicOutput(temporary, final);
      expect(readFileSync(final, 'utf8')).toBe('nouveau-valide');
      expect(existsSync(temporary)).toBe(false);
      expect(existsSync(`${final}.previous`)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('préserve l’artefact final si le temporaire est absent', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'motion-p15-'));
    const final = path.join(directory, 'video.mp4');
    try {
      writeFileSync(final, 'référence-valide');
      expect(() => finalizeAtomicOutput(path.join(directory, 'absent.mp4'), final)).toThrow(/temporaire invalide/u);
      expect(readFileSync(final, 'utf8')).toBe('référence-valide');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('nettoie le temporaire et ne publie rien lors d’une interruption injectée', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'motion-p16-interrupt-'));
    const final = path.join(directory, 'video.mp4');
    try {
      await expect(renderAtomically(final, (temporary) => {
        writeFileSync(temporary, 'fragment-incomplet');
        return Promise.reject(new Error('render interrupted'));
      })).rejects.toThrow('render interrupted');
      expect(existsSync(final)).toBe(false);
      expect(readdirSync(directory).some((file) => file.includes('.partial'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
