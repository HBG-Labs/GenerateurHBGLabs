import { describe, expect, it } from 'vitest';

import type { SeriesMotionProfile } from '../contracts/series-profile.ts';
import type { CreativeStyleProfile } from '../contracts/style-profile.ts';
import { hashDocument } from '../integrity/canonical.ts';
import {
  clone,
  codes,
  loadFixtureBrand,
  loadFixtureSeries,
  loadInk,
  loadSignal,
  mustResolve,
} from '../test-support.ts';
import { validateResolvedStyle } from '../validation/validate.ts';
import { resolveStyle, resolvedStyleHash } from './resolve-style.ts';

const refTo = (doc: { id: string; version: string }) => ({ id: doc.id, version: doc.version, sha256: hashDocument(doc) });

/** Série de test adossée à la marque fictive, construite à la volée. */
function seriesOnBrand(style: CreativeStyleProfile, overrides: Record<string, unknown> = {}): SeriesMotionProfile {
  const brand = loadFixtureBrand();
  const series = clone(loadFixtureSeries().profile);
  series.style = { ref: refTo(style), src: 'pack:unused.json' };
  series.brand = { ref: refTo(brand.profile), src: 'pack:unused.json' };
  series.overrides = overrides;
  series.lexicon = [];
  series.signature.sound_signature = null;
  return series;
}

describe('resolveStyle — mode créatif', () => {
  it('résout un style seul, sans identité', () => {
    const resolved = mustResolve({ style: loadInk() });
    expect(resolved.mode).toBe('creative');
    expect(resolved.sources.brand).toBeNull();
    expect(resolved.sources.series).toBeNull();
    expect(resolved.sources.style).toMatchObject({ id: 'fixture_ink', origin: 'authored' });
    expect(resolved.identity.name).toBeNull();
    expect(resolved.identity.logos).toEqual({});
    expect(resolved.signature).toBeNull();
  });

  it('trace l’origine d’un style généré par le Creative Director', () => {
    expect(mustResolve({ style: loadSignal() }).sources.style.origin).toBe('generated');
  });

  it('est déterministe et son empreinte est vérifiable', () => {
    const a = mustResolve({ style: loadInk() });
    const b = mustResolve({ style: loadInk() });
    expect(a.sha256).toBe(b.sha256);
    expect(resolvedStyleHash(a)).toBe(a.sha256);
    expect(validateResolvedStyle(a).ok).toBe(true);
    const tampered = clone(a);
    tampered.style.palette['accent'] = '#000000';
    expect(codes(validateResolvedStyle(tampered))).toEqual(['resolved.hash_mismatch']);
  });

  it('refuse l’absence de style', () => {
    expect(codes(resolveStyle({}))).toEqual(['resolve.no_style']);
  });

  it('refuse un style invalide (rôle requis manquant, contraste insuffisant)', () => {
    const style = clone(loadInk());
    delete style.palette['accent'];
    style.palette['text.primary'] = '#1A232B';
    expect(codes(resolveStyle({ style }))).toEqual(expect.arrayContaining(['style.missing_role', 'style.contrast']));
  });
});

describe('resolveStyle — mode marque', () => {
  it('résout la marque avec son style et son identité', () => {
    const resolved = mustResolve({ brand: loadFixtureBrand() });
    expect(resolved.mode).toBe('brand');
    expect(resolved.sources.brand?.id).toBe('fixture_brand');
    expect(resolved.sources.style.id).toBe('fixture_ink');
    expect(resolved.identity.name).toContain('Boréal');
    expect(Object.keys(resolved.identity.logos)).toEqual(['primary']);
    expect(resolved.identity.end_card_logo).toBe('primary');
    expect(resolved.identity.allow_generated_images).toBe(false);
    expect(resolved.locks).toEqual(['forbidden', 'palette', 'typography.families']);
  });

  it('refuse un style modifié depuis la référence de la marque', () => {
    const brand = loadFixtureBrand();
    const style = clone(brand.style);
    style.space['xl'] = 999;
    expect(codes(resolveStyle({ brand: { profile: brand.profile, style } }))).toEqual(['ref.hash_mismatch']);
  });

  it('refuse un autre style que celui désigné par la marque', () => {
    const brand = loadFixtureBrand();
    expect(codes(resolveStyle({ brand: { profile: brand.profile, style: loadSignal() } }))).toEqual(['ref.mismatch']);
  });

  it('refuse un style libre combiné à une marque', () => {
    expect(codes(resolveStyle({ style: loadSignal(), brand: loadFixtureBrand() }))).toContain('resolve.ambiguous_base');
  });

  it('refuse un logo dont le rôle de couleur manque au style', () => {
    const brand = loadFixtureBrand();
    const profile = clone(brand.profile);
    profile.logos['primary']!.runs[0]!.color = 'color.highlight';
    expect(codes(resolveStyle({ brand: { profile, style: brand.style } }))).toEqual(['identity.token_unknown']);
  });
});

