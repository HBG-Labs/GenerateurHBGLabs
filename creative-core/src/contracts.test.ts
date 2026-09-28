import { describe, expect, it } from 'vitest';

import { CreativePlanSchema } from './contracts/creative-plan.ts';
import { KNOWN_CREATIVE_INTENTS } from './contracts/intents.ts';
import { loadFixture, loadValidFixture } from './test-support.ts';
import { validateCreativePlan } from './validation.ts';

describe('CreativePlan 0.1.0', () => {
  it.each(['hypothetical', 'educational', 'product-demo', 'minimal'] as const)(
    'valide la fixture %s',
    (name) => {
      const result = validateCreativePlan(loadFixture(name));
      expect(result.ok, JSON.stringify(result.report.diagnostics, null, 2)).toBe(true);
      expect(result.report.status).toBe('pass');
      expect(result.report.eligible_for_compilation).toBe(true);
      expect(result.canonical_sha256).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it('garde les intentions extensibles sans enum fermé', () => {
    const plan = structuredClone(loadValidFixture());
    plan.creative_intent.primary = 'new_editorial_intent';
    expect(CreativePlanSchema.safeParse(plan).success).toBe(true);
    expect(KNOWN_CREATIVE_INTENTS).toContain('hypothetical');
  });

  it('sépare narration, texte écran et sens', () => {
    const plan = loadValidFixture('hypothetical');
    const first = plan.scenes[0]!;
    expect(first.content.spoken[0]!.text).not.toBe(first.content.on_screen[0]!.text);
    expect(first.content.semantic_meaning).toContain('hypothétique');
  });

  it('représente les assets par slots sans URL', () => {
    const plan = loadValidFixture('product-demo');
    expect(plan.asset_intents.map((asset) => asset.slot)).toEqual(['timer_product', 'timer_step_icons']);
    expect(JSON.stringify(plan.asset_intents)).not.toMatch(/https?:\/\//);
  });

  it('représente audio et sous-titres sans timing bas niveau', () => {
    const plan = loadValidFixture('hypothetical');
    expect(plan.global_intents.audio?.narration).toBe('required');
    expect(plan.global_intents.subtitles?.required).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/keyframe|glyph|frame_index|phoneme/i);
  });

  it('préserve le contenu typographique français et Unicode', () => {
    const plan = loadValidFixture('hypothetical');
    const text = plan.scenes.flatMap((scene) => scene.content.on_screen.map((entry) => entry.text)).join(' ');
    expect(text).toContain('S’ARRÊTAIT');
    expect(plan.scenes[1]!.content.on_screen[0]!.text).toContain('1 600 km/h');
  });

  it('refuse les champs inconnus', () => {
    const plan = { ...loadValidFixture(), provider_model: 'forbidden' };
    const result = validateCreativePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.report.diagnostics.some((issue) => issue.code === 'schema.unknown_field')).toBe(true);
  });
});
