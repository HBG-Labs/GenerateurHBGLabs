import type { BrandMotionProfile, LexiconEntry } from '../contracts/brand-profile.ts';
import type { DocumentRef } from '../contracts/common.ts';
import { RESOLVED_STYLE_SCHEMA, RESOLVED_STYLE_VERSION, ResolvedStyleSchema } from '../contracts/resolved-style.ts';
import type { ResolvedStyle, StyleMode } from '../contracts/resolved-style.ts';
import type { SeriesMotionProfile } from '../contracts/series-profile.ts';
import { CreativeStyleProfileSchema, OVERRIDABLE_STYLE_SECTIONS } from '../contracts/style-profile.ts';
import type { CreativeStyleProfile } from '../contracts/style-profile.ts';
import { hashDocument } from '../integrity/canonical.ts';
import { hasErrors, IssueCollector } from '../validation/issues.ts';
import type { ValidationIssue, ValidationResult } from '../validation/issues.ts';
import { validateStyleSemantics } from '../validation/semantic-style.ts';
import { formatPath } from '../validation/structural.ts';
import { deepEqual, deepMerge, getAtPath, leafPaths, pathsOverlap } from './paths.ts';

/**
 * Entrées de la résolution. Un seul des trois modes à la fois :
 * - créatif : `style` seul (écrit ou généré par le Creative Director) ;
 * - marque : `brand` (profil + le style qu'il désigne) ;
 * - série : `series` (profil + son style), plus `brand` si la série en désigne une.
 */
export interface ResolveStyleInput {
  style?: CreativeStyleProfile;
  brand?: { profile: BrandMotionProfile; style: CreativeStyleProfile };
  series?: { profile: SeriesMotionProfile; style: CreativeStyleProfile };
}

function refOf(doc: { id: string; version: string }): DocumentRef {
  return { id: doc.id, version: doc.version, sha256: hashDocument(doc) };
}

function checkRef(c: IssueCollector, path: string, ref: DocumentRef, target: { id: string; version: string }) {
  if (ref.id !== target.id || ref.version !== target.version) {
    c.error('ref.mismatch', path, `référence ${ref.id}@${ref.version}, document fourni ${target.id}@${target.version}`);
  } else if (ref.sha256 !== hashDocument(target)) {
    c.error('ref.hash_mismatch', path, `le document ${target.id}@${target.version} a changé depuis sa référence`);
  }
}

function union(...lists: (readonly string[])[]): string[] {
  return [...new Set(lists.flat())].sort();
}

function mergeLexicons(c: IssueCollector, lists: { source: string; entries: readonly LexiconEntry[] }[]): LexiconEntry[] {
  const out = new Map<string, LexiconEntry & { source: string }>();
  for (const { source, entries } of lists) {
    for (const entry of entries) {
      const key = `${entry.term.toLowerCase()}|${entry.locale ?? '*'}`;
      const previous = out.get(key);
      if (previous && previous.say !== entry.say) {
        c.error(
          'lexicon.conflict',
          `${source}.lexicon`,
          `« ${entry.term} » se prononce « ${previous.say} » (${previous.source}) et « ${entry.say} » (${source})`,
        );
      } else if (!previous) {
        out.set(key, { ...entry, source });
      }
    }
  }
  return [...out.values()].map(({ source: _source, ...entry }) => entry);
}

