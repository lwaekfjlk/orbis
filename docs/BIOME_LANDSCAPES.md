# Surface detail for ice, snow, mountains and dry ground

The first landscape update enriched grass and soil, but excluded all ice and permanent snow from both geometry and material variation. Its slope attenuation also flattened the small-scale detail on high mountains. This update gives those surfaces their own patterns instead of leaving them blank.

| Surface | Geometry and materials |
| --- | --- |
| Land glacier | Shallow crevasses and ice ridges, with blue ice in the fissures and pale ridge crests |
| Snow and frozen highlands | Wind-shaped drifts; snow retained according to actual cover and pole-facing slope orientation |
| Alpine rock | Rock bands and smaller scree variation, retained on steep slopes; snow and bare stone blend where the climate supplies snow |
| Sand and salt basins | Asymmetric dune relief and matching bands of light and shade, preserving the original sandy hue |
| Cold barren ground | Muted mineral bands and gravel variation |
| Grass and woodland | The previous warm-ground material treatment and ordinary lowland relief remain in place |

`LandscapePatterns` supplies both colour and geometry with the same deterministic fields and analytic derivatives. Continuous climate weights blend the patterns across the original grid. The rendered height subtracts each pattern's bilinear parent interpolation, so every original lattice vertex stays exact. Surface normals include the new gradients.

The default-world regression samples a maximum absolute displacement of **0.0283 atlas units** and a maximum added grade of **0.468**. Parent physical heights, ice thickness, city surveys, population and political state remain unchanged. Sea, lake and sea-ice boundaries, river corridors and town foundations retain their protected surfaces. An uninhabited world receives the same terrain detail without needing a town to activate it.

Nearby ice pieces and rock debris now use small fractured polygonal shapes at town scale, with every base corner seated on the shared ground. This replaces large cone symbols. The ice visibility option still controls the ice detail layer.

Close mountain inspection also exposed triangular self-shadow artifacts. Terrain receives a larger slope-scaled shadow offset to cover the shadow filter footprint; buildings keep their existing offset so their contact shadows remain seated.

## Actual terrain preview

Run `node scripts/preview-biomes.mjs` and open [the interactive comparison](../previews/biomes/index.html). Each side uses its own version of the production `AtlasRenderer` and `ContinuousCityLayer.buildTerrain`, with matching cameras and lighting. The baseline is commit `116f597`, which already includes the earlier grass, tree, river, performance and people-model fixes.

The six samples are unchanged cells in the default `Aereth-47` world: glacier `(172,155)`, frozen highland `(252,41)`, high mountain `(241,109)`, desert `(200,58)`, cold barren ground `(102,38)` and steppe `(239,99)`. The frozen-highland sample is a real cold-desert/snow mixture; its actual classification and both seasonal temperatures are displayed. The comparison isolates terrain so the surface is visible without town architecture.

## Verification

**154 targeted tests passed**, covering each surface family, height/colour alignment, hemisphere-dependent snow retention, climate and grid continuity, analytical gradients, unchanged source data, deserted worlds, worker equality, town retirement and survey changes, debris grounding, terrain budgets, rivers, tree sizes, selection, subterranean openings and OneMap invariants. Existing landmark-index and people-model checks also passed against the combined main branch.

The interactive preview supports six samples, regional/close/slope views, linked orbit/pan/zoom and separate before/after views.
