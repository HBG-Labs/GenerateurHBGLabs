import { TypographyEngineError } from '@motion-engine/core';

export type GatewayTypographyFailureCode =
  | 'font.missing_glyph'
  | 'font.corrupt_or_unsupported'
  | 'text.shape_mismatch';

export interface GatewayTypographyFailure {
  readonly typography_code: GatewayTypographyFailureCode;
  readonly gateway_code:
    | 'gateway.output.font_missing_glyph'
    | 'gateway.subtitle_preflight.font_corrupt_or_unsupported'
    | 'gateway.subtitle_preflight.text_shape_mismatch';
  readonly repairable: boolean;
  readonly message: string;
  readonly suggested_action: string;
}

/**
 * Frontière volontairement fermée : seules les erreurs typographiques P1
 * connues et attendues sont traduites. Une erreur non typée ou un futur code
 * P1 inconnu reste une erreur interne et doit remonter jusqu'à l'appelant.
 */
export function classifyGatewayTypographyFailure(error: unknown): GatewayTypographyFailure {
  if (!(error instanceof TypographyEngineError)) throw error;
  switch (error.diagnostic.code) {
    case 'font.missing_glyph':
      return {
        typography_code: 'font.missing_glyph',
        gateway_code: 'gateway.output.font_missing_glyph',
        repairable: true,
        message: 'La typographie sélectionnée ne peut pas représenter un ou plusieurs caractères de ce contenu provider.',
        suggested_action: 'Réécrire uniquement cette target avec des caractères français ou de texte simple pris en charge, sans changer son sens, ses IDs ou sa portée scène.',
      };
    case 'font.corrupt_or_unsupported':
      return {
        typography_code: 'font.corrupt_or_unsupported',
        gateway_code: 'gateway.subtitle_preflight.font_corrupt_or_unsupported',
        repairable: false,
        message: 'La ressource typographique sélectionnée est corrompue ou non prise en charge.',
        suggested_action: 'Corriger la ressource typographique contrôlée avant de reprendre Stage B ; ne pas demander au provider de contourner la font.',
      };
    case 'text.shape_mismatch':
      return {
        typography_code: 'text.shape_mismatch',
        gateway_code: 'gateway.subtitle_preflight.text_shape_mismatch',
        repairable: false,
        message: 'Le moteur typographique a renvoyé un résultat de shaping incohérent.',
        suggested_action: 'Diagnostiquer le moteur de shaping P1 ; ce défaut interne ne doit pas être réparé par le provider.',
      };
    default:
      throw error;
  }
}
