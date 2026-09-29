# Motion benchmark catalog

This catalog is a research index, not an asset library. Its stable IDs point to
provenance and structured observations. External URLs are never runtime
dependencies and third-party media is not committed or republished.

## Evidence levels

- `TIMECODED_LOCAL`: locally supplied media was inspected over time;
- `PUBLIC_CASE_STUDY`: attributable creator/studio documentation supports the
  recorded summary, but not timecoded shot claims;
- `METADATA_ONLY`: title, author, category, or creator description only;
- `UNAVAILABLE`: neither attributable URL nor local media is available.

Only `TIMECODED_LOCAL` permits frame-accurate sequence claims.
`PUBLIC_CASE_STUDY` permits `OBSERVED` claims limited to the linked page's own
description. Every derived capability remains `INFERRED`; rendered technique
never implies a specific authoring tool.

## Qualitative anchor set

| ID                  | Role        | Category                   | Source                                                               | Availability      | Analysis        |
| ------------------- | ----------- | -------------------------- | -------------------------------------------------------------------- | ----------------- | --------------- |
| `PRO_MOTION_2D_A`   | primary     | professional 2D/motion     | [Will Taylor showreel](https://www.youtube.com/watch?v=RB0X7CojhZ8)  | external metadata | `METADATA_ONLY` |
| `PRO_MOTION_2D_B`   | primary     | professional hybrid motion | [Denis Gimaev showreel](https://www.youtube.com/watch?v=jkPVT55GAOo) | external metadata | `METADATA_ONLY` |
| `PRO_MOTION_3D`     | specialized | professional 3D motion     | [Owen Jenkins showreel](https://www.youtube.com/watch?v=wCqcJU1YpKk) | external metadata | `METADATA_ONLY` |
| `POSTER_TO_MOTION`  | specialized | poster motion              | Fiesta Latina, user reference                                        | absent            | `UNAVAILABLE`   |
| `PRODUCT_APP_PROMO` | specialized | product/app promo          | fintech/app, user reference                                          | absent            | `UNAVAILABLE`   |

The first public reference has a secondary listing reporting approximately 27
seconds. The second creator description confirms a reel of personal and
commercial work; a secondary catalog classifies it as 3D/CGI and commercial.
YouTube oEmbed confirms the third title and creator. These facts do not support
inventing shot-by-shot techniques.

## Reference ingestion

1. Record stable ID, provenance, rights/size status, and benchmark role.
2. Keep local media in `references/motion/media/`, which is Git-ignored.
3. Sample time deterministically only from an authorized local file.
4. Observe motion as motion: record start/end, overlap, acceleration, hold, and
   causal order rather than relying on stills alone.
5. Write structured `MotionReferenceAnalysis` with generic asset roles.
6. Normalize atoms and compositions against P1/P1.7/P3 registries.
7. Deduplicate semantically equivalent techniques.
8. Update coverage and gap maps; never import media into product fixtures.

## Sequence annotation rule

Use generic roles such as `SUBJECT`, `PRODUCT`, `UI_SURFACE`,
`TYPOGRAPHIC_HERO`, `DECORATIVE_OBJECT`, and `ENVIRONMENT`. For example:

`DECORATIVE_OBJECT → CAMERA_FOLLOW → PRODUCT_HERO → UI_HANDOFF`

is acceptable. A description tied to the exact depicted person, brand, poster,
phone, artwork, or composition is not.

## Value and saturation

A new reference is useful only if it introduces at least one missing technique,
composition, asset class, art direction, product use, or genuinely distinct 3D
language. Repeated evidence increases confidence/frequency but does not justify a
duplicate capability. When a new reference adds no significant family, record it
as saturated rather than expanding the vocabulary.

The anchors remain intact, but no longer define the corpus alone. Their current
sequence-level coverage is insufficient: all three public videos need authorized
local timecoded inspection, while the supplied poster and app samples still need
to be provided.

## Expanded professional corpus

The amendment added 35 retained public references without downloading or
committing third-party media. Together with the five anchors, the catalog now
contains 40 references from 21 creators/studios. The structured source of truth
is `references/motion/corpus-expansion.json`.

### Wave A — professional motion / showreels

| ID                                      | Reference                                                                                                    | Category       | Why retained                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- | --------------------------------------------------------------- |
| `EXP_A01_CUB_SHOWREEL`                  | [Cub Studio — Animation Showreel](https://www.cubstudio.com/showreel)                                        | showreel       | character, branded storytelling, mixed 2D/3D, rhythm and breath |
| `EXP_A02_OF_VOLVO_360C`                 | [Ordinary Folk — Volvo 360c Concept](https://www.ordinaryfolk.co/project/volvo-360c-concept)                 | explainer      | shape-led conceptual explanation                                |
| `EXP_A03_GIANT_ANT_COCA_COLA_TSQ`       | [Giant Ant — Coca-Cola TSQ](https://www.giantant.ca/coca-cola-case-study)                                    | brand/product  | large-format mixed techniques with explicit motion restraint    |
| `EXP_A04_BUCK_BEYOND_MAGIC`             | [BUCK — Beyond Magic](https://buck.co/work/beyond-magic)                                                     | title design   | title-led narrative across cel, 2D and 3D                       |
| `EXP_A05_OF_SCHOOL_OF_MOTION_MANIFESTO` | [Ordinary Folk — School of Motion Manifesto](https://www.ordinaryfolk.co/project/school-of-motion-manifesto) | manifesto film | progressive complexity from lines/shapes to characters and 3D   |

### Wave B — kinetic typography / editorial / branding

| ID                                 | Reference                                                                        | Category         | Why retained                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| `EXP_B01_PENTAGRAM_LIT`            | [Pentagram — LIT](https://www.pentagram.com/work/lit?setSerializedKey=2)         | kinetic type     | typography as spatial field and dimensional structure           |
| `EXP_B02_STUDIO_DUMBAR_DEMO`       | [Studio Dumbar/DEPT — DEMO](https://www.webbyawards.com/crafted-with-code/demo/) | motion identity  | logo/type defined by dynamic shape, speed and movement          |
| `EXP_B03_STUDIO_DUMBAR_INTO`       | [Studio Dumbar/DEPT — INTO](https://studiodumbar.com/work/into)                  | variable type    | semantic width/weight transitions, gradients and dissolves      |
| `EXP_B04_GRETEL_IFC`               | [Gretel — IFC](https://gretelny.com/ifc)                                         | broadcast brand  | reusable promo recipes and content-first restraint              |
| `EXP_B05_GRETEL_SHOWTIME`          | [Gretel — Showtime](https://gretelny.com/showtime)                               | broadcast brand  | narrow color/type system and streamlined motion                 |
| `EXP_B06_DIA_NIKE_STATEMENT_HOUSE` | [DIA — Nike Statement House](https://dia.tv/project/nike-statement-house/)       | type-only motion | typography driven by basketball movement across an installation |

### Wave C — SaaS / UI / product advertising

| ID                             | Reference                                                                                                                          | Category       | Why retained                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------- |
| `EXP_C01_OLEG_3D_UI_SAAS`      | [Oleg S. — 3D UI SaaS Promo](https://vimeo.com/1196589699)                                                                         | SaaS/UI        | layered UI depth, camera and cursor interaction            |
| `EXP_C02_TIMEFRAME_SAAS_PROMO` | [TimeFrame — SaaS Platform Promo](https://www.behance.net/gallery/248958561/Promotional-Video-with-UI-Animation-for-SaaS-Platform) | SaaS/UI        | workflow narrative and restrained interface continuity     |
| `EXP_C03_BUCK_SUKI`            | [BUCK — Suki](https://buck.co/work/suki)                                                                                           | product brand  | reusable line motif connecting human/product touchpoints   |
| `EXP_C04_BUCK_MICROSOFT_APP`   | [BUCK — Microsoft Unified Office App](https://buck.co/work/microsoft-app)                                                          | app promo      | feature-to-metaphor social films rather than literal tours |
| `EXP_C05_ANIMADE_TREMENDOUS`   | [Animade — Tremendous](https://archive.animade.tv/work/tremendous-payout-provider)                                                 | SaaS explainer | persistent geometric guide through a product world         |
| `EXP_C06_ANIMADE_WISE`         | [Animade — Wise Explainers](https://archive.animade.tv/work/wise-explainer-videos)                                                 | fintech        | coherent multi-film product and character system           |

### Wave D — illustration / explainer / data

| ID                                   | Reference                                                                                                      | Category            | Why retained                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| `EXP_D01_ANIMADE_TOOLS_FOR_HUMANITY` | [Animade — Tools for Humanity](https://archive.animade.tv/work/tools-for-humanity)                             | technical explainer | complex system reduced to cross-cultural symbols/icons      |
| `EXP_D02_ANIMADE_OCADO_DATA`         | [Animade — Ocado Personalized Data Films](https://archive.animade.tv/work/ocado-film)                          | data motion         | modular data-to-story variants at scale                     |
| `EXP_D03_PARKER_N8_INFOGRAPHIC`      | [Parker Design — N8 Infographic](https://parker-design.co.uk/case-study/animated-video-production/)            | infographic         | restraint, counters and pacing for comprehension            |
| `EXP_D04_MITRO_ENGAGIERTE_STADT`     | [Mitro Studios — Engagierte Stadt](https://mitrostudios.com/portfolio/infographic-animation-engagierte-stadt/) | infographic         | decomposition of static data graphics into animatable parts |
| `EXP_D05_BUCK_ILLUMINA`              | [BUCK — Illumina](https://buck.co/work/illumina)                                                               | science/abstract    | fluid, chaptered 2D/2.5D/3D conceptual storytelling         |

### Wave E — poster / mixed media / social

| ID                                 | Reference                                                                                                 | Category        | Why retained                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| `EXP_E01_LEXI_PRINT_TO_MOTION`     | [Lexi O'Neill — From Print to Motion](https://lexioneilldesign.com/From-Print-to-Motion-Case-Study)       | poster motion   | deconstruction/recomposition preserving print language      |
| `EXP_E02_BUCK_AUSTRALIAN_OPEN`     | [BUCK — Australian Open](https://buck.co/work/australian-open)                                            | mixed campaign  | bespoke media languages within one campaign                 |
| `EXP_E03_BUCK_ASANA_BRAND_FILM`    | [BUCK — Asana Brand Film](https://buck.co/work/asana-brand-film)                                          | mixed SaaS      | UI, type, hands and texture in one seamless collage system  |
| `EXP_E04_ASAAD_TALKING_HEAD_REELS` | [Asaad — Talking Head Reel Series](https://asaad.art/work/talking-head-reel-series)                       | vertical social | supportive editorial motion timed to speech/thought changes |
| `EXP_E05_STUDIO_PB_PALM_OIL`       | [Studio PB — Palm Oil Social Campaign](https://www.studiopb.design/case-studies/rethink-reframe-palm-oil) | vertical social | typographic hooks, localization and multi-aspect delivery   |
| `EXP_E06_ANIMADE_IBM_DUBLIN`       | [Animade — IBM Dublin](https://animade.tv/work/ibm-dublin-conference)                                     | mixed media     | paper, stop motion, 2D and 3D unified by palette/overlay    |

### Wave F — 2.5D / compositing / true 3D

| ID                                    | Reference                                                                                                             | Category              | Why retained                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| `EXP_F01_MVM_FLYKNIT`                 | [ManvsMachine — Flyknit](https://mvsm.com/project/flyknit)                                                            | product visualization | product material, logo and type as one motion toolkit         |
| `EXP_F02_FUTUREDELUXE_MARKFORGED`     | [FutureDeluxe — Markforged FX10](https://www.maxon.net/en/article/using-maxon-one-for-future-facing-product-launches) | true 3D product       | accurate mechanism, material, lighting and process simulation |
| `EXP_F03_BUILDERS_CLUB_BEATS`         | [Builders Club — Beats Behind the Design](https://builders-club.com/3d-motion/behind-the-design-beats-studio-buds)    | true 3D product       | internal components plus abstract 2D rhythm                   |
| `EXP_F04_TERRITORY_BLADE_RUNNER_2049` | [Territory — Blade Runner 2049](https://territorystudio.com/project/blade-runner-2049/)                               | cinematic UI          | textured diegetic interface tied to story/performance         |
| `EXP_F05_TERRITORY_LIV_GOLF`          | [Territory — LIV Golf](https://territorystudio.com/project/livgolf/)                                                  | broadcast             | titles, stings, live data and 3D information hierarchy        |
| `EXP_F06_ELASTIC_TRUE_DETECTIVE`      | [Elastic — True Detective titles](https://time.com/3936215/true-detective-opening-credits-david-maisel/)              | title design          | photography, slow motion and double-exposure compositing      |
| `EXP_F07_OF_EQUILIBRIUM`              | [Ordinary Folk — Equilibrium](https://www.ordinaryfolk.co/project/equilibrium)                                        | 3D experiment         | explicit boundary between 2D transition logic and tactile 3D  |

## Corpus accounting and source diversity

- 35 complementary references retained across six waves;
- 5 qualitative anchors preserved;
- 40 total catalog entries;
- 21 distinct creators/studios in the expansion;
- largest single contributor: BUCK, 6 of 35 expansion entries;
- no third-party video downloaded, committed, or used as a product asset;
- 35 attributable observation summaries, 150 technique observations,
  117 asset observations, and 85 material observations;
- normalization reduced 126 raw technique labels to 16 cross-category families
  and 11 TechniqueCompositions in `normalized-language-index.json`.

## Saturation evidence

The search stopped after wave F because the final candidates increasingly
repeated already retained families: extra BUCK campaign pages repeated mixed
media; extra Territory pages repeated cinematic UI/broadcast; generic SaaS
agency pages repeated UI cards without project evidence; and unattributed reels
added no defensible provenance. Six candidate groups were rejected and recorded
in `corpus-expansion.json`.

Marginal discovery by wave:

| Wave | Retained | Distinct contribution                                        |
| ---- | -------: | ------------------------------------------------------------ |
| A    |        5 | sequence rhythm, restraint, concept films, mixed 2D/3D       |
| B    |        6 | type as geometry, variable type, motion identity recipes     |
| C    |        6 | UI depth, product handoff, social feature metaphors          |
| D    |        5 | data-to-story, information pacing, scientific abstraction    |
| E    |        6 | poster decomposition, collage coherence, vertical social     |
| F    |        7 | product materials, cinematic UI, broadcast, true 3D boundary |

Wave F added the last genuinely new families—diegetic interface, broadcast
packages, double exposure and true-3D product/material requirements. Subsequent
candidates mainly increased confidence rather than expanding the normalized
language, so the corpus is sufficiently saturated for a P3.3 entry decision,
but not for frame-accurate timing claims.
