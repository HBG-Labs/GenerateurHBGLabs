# Premium Procedural Design Catalog — P3.3.6

Ce catalogue décrit l'infrastructure disponible. Il ne constitue pas une promesse de qualité artistique.

## Recipes

| Recipe                   | Usage                       | Densité    | Hiérarchie | Surface        | Icon treatment    | Chart treatment    | Coût   | Limites                        |
| ------------------------ | --------------------------- | ---------- | ---------- | -------------- | ----------------- | ------------------ | ------ | ------------------------------ |
| CLEAN_PRODUCT 1.0.0      | Product, UI, data           | balanced   | clear      | soft layered   | rounded outline   | focal series       | MEDIUM | procédural, sans photo         |
| EDITORIAL_CONTRAST 1.0.0 | Editorial, UI sobre         | restrained | editorial  | flat selective | minimal outline   | annotation first   | LOW    | illustration limitée           |
| DATA_FOCUSED 1.0.0       | Data, analytics, UI         | rich       | clear      | precise dense  | precise outline   | context then focus | MEDIUM | données fixture uniquement     |
| SPATIAL_TECH 1.0.0       | Environnement, UI/data 2.5D | balanced   | dramatic   | luminous depth | geometric outline | spatial focus      | HIGH   | lumière et gradient simplifiés |

## Compositions UI v2

- `GENERIC_SMARTPHONE_FRAME@2.0.0` : device/body/screen, screen surface, metric focus et navigation ; états hero, carry et reassemble.
- `APP_SCREEN@2.0.0` : workspace, rail de navigation, primary information et metric card extractible.
- `DASHBOARD@2.0.0` : contexte, metric principale, chart focal, grilles sélectives et focus point.
- `DATA_CHART@2.0.0` : data story panel, valeur, contexte, série principale, objectif et metadata de démonstration.

Les autres familles P3.3.5 restent disponibles sous leurs versions historiques mais ne reçoivent pas automatiquement le traitement v2.

## Token systems

- spacing : `xs`, `sm`, `md`, `lg`, `xl` ; strictement croissant.
- radius : cinq rôles bornés.
- borders : `hairline`, `emphasis`.
- elevation : `flat`, `raised`, `floating`.
- typography : ratios display/body/metadata.
- icon : `sm`, `md`, `lg`.
- data : grid opacity et poids principal/secondaire.
- detail : nombre maximal et opacité.

## Materials

| Material                    | Support    | Implémentation                 | Coût   |
| --------------------------- | ---------- | ------------------------------ | ------ |
| MATTE_DEPTH                 | SUPPORTED  | solid surfaces hiérarchisées   | LOW    |
| SOFT_ELEVATION              | SUPPORTED  | offset layers bornées          | LOW    |
| ACCENT_FIELD                | SUPPORTED  | accent layers bornées          | LOW    |
| LAYERED_GRADIENT_SIMPLIFIED | SIMPLIFIED | translucent overlapping fields | LOW    |
| GLASS_EDGE_SIMPLIFIED       | SIMPLIFIED | translucent edge/highlight     | MEDIUM |

## Icon system

`HOME`, `GRID`, `TASK`, `CALENDAR`, `CLOCK`, `SEARCH`, `BELL`, `USER`, `TEAM`, `MESSAGE`, `DOCUMENT`, `FOLDER`, `CHECK`, `ARROW`, `TREND`, `CHART`, `TARGET`, `SPARK`, `PIN`, `FILTER`.

Tous les glyphes viennent du registry interne versionné. Le style contractuel est une géométrie outline normalisée ; aucun pack externe n'est chargé.

## Chart language

- `FOCAL_LINE@1.0.0` : grille minimale, série principale, dernière valeur.
- `METRIC_SPARK@1.0.0` : micro tendance sans grille dominante.
- `COMPARISON_BARS@1.0.0` : baseline et barre sélectionnée ; registry prêt, non utilisé dans le film Product.

## Changement depuis P3.3.5

P3.3.5 fournit la structure et les affordances. P3.3.6 ajoute des recipes, des tokens, une surface hierarchy, une icon language plus large, un chart language et un DesignPreflight. Aucune primitive motion n'a été ajoutée et aucun comportement P3.3.5 n'a été modifié silencieusement.
