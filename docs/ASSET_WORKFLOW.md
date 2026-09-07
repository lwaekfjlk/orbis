# Architecture assets: implementation and extension

## Data flow

```
immutable world geography
  + existing province / city / local cultural mixture
  + explicit fictional architectural grammar
       ↓
LandmarkCatalog.fromProvince → versioned recipe
       ↓                         ↑
LandmarkBinding.resolve ← optional saved site override
       ↓
LandmarkTemplates.build → LandmarkKit modules → named mesh groups
       ├── world: recipe-matched simplified silhouette
       ├── city: contracted detail, fitted to a reserved existing precinct
       └── atelier: full assembly, component inspection and exports
```

The coarse symbols are deliberately NOT all full mesh instances. `miniature()` omits the scenic tile and contracts detail; its bounds fit the city's building rectangle. The close-up rebuilds a larger grammar instance plus an illustrative display setting. The parent landscape is never queried for an area to excavate or moved to accommodate the building. This is semantic LOD, not an automatic triangle-decimation library.

## Recipe

A valid serialized example is in every `assets/landmarks/*.recipe.json` file. To generate one programmatically (after loading the explicit manifest order):

```js
const recipe = LandmarkCatalog.recipe('basilica', 'House-of-Dawn-29', {
  material: 'ivory',
  faith: 'stars',
  culture: 'Dwarven craft',
  crown: 'crystal',
  roofLanguage: 'gable',
  geography: {
    freshwater: 0.65,
    coast: false,
    lake: true,
    cold: false,
    dry: false,
    forest: false,
    elevation: 640
  }
});
const model = LandmarkTemplates.build(recipe);
const glb = exportGeometryGLB(LandmarkTemplates.meshes(model), { recipe });
```

The fields `style`, `version`, `seed`, `material`, `faith`, `culture`, `variant`, `wings`, `roofPitch`, `crown`, `roofLanguage`, and geography participate in the recipe signature. `complexity` affects level of detail; full and reduced-detail meshes are not claimed to have identical geometry. The id and site name are provenance, not random inputs into appearance. Two different sites may intentionally share the same grammar.

Do not reuse a saved id for an unrelated site. Do not change the meaning of existing recipe fields without increasing the recipe version. `validate()` rejects incompatible versions and unrecognized styles. A world save has a distinct schema and is not interchangeable with recipe JSON.

## Modules and parts

`LandmarkKit` writes into a `Geometry` accumulator with position, flat normal and vertex color. A named part groups meaningful content: royal hall, roof, bell towers, cloister, bridge, ritual court, great tree or terrain base. Geometry parts are exported as separate named GLB meshes. `role` values distinguish architecture, foundation, roof, ornament, landscape and site, so the viewer can hide roofs or move parts for exploded inspection.

Repeated reusable elements include open arches, columned galleries, ribbed domes, hipped and gabled roofs, battlements, tower crowns, terraces, portal frames, monumental stairs, railings, bridges, palace windows, planted courts, stilt supports and faceted trees. Call `part()` before adding a named group; follow existing templates to associate roof and ornament subgroups with a principal structure.

`templates.js` owns the intentional architectural silhouettes. `kit.js` owns the construction vocabulary. A template is more than a random set of modules: circulation axes, overall footprint and major height hierarchy are authored; the seed selects bounded variations. Arbitrary module combinations are not structurally certified.

## Add a new family

1. Add a style descriptor in `catalog.js` with a unique id, material, local tradition, description and default motif.
2. Add a template builder in `templates.js` and register it in the template dispatch. Reuse the kit before adding new primitives.
3. Define valid site-selection criteria in `fromProvince` or `inventory`. Never invent natural features to ensure this template is placed. The library can expose styles absent from the current world.
4. Add a distinct coarse silhouette in `worldSymbol`, or intentionally use a documented generic fallback.
5. Add deterministic mesh and bounds checks in `tests/landmarks.test.mjs`. Test at least one dry/cold combination.
6. Run `npm test`, `npm run assets`, `npm run build`. Inspect the resulting models from multiple angles, not just a screenshot.

## Extend with authored assets later

This version's reusable source assets are code + recipes and generated GLBs. An artist may edit exported nodes in a 3D editor. An asset-import pipeline is not included: to substitute authored GLBs at runtime, add a loader, establish common units/pivots and socket semantics, implement bounds/LOD checks, and preserve the site's provenance contract. Merely replacing a file in `assets/` does not change the current procedural runtime.

## Exact scope of geography / culture / religion

Selection reads the existing city's latitude, aridity, freshwater, shoreline, local forest and elevation; it also reads local population mixtures and institutions. These are constraints and stylistic priors, not a social-science model. Desert ornamental water requires supply, and cold-site flat roof selection is replaced by a steep language. A material palette is an art option; the model does not simulate quarries, shipping, structural loading or labor required for a material change.

Fictional craft traditions modify such details as roots, geometric buttresses, posts, elevated supports and standards. Ritual motifs alter actual ornament geometry; they do not overwrite the city's demographic faith fractions. Some base templates already encode a ceremonial arrangement; choosing a new motif is not a full re-plan of all ritual circulation.

Saving an architectural override is an aesthetic world edit. It does not charge treasury, grant combat power or create a public project. Those simulation operations remain in `src/city/actions.js`. This separation prevents appearance editing from secretly changing the economy.

## Export and validation

Each export is an ordinary GLB 2 container containing real POSITION/NORMAL/COLOR_0 attributes. The project exporter does not create a billboard texture, camera-facing sprite or embedded concept image. Full assemblies are exported in their canonical pose, even while the viewer is exploded. Colors are vertex data; external software lighting will alter the appearance.

The built-in software renderer performs depth testing and uses a cached directional-light shadow map. It renders the exact triangle buffers used for export. Hardware WebGL2 follows a separate shader path; current verification does not imply a hardware performance guarantee. HTML rendering, hit-testing and mobile layout are integration tested separately from mathematical mesh generation.
