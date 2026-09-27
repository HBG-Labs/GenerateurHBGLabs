import { describe, expect, it } from 'vitest';

import type { RenderPlan, Track } from '@motion-engine/core';

import { assertP12Plan, numericTrackValue } from './interpreter.tsx';

const plan = (): RenderPlan => ({
  schema: 'render-plan',
  schema_version: '0.1.0',
  spec: { spec_id: 'test_plan', revision: 1, sha256: 'a'.repeat(64) },
  style: { mode: 'creative', sha256: 'b'.repeat(64) },
  compiler_version: '0.1.0',
  canvas: { width: 540, height: 960, fps: 30, duration_frames: 30 },
  fonts: [],
  assets: [],
  scenes: [
    {
      id: 'scene',
      from: 0,
      to: 30,
      background: '#000000',
      nodes: [
        {
          id: 'group',
          type: 'group',
          box: { x: 0, y: 0, w: 540, h: 960 },
          origin: { x: 0.5, y: 0.5 },
          opacity: 1,
          tracks: [],
          children: [
            {
              id: 'shape',
              type: 'shape',
              shape: 'rect',
              box: { x: 20, y: 20, w: 200, h: 20 },
              origin: { x: 0.5, y: 0.5 },
              opacity: 1,
              tracks: [],
              radius: 0,
              fill: '#FFFFFF',
              stroke: null,
            },
            {
              id: 'text',
              type: 'text',
              box: { x: 20, y: 60, w: 500, h: 80 },
              origin: { x: 0.5, y: 0.5 },
              opacity: 1,
              tracks: [],
              align: 'start',
              lines: [
                {
                  top: 0,
                  height: 80,
                  measured_width: null,
                  runs: [
                    {
                      id: 'run',
                      text: 'Texte générique',
                      font: 'font',
                      weight: 700,
                      size: 64,
                      tracking_px: 0,
                      color: '#FFFFFF',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('interpréteur Remotion P1.3', () => {
  it('accepte Group, Text et Shape', () => {
    expect(() => assertP12Plan(plan())).not.toThrow();
  });

  it('interpole le sous-ensemble minimal des tracks', () => {
    const track: Track = {
      property: 'opacity',
      source: 'test_track',
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 1 },
      ],
    };
    expect(numericTrackValue(track, 5, 1)).toBe(0.5);
  });

  it('exécute l’easing concret du RenderPlan sans connaître le behavior source', () => {
    const track: Track = {
      property: 'opacity',
      source: 'source_opaque',
      keys: [
        { frame: 0, value: 0, ease: { type: 'bezier', p: [0.05, 0.9, 0.1, 1] } },
        { frame: 10, value: 1 },
      ],
    };
    expect(numericTrackValue(track, 5, 0)).toBeGreaterThan(0.5);
  });

  it('rejette une primitive P1.4', () => {
    const invalid = plan();
    invalid.scenes[0]!.nodes = [
      {
        id: 'image',
        type: 'image',
        box: { x: 0, y: 0, w: 100, h: 100 },
        origin: { x: 0.5, y: 0.5 },
        opacity: 1,
        tracks: [],
        asset: 'future_asset',
        fit: 'cover',
        crop: { x: 0, y: 0, w: 100, h: 100 },
      },
    ];
    expect(() => assertP12Plan(invalid)).toThrow(/hors périmètre/);
  });
});
