import { describe, expect, it } from 'vitest';

import { clone, readFixture } from '../test-support.ts';
import { parseStructure } from '../validation/structural.ts';
import { BrandMotionProfileSchema } from './brand-profile.ts';
import { LocaleSchema, ResourceRefSchema } from './common.ts';
import { CreativeIntentSchema } from './creative-intent.ts';
import { MotionSceneSpecSchema } from './motion-spec.ts';
import { PlatformPresetsSchema } from './platform.ts';
import { SeriesMotionProfileSchema } from './series-profile.ts';
import { CreativeStyleProfileSchema } from './style-profile.ts';

const spec = () => clone(readFixture('moon.spec.json'));
const ok = (schema: Parameters<typeof parseStructure>[0], doc: unknown) => parseStructure(schema, doc).ok;

describe('contrats structurels', () => {
  it('acceptent toutes les fixtures neutres', () => {
    expect(ok(CreativeIntentSchema, readFixture('moon.intent.json'))).toBe(true);
    expect(ok(MotionSceneSpecSchema, spec())).toBe(true);
    expect(ok(CreativeStyleProfileSchema, readFixture('profiles/fixture_ink.style.json'))).toBe(true);
    expect(ok(CreativeStyleProfileSchema, readFixture('profiles/fixture_signal.style.json'))).toBe(true);
    expect(ok(BrandMotionProfileSchema, readFixture('profiles/fixture_brand.brand.json'))).toBe(true);
    expect(ok(SeriesMotionProfileSchema, readFixture('profiles/fixture_series.series.json'))).toBe(true);
    expect(ok(PlatformPresetsSchema, readFixture('platforms.json'))).toBe(true);
  });

  it('refusent toute clé inconnue : aucune frame ne se glisse dans la spec', () => {
    const doc = spec();
    doc.scenes[0].start_frame = 12;
    const result = parseStructure(MotionSceneSpecSchema, doc);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((i) => i.path)).toContain('scenes[0]');
  });

  it('refusent une durée en frames ou en millisecondes', () => {
    for (const tail of [{ frames: 6 }, { ms: 200 }]) {
      const doc = spec();
      doc.scenes[0].timing.tail = tail;
      expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
    }
  });

  it('refusent une valeur de couleur dans la spec : seulement des rôles', () => {
    const doc = spec();
    doc.scenes[0].layers[0].style.color = '#FFFFFF';
    expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
  });

  it('refusent un jeton du mauvais espace de noms', () => {
    const doc = spec();
    doc.scenes[0].layers[0].style.type = 'color.accent';
    expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
  });

  it('refusent un placement en pixels (la grille est en colonnes entières)', () => {
    const doc = spec();
    doc.scenes[0].layers[0].placement = { col: 96.5, row: 1, col_span: 4, row_span: 2 };
    expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
  });

  it('refusent un identifiant de comportement hors grammaire', () => {
    const doc = spec();
    doc.scenes[0].layers[0].behaviors[0].behavior = 'revealText';
    expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
  });

  it('acceptent des calques imbriqués (group, mask) et restent stricts en profondeur', () => {
    const doc = spec();
    const text = doc.scenes[0].layers[0];
    doc.scenes[0].layers[0] = {
      id: 'grp_question',
      primitive: 'group',
      behaviors: [],
      children: [{ id: 'msk_question', primitive: 'mask', clip: { shape: 'rect' }, behaviors: [], children: [text] }],
    };
    expect(ok(MotionSceneSpecSchema, doc)).toBe(true);
    doc.scenes[0].layers[0].children[0].children[0].bogus = true;
    expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
  });

  it('enregistrent les axes de variation structurés du pattern', () => {
    const doc = spec();
    expect(Object.keys(doc.scenes[0].pattern.variation).sort()).toEqual([
      'energy',
      'hierarchy_variant',
      'layout_variant',
      'motion_variant',
    ]);
    doc.scenes[0].pattern.variation.energy = 'extreme';
    expect(ok(MotionSceneSpecSchema, doc)).toBe(false);
    const extra = spec();
    extra.scenes[0].pattern.variation.color_variant = 'red';
    expect(ok(MotionSceneSpecSchema, extra)).toBe(false);
  });

  it('acceptent les étiquettes BCP 47 et refusent les autres formes', () => {
    for (const tag of ['fr-FR', 'en', 'pt-BR', 'zh-Hant-TW', 'es-419']) expect(LocaleSchema.safeParse(tag).success).toBe(true);
    for (const tag of ['french', 'fr_FR', 'FR-fr', '']) expect(LocaleSchema.safeParse(tag).success).toBe(false);
  });

  it('n’acceptent que des références pack:/lib: sans remontée ni chemin absolu', () => {
    for (const ref of ['pack:fonts/a.ttf', 'lib:serif/a-700.ttf']) expect(ResourceRefSchema.safeParse(ref).success).toBe(true);
    for (const ref of ['pack:../secret.ttf', 'lib:/etc/passwd', 'C:/fonts/a.ttf', 'https://x/a.ttf', 'fonts/a.ttf']) {
      expect(ResourceRefSchema.safeParse(ref).success).toBe(false);
    }
  });

  it('refusent une contrainte d’intent propre à un domaine', () => {
    const intent = clone(readFixture('moon.intent.json'));
    intent.constraints = ['no_fake_ui'];
    expect(ok(CreativeIntentSchema, intent)).toBe(false);
  });
});
