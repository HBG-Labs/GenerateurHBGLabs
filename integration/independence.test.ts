import { describe, expect, it } from 'vitest';

import type { CreativeStyleProfile } from '@motion-engine/core';

import { loadCoreFixtureStyle, loadNocturne, loadRezoBrand } from './support.ts';

// Les styles de contrôle doivent être radicalement différents du premier cas
// d'usage : aucune couleur, aucune police, aucune personnalité de mouvement,
// de rythme ou de son en commun.

function fingerprint(style: CreativeStyleProfile) {
  return {
    colors: new Set(Object.values(style.palette).map((c) => c.toUpperCase())),
    fonts: new Set(Object.values(style.typography.families).flatMap((f) => f.files.map((file) => file.sha256))),
    cssNames: new Set(Object.values(style.typography.families).map((f) => f.css_name)),
    easings: Object.values(style.motion_personality.easings).map((e) => JSON.stringify(e)),
    tempo: JSON.stringify(style.rhythm_personality.tempo),
    reading: JSON.stringify(style.rhythm_personality.reading),
    grid: JSON.stringify(style.grid),
    rule: JSON.stringify(style.motifs['rule']),
    cues: new Set(Object.keys(style.sound_personality.cues)),
    typeScale: JSON.stringify(style.typography.scale['display.xl']),
    voice: style.voice_personality.description,
  };
}

const overlap = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x));

const reference = fingerprint(loadRezoBrand().style);
const controls: [string, CreativeStyleProfile][] = [
  ['control_nocturne', loadNocturne()],
  ['fixture_ink', loadCoreFixtureStyle('fixture_ink')],
  ['fixture_signal', loadCoreFixtureStyle('fixture_signal')],
];

describe.each(controls)('%s n’emprunte rien au premier cas d’usage', (_id, style) => {
  const control = fingerprint(style);

  it('aucune couleur, aucun fichier de police, aucun nom de police en commun', () => {
    expect(overlap(control.colors, reference.colors)).toEqual([]);
    expect(overlap(control.fonts, reference.fonts)).toEqual([]);
    expect(overlap(control.cssNames, reference.cssNames)).toEqual([]);
  });

  it('aucune courbe d’animation, aucun tempo, aucune lecture en commun', () => {
    expect(control.easings.filter((e) => reference.easings.includes(e))).toEqual([]);
    expect(control.tempo).not.toBe(reference.tempo);
    expect(control.reading).not.toBe(reference.reading);
  });

  it('ni grille, ni trait, ni échelle typographique, ni sons, ni voix en commun', () => {
    expect(control.grid).not.toBe(reference.grid);
    expect(control.rule).not.toBe(reference.rule);
    expect(control.typeScale).not.toBe(reference.typeScale);
    expect(overlap(control.cues, reference.cues)).toEqual([]);
    expect(control.voice).not.toBe(reference.voice);
  });
});
