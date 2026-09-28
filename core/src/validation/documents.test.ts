import { describe, expect, it } from 'vitest';

import { clone, codes, minimalPlan, readFixture } from '../test-support.ts';
import {
  validateBrandProfile,
  validateIntent,
  validatePlatformPresets,
  validateRenderPlan,
  validateSeriesProfile,
  validateStyle,
} from './validate.ts';
import { documentKinds, readVersioned } from './versioning.ts';

describe('versionnement', () => {
  it('connaît tous les types de documents du moteur', () => {
    expect(documentKinds().sort()).toEqual([
      'audio-plan',
      'behavior-definition',
      'brand-motion-profile',
      'creative-intent',
      'creative-style-profile',
      'dependency-graph',
      'motion-scene-spec',
      'pattern-definition',
      'platform-presets',
      'render-plan',
      'reproducibility-manifest',
      'resolved-style',
      'series-motion-profile',
      'subtitle-plan',
    ]);
  });
  it('refuse un document d’un autre type', () => {
    expect(codes(readVersioned('motion-scene-spec', readFixture('profiles/fixture_ink.style.json')))).toEqual(['version.wrong_kind']);
  });
  it('refuse une version inconnue au lieu de l’interpréter', () => {
    const doc = clone(readFixture('moon.spec.json'));
    doc.schema_version = '0.9.0';
    expect(codes(readVersioned('motion-scene-spec', doc))).toEqual(['version.unsupported']);
  });
  it('refuse un document sans version', () => {
    const doc = clone(readFixture('moon.intent.json'));
    delete doc.schema_version;
    expect(codes(readVersioned('creative-intent', doc))).toEqual(['version.missing']);
  });
});

describe('creative intent', () => {
  it('valide l’intent neutre', () => {
    expect(validateIntent(readFixture('moon.intent.json')).ok).toBe(true);
  });
  it('refuse une emphase absente de la voix et un accent absent de l’écran', () => {
    const doc = clone(readFixture('moon.intent.json'));
    doc.beats[0].emphasis = ['soleil'];
    doc.beats[0].on_screen.accent = 'étoile';
    expect(codes(validateIntent(doc))).toEqual(['intent.emphasis_missing', 'intent.accent_missing']);
  });
  it('accepte une autre langue que le français', () => {
    const doc = clone(readFixture('moon.intent.json'));
    doc.locale = 'en-US';
    doc.beats[0].voice = 'What if the Moon disappeared?';
    doc.beats[0].on_screen = { lines: ['What if the Moon', 'disappeared?'], accent: 'disappeared?' };
    doc.beats[0].emphasis = ['disappeared'];
    expect(validateIntent(doc).ok).toBe(true);
  });
});

describe('creative style profile', () => {
  it('valide les deux styles de contrôle', () => {
    expect(validateStyle(readFixture('profiles/fixture_ink.style.json')).ok).toBe(true);
    expect(validateStyle(readFixture('profiles/fixture_signal.style.json')).ok).toBe(true);
  });
  it('exige tous les rôles du contrat', () => {
    const doc = clone(readFixture('profiles/fixture_ink.style.json'));
    delete doc.typography.scale['subtitle'];
    delete doc.motifs['rule'];
    expect(codes(validateStyle(doc))).toEqual(expect.arrayContaining(['style.missing_role']));
  });
  it('refuse un contrat de rôles inconnu', () => {
    const doc = clone(readFixture('profiles/fixture_ink.style.json'));
    doc.role_contract = '9.0.0';
    expect(codes(validateStyle(doc))).toContain('style.role_contract');
  });
  it('refuse un style typographique sans fichier de police à sa graisse', () => {
    const doc = clone(readFixture('profiles/fixture_ink.style.json'));
    doc.typography.scale['display.xl'].weight = 400;
    expect(codes(validateStyle(doc))).toContain('type.missing_weight');
  });
  it('refuse un comportement à la fois autorisé et interdit, et une transition préférée interdite', () => {
    const doc = clone(readFixture('profiles/fixture_ink.style.json'));
    doc.forbidden.behaviors.push('CUT');
    expect(codes(validateStyle(doc))).toEqual(expect.arrayContaining(['behavior.contradiction', 'transition.forbidden']));
  });
  it('refuse un texte illisible et signale un accent peu contrasté', () => {
    const unreadable = clone(readFixture('profiles/fixture_signal.style.json'));
    unreadable.palette['text.primary'] = '#F2D54A';
    expect(codes(validateStyle(unreadable))).toContain('style.contrast');
    const faint = clone(readFixture('profiles/fixture_signal.style.json'));
    faint.palette['accent'] = '#F7C948';
    const result = validateStyle(faint);
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['style.accent_contrast']);
  });
  it('exige les deux couleurs d’un traitement duotone', () => {
    const doc = clone(readFixture('profiles/fixture_signal.style.json'));
    doc.image_treatment.duotone = null;
    expect(codes(validateStyle(doc))).toContain('image.duotone_missing');
  });
});

describe('profils de marque et de série', () => {
  it('valident les fixtures', () => {
    expect(validateBrandProfile(readFixture('profiles/fixture_brand.brand.json')).ok).toBe(true);
    expect(validateSeriesProfile(readFixture('profiles/fixture_series.series.json')).ok).toBe(true);
  });
  it('refusent une valeur visuelle dans le profil de marque', () => {
    const doc = clone(readFixture('profiles/fixture_brand.brand.json'));
    doc.palette = { accent: '#123456' };
    expect(validateBrandProfile(doc).ok).toBe(false);
  });
  it('refusent un asset de marque en double', () => {
    const doc = clone(readFixture('profiles/fixture_brand.brand.json'));
    const asset = { ref: 'sky', kind: 'photo', src: 'pack:sky.jpg', sha256: 'd'.repeat(64), width: 10, height: 10, rights: 'test' };
    doc.assets.approved = [asset, asset];
    expect(codes(validateBrandProfile(doc))).toEqual(['asset.duplicate']);
  });
});

describe('presets de plateforme', () => {
  it('valident les presets et refusent un format inconnu', () => {
    expect(validatePlatformPresets(readFixture('platforms.json')).ok).toBe(true);
    const doc = clone(readFixture('platforms.json'));
    doc.platforms.tiktok.formats = ['square_1x1'];
    expect(codes(validatePlatformPresets(doc))).toEqual(['platform.unknown_format']);
  });
});

describe('render plan', () => {
  it('valide un plan cohérent', () => {
    const result = validateRenderPlan(minimalPlan());
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
  it('refuse des scènes non contiguës et une durée incohérente', () => {
    const plan = minimalPlan();
    plan.scenes[0].from = 5;
    expect(codes(validateRenderPlan(plan))).toContain('plan.scene_gap');
    const short = minimalPlan();
    short.canvas.duration_frames = 90;
    expect(codes(validateRenderPlan(short))).toContain('plan.duration');
  });
  it('refuse des clés hors de la scène, non ordonnées ou de mauvais type', () => {
    const plan = minimalPlan();
    plan.scenes[0].nodes[0].tracks[0].keys = [{ frame: 10, value: 1 }, { frame: 10, value: '#FFFFFF' }, { frame: 80, value: 1 }];
    expect(codes(validateRenderPlan(plan))).toEqual(expect.arrayContaining(['track.order', 'track.value_type', 'track.range']));
  });
  it('refuse une police non déclarée', () => {
    const plan = minimalPlan();
    plan.fonts = [];
    expect(codes(validateRenderPlan(plan))).toContain('plan.unknown_font');
  });
});
