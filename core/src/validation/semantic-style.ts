import type { CreativeStyleProfile } from '../contracts/style-profile.ts';
import {
  ACCENT_CONTRAST,
  CONTRAST_PAIRS,
  REQUIRED_COLOR_ROLES,
  REQUIRED_EASING_ROLES,
  REQUIRED_MOTIF_ROLES,
  REQUIRED_SPACE_ROLES,
  REQUIRED_STROKE_ROLES,
  REQUIRED_TYPE_ROLES,
  STYLE_ROLE_CONTRACT_VERSION,
} from '../contracts/style-roles.ts';
import { contrastRatio } from '../style/contrast.ts';
import { IssueCollector } from './issues.ts';
import type { ValidationIssue } from './issues.ts';

function roleKey(ref: string): string {
  return ref.slice(ref.indexOf('.') + 1);
}

export function validateStyleSemantics(style: CreativeStyleProfile, prefix = ''): ValidationIssue[] {
  const c = new IssueCollector();
  const at = (path: string) => (prefix ? `${prefix}.${path}` : path);

  if (style.role_contract !== STYLE_ROLE_CONTRACT_VERSION) {
    c.error('style.role_contract', at('role_contract'), `contrat de rôles ${style.role_contract} non pris en charge (attendu ${STYLE_ROLE_CONTRACT_VERSION})`);
  }

  const requireRoles = (table: Record<string, unknown>, roles: readonly string[], section: string) => {
    for (const role of roles) {
      if (!Object.prototype.hasOwnProperty.call(table, role)) {
        c.error('style.missing_role', at(section), `rôle requis « ${role} » absent`);
      }
    }
  };
  requireRoles(style.palette, REQUIRED_COLOR_ROLES, 'palette');
  requireRoles(style.typography.scale, REQUIRED_TYPE_ROLES, 'typography.scale');
  requireRoles(style.motion_personality.easings, REQUIRED_EASING_ROLES, 'motion_personality.easings');
  requireRoles(style.strokes, REQUIRED_STROKE_ROLES, 'strokes');
  requireRoles(style.space, REQUIRED_SPACE_ROLES, 'space');
  requireRoles(style.motifs, REQUIRED_MOTIF_ROLES, 'motifs');

  for (const [key, typeStyle] of Object.entries(style.typography.scale)) {
    const family = style.typography.families[typeStyle.family];
    const path = at(`typography.scale.${key}`);
    if (!family) {
      c.error('type.unknown_family', path, `famille « ${typeStyle.family} » absente`);
    } else if (!family.files.some((f) => f.weight === typeStyle.weight && f.style === 'normal')) {
      c.error('type.missing_weight', path, `aucun fichier ${typeStyle.family} en graisse ${typeStyle.weight}`);
    }
  }

  for (const [key, motif] of Object.entries(style.motifs)) {
    if (!style.strokes[motif.weight]) c.error('motif.unknown_stroke', at(`motifs.${key}.weight`), `trait « ${motif.weight} » absent`);
  }

  const colorRef = (ref: string | null, path: string) => {
    if (ref !== null && !style.palette[roleKey(ref)]) c.error('token.unknown', at(path), `couleur « ${ref} » absente de la palette`);
  };
  const sub = style.subtitle_style;
  if (!style.typography.scale[roleKey(sub.type)]) {
    c.error('token.unknown', at('subtitle_style.type'), `style typographique « ${sub.type} » absent`);
  }
  colorRef(sub.color, 'subtitle_style.color');
  colorRef(sub.backdrop, 'subtitle_style.backdrop');
  if (style.image_treatment.duotone) {
    colorRef(style.image_treatment.duotone.dark, 'image_treatment.duotone.dark');
    colorRef(style.image_treatment.duotone.light, 'image_treatment.duotone.light');
  }
  if (style.image_treatment.grade === 'duotone' && !style.image_treatment.duotone) {
    c.error('image.duotone_missing', at('image_treatment.duotone'), 'un traitement duotone exige ses deux couleurs');
  }
  style.illustration_treatment.palette_roles.forEach((ref, i) => colorRef(ref, `illustration_treatment.palette_roles[${i}]`));

  for (const [kind, cue] of Object.entries(style.sound_personality.event_cues)) {
    if (cue && !style.sound_personality.cues[cue]) {
      c.error('sound.unknown_cue', at(`sound_personality.event_cues.${kind}`), `cue « ${cue} » non défini`);
    }
  }

  const forbidden = new Set(style.forbidden.behaviors);
  for (const id of forbidden) {
    if (style.motion_personality.behaviors[id]?.allowed) {
      c.error('behavior.contradiction', at(`motion_personality.behaviors.${id}`), `${id} est à la fois autorisé et interdit`);
    }
  }
  const prefs = style.transition_preferences;
  for (const id of prefs.preferred) {
    if (forbidden.has(id)) c.error('transition.forbidden', at('transition_preferences.preferred'), `${id} préféré mais interdit`);
    if (prefs.avoid.includes(id)) c.error('transition.contradiction', at('transition_preferences'), `${id} à la fois préféré et évité`);
  }

  const { width, height } = style.reference_canvas;
  const m = style.grid.margin;
  if (m.left + m.right >= width || m.top + m.bottom >= height) {
    c.error('grid.margins', at('grid.margin'), 'les marges ne laissent aucune zone utile');
  } else if (style.grid.gutter * (style.grid.columns - 1) >= width - m.left - m.right) {
    c.error('grid.gutter', at('grid.gutter'), 'les gouttières dépassent la largeur utile');
  }

  // Lisibilité : garde-fou valable pour un style écrit comme pour un style généré.
  for (const pair of CONTRAST_PAIRS) {
    const text = style.palette[pair.text];
    const surface = style.palette[pair.surface];
    if (text && surface && contrastRatio(text, surface) < pair.min) {
      c.error(
        'style.contrast',
        at('palette'),
        `${pair.text} sur ${pair.surface} : ${contrastRatio(text, surface).toFixed(2)} < ${pair.min}`,
      );
    }
  }
  const accent = style.palette[ACCENT_CONTRAST.text];
  const surface = style.palette[ACCENT_CONTRAST.surface];
  if (accent && surface && contrastRatio(accent, surface) < ACCENT_CONTRAST.min) {
    c.warn(
      'style.accent_contrast',
      at('palette.accent'),
      `accent sur surface principale : ${contrastRatio(accent, surface).toFixed(2)} < ${ACCENT_CONTRAST.min}`,
    );
  }

  return c.issues;
}
