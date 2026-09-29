# Visual asset gap map

The P3.2 human review separates two problems: motion capability has progressed,
while synthetic asset richness still caps perceived quality. More MotionPhrases
cannot replace coherent illustration, UI, product, photographic, or 3D material.

| Asset family                | Current state                                     | Procedural-first potential | External need                              | Priority |
| --------------------------- | ------------------------------------------------- | -------------------------- | ------------------------------------------ | -------- |
| typography                  | strong P1.7 metrics, limited treatments           | high                       | optional fonts only                        | A        |
| procedural vector           | shapes/paths supported, visual language sparse    | high                       | no                                         | A        |
| premium vector illustration | basic assembly only                               | medium                     | optional library/generation                | A        |
| UI/device shells            | no dedicated asset grammar                        | high                       | no for generic shells                      | A        |
| diagrams/data marks         | causal paths exist, components limited            | high                       | no                                         | B        |
| decorative systems          | motif tokens exist, material vocabulary limited   | high                       | no                                         | B        |
| texture/grain/light/shadow  | effects closed for certification                  | medium                     | no, if deterministic CSS/SVG proves stable | B        |
| photography                 | binding supported, no acquisition/generation      | low                        | required                                   | B        |
| subject cutout              | no understanding/segmentation                     | low                        | required                                   | B        |
| product render              | generic frames possible, photoreal product absent | medium                     | often required                             | B        |
| 3D object/environment       | no true 3D scene                                  | low                        | true 3D system required                    | C        |

## Expanded-corpus evidence

The 35 retained public case studies contain 117 asset observations across 17
asset classes and 85 material observations across 15 surface classes. The most
repeated cross-category evidence is not “more shapes”; it is coordinated
switching between asset languages (12 references), texture/material richness
(11), mixed-media compositing (7), and character/illustration motion (7).

| Evidence family               | References | Primary gap owner              | Consequence                                  |
| ----------------------------- | ---------: | ------------------------------ | -------------------------------------------- |
| asset-language switch         |         12 | Asset System + Visual Director | layer provenance and coherent handoff        |
| texture/material language     |         11 | Asset System + Renderer        | closed material roles and stable compositing |
| mixed-media compositing       |          7 | Asset System + Renderer        | palette/overlay/matte continuity             |
| character/illustration motion |          7 | Asset System                   | layered parts, pivots, safe bindings         |
| UI/product narrative          |          9 | Asset System + Visual Director | device/UI/data component grammar             |
| true 3D/cinematic depth       |          8 | future 3D system               | genuine mesh/material/light boundary         |

The engine can already choreograph many of these roles, but it lacks the visual
matter and domain assemblies. That is why an effect-only P3.2.x expansion would
not remove the perceived ceiling.

## Procedural Asset Grammar candidate

A future provider-free contract could deterministically describe:

- multi-part vector illustration with hierarchy, pivots, masks, and tokens;
- generic device/product frames and UI surfaces;
- chart, counter, icon, diagram, and abstract-environment assemblies;
- decorative systems, texture roles, material intent, and approved asset slots.

It should reuse P1 asset/SVG/path security and emit data, never executable SVG,
JSX, shaders, or code. It is not implemented in P3.2.5.

## Poster and product specifics

`POSTER_TO_MOTION` needs explicit semantic layers before deconstruction can be
safe: background, subject, headline, secondary type, decoration, palette, and
occlusion. `PRODUCT_APP_PROMO` needs persistent product/device identity, UI card
parts, chart primitives, feature callouts, and handoff targets.

Both references are unavailable, so these are taxonomy requirements, not claims
about the exact supplied works.

## Art-direction gap

Asset quality also depends on palette relationships, scale hierarchy, negative
space, motif consistency, crop, material contrast, and coherent illustration
style. These belong primarily to an art-direction/Visual Director layer, not to
new low-level motion primitives.

## Material/surface taxonomy

The corpus distinguishes `FLAT`, `GRADIENT`, `PAPER`, `GRAIN`, `COLLAGE`,
`GLASS`, `TEXTILE`, `METALLIC`, `TACTILE`, `LUMINOUS`, `PHOTOGRAPHIC`,
`PHOTOREAL`, `ORGANIC`, `DIMENSIONAL`, and `TEXTURED`. These are intent roles,
not arbitrary CSS/shader strings. Any future implementation must use closed,
versioned mappings and the existing asset-security boundary.

## Readiness impact

This is the highest-confidence quality ceiling, but it does not by itself block
P3.3: a constrained Visual Director can already improve sequence selection with
synthetic assets. It does mean P3.3 cannot be presented as the final premium
quality solution, and a Procedural Asset Grammar should be the next parallel or
immediately following foundation.
