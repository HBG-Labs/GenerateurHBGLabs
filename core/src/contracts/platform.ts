import { z } from 'zod';

import { PLATFORMS, SemVerSchema } from './common.ts';

export const PLATFORM_PRESETS_SCHEMA = 'platform-presets';
export const PLATFORM_PRESETS_VERSION = '0.1.0';

const Px = z.number().finite().min(0).max(4000);

/**
 * Faits de plateforme (zones masquées par l'interface, formats) : ils ne
 * dépendent d'aucun style ni d'aucune marque et sont fournis comme données.
 */
export const PlatformPresetsSchema = z.strictObject({
  schema: z.literal(PLATFORM_PRESETS_SCHEMA),
  schema_version: SemVerSchema,
  version: SemVerSchema,
  formats: z.record(
    z.string().regex(/^[a-z][a-z0-9_]*$/),
    z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
  ),
  platforms: z.partialRecord(
    z.enum(PLATFORMS),
    z.strictObject({
      formats: z.array(z.string()).min(1),
      /** Zones sûres en pixels, pour le format de référence indiqué. */
      safe_zone: z.strictObject({
        format: z.string(),
        insets: z.strictObject({ top: Px, right: Px, bottom: Px, left: Px }),
      }),
      note: z.string().max(300).optional(),
    }),
  ),
});
export type PlatformPresets = z.infer<typeof PlatformPresetsSchema>;
