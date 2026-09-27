/**
 * Contrat de rôles : le vocabulaire commun entre les patterns (qui nomment
 * des rôles) et les styles (qui leur donnent des valeurs). Un style doit
 * fournir tous les rôles requis ; il peut en ajouter d'autres, mais les
 * patterns génériques ne s'appuient que sur ceux-ci.
 */
export const STYLE_ROLE_CONTRACT_VERSION = '0.1.0';

export const REQUIRED_COLOR_ROLES = [
  'surface.primary',
  'surface.inverse',
  'text.primary',
  'text.inverse',
  'accent',
] as const;

export const REQUIRED_TYPE_ROLES = ['display.xl', 'display.l', 'display.m', 'headline', 'body', 'subtitle'] as const;

export const REQUIRED_EASING_ROLES = ['enter', 'exit', 'inout', 'settle'] as const;

export const REQUIRED_STROKE_ROLES = ['hairline', 'emphasis'] as const;

export const REQUIRED_SPACE_ROLES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

/** `rule` : le trait graphique du style (signature, soulignement, liaison entre scènes). */
export const REQUIRED_MOTIF_ROLES = ['rule'] as const;

/** Paires texte/fond qui doivent rester lisibles (WCAG, texte courant). */
export const CONTRAST_PAIRS = [
  { text: 'text.primary', surface: 'surface.primary', min: 4.5 },
  { text: 'text.inverse', surface: 'surface.inverse', min: 4.5 },
] as const;

/** Accent posé sur la surface principale : seuil « grand texte ». */
export const ACCENT_CONTRAST = { text: 'accent', surface: 'surface.primary', min: 3 } as const;
