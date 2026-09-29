# Motion language matrix

Anchor legend: `O` observed from timecoded media, `I` inferred from attributable
metadata/category, `?` unverified, `U` reference unavailable. Engine values are
`SUPPORTED`, `PARTIAL`, `SIMPLIFIED`, or `UNSUPPORTED`.

Because no anchor media is locally available, the anchor matrix deliberately
contains no `O` cells. The expanded public-case-study matrix below uses `E` only
when an attributable page explicitly supports the family; it still does not
claim frame-accurate timing.

| Technique                                  | 2D A | Motion B |  3D | Poster | App promo | P3.2 engine           |
| ------------------------------------------ | ---: | -------: | --: | -----: | --------: | --------------------- |
| dynamic tracking / `wght` / `wdth`         |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| word/run kinetic choreography              |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| safe per-cluster choreography              |    ? |        ? |   ? |      U |         U | UNSUPPORTED           |
| semantic shape-to-mask                     |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| true word-to-mask transformation           |    ? |        ? |   ? |      U |         U | SIMPLIFIED            |
| arbitrary geometry morph                   |    ? |        ? |   ? |      U |         U | UNSUPPORTED           |
| vector assembly                            |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| general path follow                        |    ? |        ? |   ? |      U |         U | UNSUPPORTED           |
| path draw / causal diagram                 |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| element carry / persistent entity          |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| frame expansion / portal                   |    ? |        ? |   ? |      U |         U | PARTIAL               |
| cross-scene overlap compositor             |    ? |        ? |   ? |      U |         U | UNSUPPORTED           |
| camera push / depth surge / settle         |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| camera pan/pull/path follow                |    ? |        ? |   ? |      U |         U | PARTIAL               |
| foreground occlusion / type behind subject |    ? |        ? |   ? |      U |         U | SUPPORTED             |
| UI cards/charts/device compositions        |    ? |        ? |   ? |      U |         U | PARTIAL               |
| poster deconstruct/reassemble              |    ? |        ? |   ? |      U |         U | REQUIRES_ASSET_SYSTEM |
| procedural premium illustration            |    ? |        ? |   ? |      U |         U | REQUIRES_ASSET_SYSTEM |
| true 3D scene/material/light               |    ? |        I |   I |      U |         U | UNSUPPORTED           |
| sound-motion coupling                      |    ? |        I |   ? |      U |         U | REQUIRES_AUDIO        |

## Expanded category matrix

Legend: `E` = evidenced by at least one retained public case study in the
category; `—` = not used as category evidence. This is presence, not a quality
score.

| Normalized family                  | Showreel / film | Type / brand | SaaS / product | Explainer / data | Poster / social | 2.5D / 3D / title | P3.2                  |
| ---------------------------------- | :-------------: | :----------: | :------------: | :--------------: | :-------------: | :---------------: | --------------------- |
| asset-language switch              |        E        |      E       |       E        |        E         |        E        |         E         | REQUIRES_ASSET_SYSTEM |
| texture/material language          |        —        |      E       |       E        |        E         |        E        |         E         | PARTIAL               |
| mixed 2D/3D                        |        E        |      —       |       —        |        E         |        E        |         E         | SIMPLIFIED            |
| UI/product narrative               |        —        |      E       |       E        |        E         |        E        |         E         | PARTIAL               |
| motion-identity system             |        E        |      E       |       E        |        —         |        E        |         —         | PARTIAL               |
| true 3D/cinematic depth            |        E        |      —       |       —        |        E         |        E        |         E         | REQUIRES_3D           |
| camera/depth staging               |        E        |      —       |       E        |        E         |        —        |         E         | PARTIAL               |
| responsive/modular system          |        —        |      E       |       E        |        E         |        E        |         —         | PARTIAL               |
| character/illustration motion      |        E        |      —       |       E        |        E         |        E        |         —         | REQUIRES_ASSET_SYSTEM |
| visual breath/restraint            |        E        |      E       |       —        |        E         |        E        |         E         | SUPPORTED             |
| mixed-media compositing            |        —        |      —       |       E        |        E         |        E        |         E         | REQUIRES_ASSET_SYSTEM |
| kinetic type integration           |        —        |      E       |       —        |        —         |        E        |         —         | PARTIAL               |
| semantic transformation continuity |        E        |      E       |       E        |        E         |        —        |         E         | PARTIAL               |
| data/information motion            |        —        |      —       |       E        |        E         |        —        |         E         | PARTIAL               |
| broadcast/title system             |        E        |      E       |       —        |        —         |        —        |         E         | PARTIAL               |
| vertical/social-first staging      |        E        |      —       |       E        |        —         |        E        |         —         | SUPPORTED             |

## Evidence frequency

The normalized index counts retained references, not shots:

| Family                             | References | Cross-category implication                                |
| ---------------------------------- | ---------: | --------------------------------------------------------- |
| asset-language switch              |         12 | high reuse; primarily asset/director problem              |
| texture/material language          |         11 | high perceptual impact; partial renderer/asset support    |
| mixed 2D/3D                        |          9 | common, but true 3D is a separate future system           |
| UI/product narrative               |          9 | dedicated compositions would be reusable                  |
| motion-identity system             |          8 | Director/system-rule gap more than primitive gap          |
| true 3D/cinematic depth            |          8 | future 3D, not a P3.3 blocker                             |
| camera/depth staging               |          7 | P3.2 supports a useful 2.5D subset                        |
| responsive/modular system          |          7 | contracts exist; multi-canvas proof remains partial       |
| character/illustration motion      |          7 | requires coherent assets/rigs                             |
| visual breath/restraint            |          7 | already supported; selection belongs to Director          |
| mixed-media compositing            |          7 | asset and compositing ceiling                             |
| kinetic type integration           |          6 | P1.7 supports runs/axes; type-as-geometry remains partial |
| semantic transformation continuity |          6 | supported core, simplified at some boundaries             |
| data/information motion            |          5 | needs stronger domain compositions                        |
| broadcast/title system             |          5 | specialized, non-blocking                                 |
| vertical/social-first staging      |          4 | supported output format and layout foundation             |

## Coverage interpretation

- Engine coverage is strong for deterministic 2D/2.5D structure, causal paths,
  semantic transforms, depth ordering, and run-safe typography.
- Coverage is explicitly partial for four P3.2 simplifications:
  `PATH_CONTINUE`, `TYPE_SCALE_THROUGH`, `WORD_TO_MASK`, `CIRCLE_TO_PORTAL`.
- Public case studies now provide cross-category frequency at the reference
  level, while timecoded sequence frequency remains unknown.
- Coverage is now GOOD for typography/branding, SaaS/UI/product, explainer/data,
  mixed media, cinematic UI/title, and true-3D boundary analysis.
- Coverage is MEDIUM for vertical social, poster motion, character motion and
  broadcast; it remains LOW for architectural motion, fashion/editorial,
  typography-only long form, logo-only motion and complex character rigging.
