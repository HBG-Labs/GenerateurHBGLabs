import { z } from 'zod';

export const StableIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, 'stable ID attendu : minuscules, chiffres et « _ »');
export type StableId = z.infer<typeof StableIdSchema>;

/** Extension point sémantique : stable, lisible et indépendant d'un provider. */
export const SemanticTagSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, 'tag sémantique attendu : minuscules, chiffres et « _ »');

export const DottedIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, 'identifiant pointé attendu');

export const SemVerSchema = z.string().regex(/^\d+\.\d+\.\d+$/, 'version semver attendue');
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'empreinte sha256 attendue');
export const LanguageSchema = z.string().regex(/^[a-z]{2,3}$/, 'code de langue ISO court attendu');
export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/, 'locale BCP 47 attendue');

export const UnitIntervalSchema = z.number().finite().min(0).max(1);

export const DesiredDurationSchema = z
  .strictObject({
    min_seconds: z.number().finite().nonnegative().max(3_600),
    preferred_seconds: z.number().finite().positive().max(3_600),
    max_seconds: z.number().finite().positive().max(3_600),
  })
  .superRefine((value, context) => {
    if (value.min_seconds > value.preferred_seconds) {
      context.addIssue({ code: 'custom', path: ['min_seconds'], message: 'min_seconds doit être <= preferred_seconds' });
    }
    if (value.preferred_seconds > value.max_seconds) {
      context.addIssue({ code: 'custom', path: ['preferred_seconds'], message: 'preferred_seconds doit être <= max_seconds' });
    }
  });
export type DesiredDuration = z.infer<typeof DesiredDurationSchema>;

export const OptionalTextSchema = z.string().min(1).max(100_000).optional();

export const AnchorRelationSchema = z.strictObject({
  relation: z.enum(['before', 'after', 'during', 'with']),
  target_id: StableIdSchema,
});
export type AnchorRelation = z.infer<typeof AnchorRelationSchema>;