describe('resolveStyle — mode série', () => {
  it('applique les surcharges, cumule les interdits et expose la signature', () => {
    const series = loadFixtureSeries();
    const resolved = mustResolve({ series: { profile: series.profile, style: series.style } });
    expect(resolved.mode).toBe('series');
    expect(resolved.style.palette['accent']).toBe('#1F6F8B');
    expect(resolved.style.rhythm_personality.tempo.breath_ms).toBe(520);
    expect(resolved.style.rhythm_personality.tempo.beat_ms.CALM).toBe(series.style.rhythm_personality.tempo.beat_ms.CALM);
    expect(resolved.applied_overrides.map((o) => o.path)).toEqual(['palette.accent', 'rhythm_personality.tempo.breath_ms']);
    expect(resolved.style.forbidden.style_tags).toEqual(['emoji', 'soft_focus']);
    expect(resolved.signature?.sound_signature).toBe('STING');
    expect(resolved.locks).toEqual(['motifs.rule', 'typography.families']);
    expect(resolved.identity.lexicon.map((l) => l.term)).toEqual(['Horizon']);
  });

  it('ne laisse jamais une série surcharger ses interdits', () => {
    const series = loadFixtureSeries();
    const profile = clone(series.profile);
    profile.overrides = { forbidden: { behaviors: [] } };
    expect(codes(resolveStyle({ series: { profile, style: series.style } }))).toEqual(['override.not_overridable']);
  });

  it('refuse une surcharge qui rend le texte illisible', () => {
    const series = loadFixtureSeries();
    const profile = clone(series.profile);
    profile.overrides = { palette: { 'text.primary': '#FFE14D' } };
    expect(codes(resolveStyle({ series: { profile, style: series.style } }))).toContain('style.contrast');
  });

  it('refuse un motif de signature absent du style', () => {
    const series = loadFixtureSeries();
    const profile = clone(series.profile);
    profile.signature.recurring_motifs = ['wave'];
    expect(codes(resolveStyle({ series: { profile, style: series.style } }))).toEqual(['series.unknown_motif']);
  });

  it('exige la marque désignée par la série, et refuse une marque non désignée', () => {
    const ink = loadInk();
    expect(codes(resolveStyle({ series: { profile: seriesOnBrand(ink), style: ink } }))).toContain('series.brand_missing');
    const series = loadFixtureSeries();
    expect(codes(resolveStyle({ series: { profile: series.profile, style: series.style }, brand: loadFixtureBrand() }))).toContain(
      'series.brand_unexpected',
    );
  });
});

describe('resolveStyle — précédence : verrous de marque > série > style', () => {
  it('une série peut surcharger une section non verrouillée d’une marque', () => {
    const ink = loadInk();
    const resolved = mustResolve({
      series: { profile: seriesOnBrand(ink, { rhythm_personality: { tempo: { breath_ms: 900 } } }), style: ink },
      brand: loadFixtureBrand(),
    });
    expect(resolved.mode).toBe('series');
    expect(resolved.sources.brand?.id).toBe('fixture_brand');
    expect(resolved.style.rhythm_personality.tempo.breath_ms).toBe(900);
    expect(resolved.identity.logos['primary']).toBeDefined();
  });

  it('refuse une surcharge de série sur un chemin verrouillé par la marque', () => {
    const ink = loadInk();
    const result = resolveStyle({
      series: { profile: seriesOnBrand(ink, { palette: { accent: '#AA3355' } }), style: ink },
      brand: loadFixtureBrand(),
    });
    expect(codes(result)).toEqual(['lock.violation']);
  });

  it('refuse un style de série qui ne respecte pas les verrous de la marque', () => {
    const signal = loadSignal();
    const result = resolveStyle({ series: { profile: seriesOnBrand(signal), style: signal }, brand: loadFixtureBrand() });
    expect(codes(result)).toEqual(expect.arrayContaining(['lock.violation']));
  });

  it('cumule les interdits de la marque et de la série', () => {
    const ink = loadInk();
    const resolved = mustResolve({ series: { profile: seriesOnBrand(ink), style: ink }, brand: loadFixtureBrand() });
    expect(resolved.style.forbidden.behaviors).toContain('GLITCH');
    expect(resolved.style.forbidden.style_tags).toEqual(expect.arrayContaining(['glitch', 'emoji']));
  });

  it('refuse deux prononciations différentes d’un même terme', () => {
    const ink = loadInk();
    const profile = seriesOnBrand(ink);
    profile.lexicon = [{ term: 'boréal', say: 'Bo-ré-al-e', locale: 'fr-FR' }];
    expect(codes(resolveStyle({ series: { profile, style: ink }, brand: loadFixtureBrand() }))).toEqual(['lexicon.conflict']);
  });
});
