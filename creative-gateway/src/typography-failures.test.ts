import { describe, expect, it } from 'vitest';

import { TypographyEngineError } from '@motion-engine/core';

import { classifyGatewayTypographyFailure } from './typography-failures.ts';

describe('frontière typée des erreurs typographiques Gateway', () => {
  it('classe missing_glyph comme réparable sans exposer le contenu brut', () => {
    const result = classifyGatewayTypographyFailure(new TypographyEngineError({
      code: 'font.missing_glyph',
      message: 'glyph absent pour « DONNEE_BRUTE_UNIQUE »',
    }));
    expect(result).toMatchObject({
      typography_code: 'font.missing_glyph',
      gateway_code: 'gateway.output.font_missing_glyph',
      repairable: true,
    });
    expect(result.message).not.toContain('DONNEE_BRUTE_UNIQUE');
  });

  it.each([
    ['font.corrupt_or_unsupported', 'gateway.subtitle_preflight.font_corrupt_or_unsupported'],
    ['text.shape_mismatch', 'gateway.subtitle_preflight.text_shape_mismatch'],
  ] as const)('structure %s sans le rendre réparable', (code, gatewayCode) => {
    expect(classifyGatewayTypographyFailure(new TypographyEngineError({ code, message: 'détail interne' })))
      .toMatchObject({ typography_code: code, gateway_code: gatewayCode, repairable: false });
  });

  it('ne masque ni une exception non typée ni un futur code TypographyEngineError inconnu', () => {
    const programmingError = new Error('programming failure');
    expect(() => classifyGatewayTypographyFailure(programmingError)).toThrow(programmingError);
    const unknownTyped = new TypographyEngineError({ code: 'font.future_failure', message: 'nouveau code' });
    expect(() => classifyGatewayTypographyFailure(unknownTyped)).toThrow(unknownTyped);
  });
});
