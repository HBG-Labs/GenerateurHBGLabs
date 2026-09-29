import { describe, expect, it } from 'vitest';

import type { RenderPlan, Track } from '@motion-engine/core';

import { assertP12Plan, numericTrackValue } from './interpreter.tsx';

const plan = (): RenderPlan => ({
  schema: 'render-plan',
  schema_version: '0.3.0',
  spec: { spec_id: 'test_plan', revision: 1, sha256: 'a'.repeat(64) },
  style: { mode: 'creative', sha256: 'b'.repeat(64) },
  compiler_version: '0.4.0',
  canvas: { width: 540, height: 960, fps: 30, duration_frames: 30 },
  safe_zone: { x: 0, y: 0, w: 540, h: 960 },
  requirements: { capabilities: ['GROUP', 'SHAPE', 'TEXT'], fingerprint: 'd'.repeat(64) },
  provenance: {
    timing_source: 'explicit_duration',
    behavior_registry_fingerprint: 'c'.repeat(64),
    text_engine: { name: 'harfbuzzjs', package_version: '1.6.2', native_version: '14.5.0', shaping_configuration: { direction: 'auto', kerning: true, ligatures: true, cluster_level: 'monotone_graphemes' } },
  },
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
          transform: { translate_x: 0, translate_y: 0, scale: 1, rotate: 0 },
          must_be_safe: false,
          tracks: [],
          children: [
            {
              id: 'shape',
              type: 'shape',
              shape: 'rect',
              box: { x: 20, y: 20, w: 200, h: 20 },
              origin: { x: 0.5, y: 0.5 },
              opacity: 1,
              transform: { translate_x: 0, translate_y: 0, scale: 1, rotate: 0 },
              must_be_safe: false,
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
              transform: { translate_x: 0, translate_y: 0, scale: 1, rotate: 0 },
              must_be_safe: false,
              tracks: [],
              align: 'start',
              lines: [
                {
                  top: 0,
                  height: 80,
                  measured_width: 400,
                  ascent: 60,
                  descent: 16,
                  line_gap: 4,
                  baseline: 60,
                  runs: [
                    {
                      id: 'run',
                      source_run: 'run',
                      source_text: 'Texte générique',
                      formatted_text: 'Texte générique',
                      text: 'Texte générique',
                      font: 'font',
                      weight: 700,
                      size: 64,
                      tracking_px: 0,
                      color: '#FFFFFF',
                      role: 'base',
                      measured_width: 400,
                      glyphs: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      transition_out: null,
    },
  ],
  preflight: { status: 'pass', issues: [], checks: { fonts: 0, assets: 0, text_nodes: 1, safe_nodes: 0, contrast_pairs: 1 } },
});

describe('interpréteur Remotion P1.3', () => {
  it('accepte Group, Text et Shape', () => {
    expect(() => assertP12Plan(plan())).not.toThrow();
  });

  it('interpole le sous-ensemble minimal des tracks', () => {
    const track: Track = {
      id: 'track_linear',
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
      id: 'track_eased',
      property: 'opacity',
      source: 'source_opaque',
      keys: [
        { frame: 0, value: 0, ease: { type: 'bezier', p: [0.05, 0.9, 0.1, 1] } },
        { frame: 10, value: 1 },
      ],
    };
    expect(numericTrackValue(track, 5, 0)).toBeGreaterThan(0.5);
  });

  it('accepte les primitives visuelles P1.4', () => {
    const invalid = plan();
    invalid.scenes[0]!.nodes = [
      {
        id: 'image',
        type: 'image',
        box: { x: 0, y: 0, w: 100, h: 100 },
        origin: { x: 0.5, y: 0.5 },
        opacity: 1,
        transform: { translate_x: 0, translate_y: 0, scale: 1, rotate: 0 },
        must_be_safe: false,
        tracks: [],
        asset: 'future_asset',
        fit: 'cover',
        crop: { x: 0, y: 0, w: 100, h: 100 },
        destination: { x: 0, y: 0, w: 100, h: 100 },
        focal_point: { x: 0.5, y: 0.5 },
        semantic_regions: [],
        treatment: { grade: 'none', contrast: 0, grain: 0, duotone: null },
      },
    ];
    expect(() => assertP12Plan(invalid)).not.toThrow();
  });

  it('accepte les tracks typographiques uniquement en RenderPlan 0.4.0', () => {
    const dynamic = plan();
    const group = dynamic.scenes[0]!.nodes[0]!;
    if (group.type !== 'group') throw new Error('group attendu');
    const text = group.children.find((node) => node.type === 'text');
    if (!text || text.type !== 'text') throw new Error('text attendu');
    text.tracks = [{ id: 'track_dynamic', property: 'font_axis.wght', target: { run: 'run' }, source: 'axis_behavior', keys: [{ frame: 0, value: 400 }, { frame: 20, value: 800 }] }];
    expect(() => assertP12Plan(dynamic)).toThrow(/0\.4\.0/);
    dynamic.schema_version = '0.4.0';
    expect(() => assertP12Plan(dynamic)).not.toThrow();
  });
});
