export interface FormattedTypography {
  source_text: string;
  formatted_text: string;
  locale: string;
  transformations: readonly string[];
}

const NNBSP = '\u202f';
const NBSP = '\u00a0';

/**
 * Normalisation typographique conservative : elle ne change aucun mot ni
 * signe, seulement les apostrophes et espaces autour de signes déjà présents.
 */
export function formatTypography(sourceText: string, locale: string): FormattedTypography {
  let text = sourceText.normalize('NFC');
  const transformations: string[] = [];
  const replace = (next: string, name: string): void => {
    if (next !== text) transformations.push(name);
    text = next;
  };

  replace(text.replace(/(?<=\p{L})'(?=\p{L})/gu, '’'), 'apostrophe.typographic');

  if (/^fr(?:-|$)/iu.test(locale)) {
    replace(text.replace(/«[ \t\u00a0\u202f]*/gu, `«${NNBSP}`), 'guillemets.open_nnbsp');
    replace(text.replace(/[ \t\u00a0\u202f]*»/gu, `${NNBSP}»`), 'guillemets.close_nnbsp');
    replace(text.replace(/[ \t\u00a0\u202f]*([?!;])/gu, `${NNBSP}$1`), 'punctuation.high_nnbsp');
    replace(text.replace(/[ \t\u00a0\u202f]*:/gu, `${NBSP}:`), 'punctuation.colon_nbsp');
    replace(
      text.replace(
        /(\d(?:[.,]\d+)?)[ \t]+(%|‰|°C|°F|kg|mg|g|km|cm|mm|m|s|min|h|kW|W|V|€|EUR)\b/gu,
        `$1${NNBSP}$2`,
      ),
      'number.unit_nnbsp',
    );
  }

  return { source_text: sourceText, formatted_text: text, locale, transformations };
}

export const FRENCH_TYPOGRAPHY_SPACES = Object.freeze({ narrow_no_break: NNBSP, no_break: NBSP });