export function resolveStyle(input: ResolveStyleInput): ValidationResult<ResolvedStyle> {
  const c = new IssueCollector();
  const { style: creative, brand, series } = input;

  // 1. Mode : un seul chemin d'entrée, jamais d'arbitrage implicite.
  let mode: StyleMode;
  if (series) mode = 'series';
  else if (brand) mode = 'brand';
  else if (creative) mode = 'creative';
  else return { ok: false, issues: [{ code: 'resolve.no_style', path: '', message: 'aucun style fourni', severity: 'error' }] };
  if (creative && (brand || series)) {
    c.error('resolve.ambiguous_base', 'style', 'un style libre ne se combine pas avec une marque ou une série : il serait ignoré');
  }

  // 2. Références figées : chaque profil désigne exactement le document fourni.
  if (brand) checkRef(c, 'brand.style.ref', brand.profile.style.ref, brand.style);
  if (series) {
    checkRef(c, 'series.style.ref', series.profile.style.ref, series.style);
    const seriesBrand = series.profile.brand;
    if (seriesBrand && !brand) c.error('series.brand_missing', 'series.brand', `la série exige la marque ${seriesBrand.ref.id}`);
    if (seriesBrand && brand) checkRef(c, 'series.brand.ref', seriesBrand.ref, brand.profile);
    if (!seriesBrand && brand) c.error('series.brand_unexpected', 'brand', 'une marque est fournie mais la série n’en désigne aucune');
  }

  const base = series?.style ?? brand?.style ?? creative;
  if (!base) throw new Error('style de base introuvable');
  for (const [label, doc] of [
    ['style', base],
    ...(brand && series ? ([['brand.style', brand.style]] as const) : []),
  ] as const) {
    for (const issue of validateStyleSemantics(doc, label)) c.issues.push(issue);
  }

  // 3. Surcharges de série : sections autorisées, jamais sur un chemin verrouillé.
  const brandLocks = brand?.profile.locks ?? [];
  let effective: CreativeStyleProfile = structuredClone(base);
  const applied: { source: 'series'; path: string }[] = [];
  if (series) {
    for (const [section, patch] of Object.entries(series.profile.overrides)) {
      const path = `series.overrides.${section}`;
      if (!(OVERRIDABLE_STYLE_SECTIONS as readonly string[]).includes(section)) {
        c.error('override.not_overridable', path, `la section « ${section} » ne peut pas être surchargée`);
        continue;
      }
      const leaves = leafPaths(patch, section);
      const locked = leaves.filter((leaf) => brandLocks.some((lock) => pathsOverlap(leaf, lock)));
      if (locked.length > 0) {
        c.error('lock.violation', path, `chemins verrouillés par la marque : ${locked.join(', ')}`);
        continue;
      }
      effective = { ...effective, [section]: deepMerge(effective[section as keyof CreativeStyleProfile], patch) };
      for (const leaf of leaves) applied.push({ source: 'series', path: leaf });
    }
  }

  // 4. Verrous de marque : le style effectif doit garder les valeurs de la marque.
  if (brand) {
    for (const lock of brandLocks) {
      const expected = getAtPath(brand.style, lock);
      const actual = getAtPath(effective, lock);
      if (!expected.found) {
        c.error('lock.unknown_path', 'brand.locks', `chemin verrouillé « ${lock} » absent du style de la marque`);
      } else if (!actual.found || !deepEqual(expected.value, actual.value)) {
        c.error('lock.violation', `style.${lock}`, `« ${lock} » est verrouillé par la marque et diffère dans le style de la série`);
      }
    }
  }

  // 5. Interdits : ils s'additionnent, jamais ne se retirent.
  effective = {
    ...effective,
    forbidden: {
      behaviors: union(effective.forbidden.behaviors, brand?.style.forbidden.behaviors ?? []),
      style_tags: union(effective.forbidden.style_tags, brand?.style.forbidden.style_tags ?? [], series?.profile.extra_forbidden_tags ?? []),
    },
  };

  // 6. Le style effectif est un style complet et valide.
  const reparsed = CreativeStyleProfileSchema.safeParse(effective);
  if (!reparsed.success) {
    for (const issue of reparsed.error.issues) {
      c.error(`style.schema.${issue.code}`, `style.${formatPath(issue.path)}`, issue.message);
    }
  } else if (applied.length > 0) {
    for (const issue of validateStyleSemantics(reparsed.data, 'style(effectif)')) c.issues.push(issue);
  }

  // 7. Identité et signature : leurs jetons existent dans le style effectif.
  const logos = brand?.profile.logos ?? {};
  for (const [key, logo] of Object.entries(logos)) {
    if (!effective.typography.scale[logo.type.slice(5)]) {
      c.error('identity.token_unknown', `brand.logos.${key}.type`, `« ${logo.type} » absent du style`);
    }
    logo.runs.forEach((run, i) => {
      if (!effective.palette[run.color.slice(6)]) {
        c.error('identity.token_unknown', `brand.logos.${key}.runs[${i}].color`, `« ${run.color} » absent du style`);
      }
    });
  }
  const endCardLogo = brand?.profile.mandatory.end_card_logo ?? null;
  if (endCardLogo !== null && !logos[endCardLogo]) {
    c.error('identity.unknown_logo', 'brand.mandatory.end_card_logo', `logo « ${endCardLogo} » non défini`);
  }
  const signature = series?.profile.signature ?? null;
  if (signature) {
    for (const motif of signature.recurring_motifs) {
      if (!effective.motifs[motif]) c.error('series.unknown_motif', 'series.signature.recurring_motifs', `motif « ${motif} » absent du style`);
    }
    if (signature.sound_signature && !effective.sound_personality.cues[signature.sound_signature]) {
      c.error('series.unknown_cue', 'series.signature.sound_signature', `cue « ${signature.sound_signature} » absent du style`);
    }
  }
  const fixed = series?.profile.variation_budget.fixed ?? [];
  for (const path of fixed) {
    if (!getAtPath(effective, path).found) c.error('series.fixed_unknown', 'series.variation_budget.fixed', `chemin « ${path} » absent du style`);
  }

  const lexicon = mergeLexicons(c, [
    { source: 'brand', entries: brand?.profile.lexicon ?? [] },
    { source: 'series', entries: series?.profile.lexicon ?? [] },
  ]);

  if (hasErrors(c.issues)) return { ok: false, issues: c.issues };

  const body: Omit<ResolvedStyle, 'sha256'> = {
    schema: RESOLVED_STYLE_SCHEMA,
    schema_version: RESOLVED_STYLE_VERSION,
    mode,
    sources: {
      style: { ...refOf(base), origin: base.origin },
      brand: brand ? refOf(brand.profile) : null,
      series: series ? refOf(series.profile) : null,
    },
    style: effective,
    identity: {
      name: brand?.profile.name ?? null,
      logos,
      lexicon,
      claims_forbid: brand?.profile.claims_policy.forbid ?? [],
      disclaimer: brand?.profile.claims_policy.disclaimer ?? null,
      end_card_logo: endCardLogo,
      asset_priority: brand?.profile.assets.priority ?? [],
      allow_generated_images: brand?.profile.assets.allow_generated_images ?? true,
      approved_assets: brand?.profile.assets.approved ?? [],
    },
    signature,
    locks: union(brandLocks, fixed),
    applied_overrides: applied,
  };
  const resolved = ResolvedStyleSchema.parse({ ...body, sha256: hashDocument(body) });
  return { ok: true, value: resolved, warnings: c.issues };
}

/** Empreinte attendue d'un style résolu (tout sauf le champ `sha256`). */
export function resolvedStyleHash(resolved: ResolvedStyle): string {
  const { sha256: _sha256, ...body } = resolved;
  return hashDocument(body);
}

export type { ValidationIssue };
