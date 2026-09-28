import { describe, expect, it } from 'vitest';

import type { CreativePlan } from './contracts/creative-plan.ts';
import { runCreativePreflight } from './preflight.ts';
import { loadFixture, loadValidFixture } from './test-support.ts';
import { validateCreativePlan } from './validation.ts';

function codes(plan: CreativePlan): string[] {
  return runCreativePreflight(plan).diagnostics.map((issue) => issue.code);
}

describe('creative preflight', () => {
  it('retourne plusieurs diagnostics structurés et actionnables pour la fixture invalide', () => {
    const result = validateCreativePlan(loadFixture('invalid'));
    expect(result.ok).toBe(false);
    expect(result.report.status).toBe('fail');
    expect(result.report.eligible_for_compilation).toBe(false);
    expect(result.report.diagnostics.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'creative.asset_intent_incoherent',
        'creative.hook_required',
        'creative.scene_empty',
        'id.duplicate',
        'reference.asset_slot_missing',
        'reference.narrative_scene_missing',
      ]),
    );
    expect(result.report.diagnostics.every((issue) => issue.path.startsWith('$'))).toBe(true);
    expect(result.report.diagnostics.every((issue) => issue.suggested_action)).toBe(true);
  });

  it('autorise explicitement une structure sans hook lorsque la politique ne le requiert pas', () => {
    const plan = loadFixture('invalid') as CreativePlan;
    const report = runCreativePreflight(plan, {
      require_hook: false,
      limits: {
        max_json_bytes: 1_048_576,
        max_depth: 24,
        max_nodes: 50_000,
        max_string_characters: 100_000,
        max_scenes: 48,
        max_duration_seconds: 180,
        max_script_characters: 30_000,
        max_on_screen_characters_per_scene: 1_000,
        max_asset_intents: 128,
        max_elements_per_scene: 32,
        max_content_items_per_scene: 128,
        max_narrative_sections: 64,
      },
    });
    expect(report.diagnostics.some((issue) => issue.code === 'creative.hook_required')).toBe(false);
  });

  it('détecte une narration incohérente sans bloquer à elle seule', () => {
    const plan = structuredClone(loadValidFixture('minimal'));
    plan.scenes[0]!.content.spoken = [{ id: 'minimal_spoken', text: 'Bonjour.' }];
    plan.scenes[0]!.audio = { narration: 'none', music: 'none', sfx: 'none', ambience: 'none', events: [] };
    const report = runCreativePreflight(plan);
    expect(report.status).toBe('warn');
    expect(report.eligible_for_compilation).toBe(true);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'creative.narration_incoherent', severity: 'warning' })]),
    );
  });

  it('détecte une source requise non affectée sans inventer de source', () => {
    const plan = structuredClone(loadValidFixture('minimal'));
    plan.scenes[0]!.content.claims = [
      {
        id: 'minimal_claim',
        statement: 'Affirmation à vérifier.',
        classification: 'factual_claim',
        uncertainty: 'unknown',
        source_requirement: 'required',
      },
    ];
    expect(codes(plan)).toContain('creative.source_required_unassigned');
  });

  it('détecte les références visuelles et typographiques invalides', () => {
    const plan = structuredClone(loadValidFixture('minimal'));
    plan.scenes[0]!.visual = {
      mode: 'mixed',
      focal_element: 'missing_element',
      elements: [],
      hierarchy_relationships: [
        { id: 'broken_relation', from: 'missing_from', to: 'missing_to', relation: 'supports' },
      ],
    };
    plan.scenes[0]!.typography = {
      character: 'bold',
      treatments: [{ id: 'broken_type', content_id: 'missing_content', role: 'headline', character: 'bold', emphasis: 1 }],
    };
    expect(codes(plan)).toEqual(
      expect.arrayContaining([
        'reference.focal_element_missing',
        'reference.visual_element_missing',
        'reference.typography_content_missing',
      ]),
    );
  });

  it('classe toujours les erreurs avant les warnings puis les infos', () => {
    const result = validateCreativePlan(loadFixture('invalid'));
    const severities = result.report.diagnostics.map((issue) => issue.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a] - ({ error: 0, warning: 1, info: 2 })[b]));
  });
});
