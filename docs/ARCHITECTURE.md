# Architecture

## Causal direction

```
plate / terrain / climate / water / ice
              |
              v
human geography -> rural support -> actual settlements
              |                         |
              |                         +--> local city refinement (read-only)
              v                                  |
multiple political centers                       +--> scene, lots, buildings
              |                                  |
              v                                  +--> selected project request
civilization timeline <--------------------------+
```

`generateWorld` completes the physical world. `initializeSettlements` derives access to water, finite rural surplus, settlement locations, cultures and market connections. `formPolities` chooses existing centers and applies bounded administration. City detail receives a province ID; a province with no actual settlement is rejected.

`generateCity(world, simulation, provinceId)` is pure with respect to its inputs. It samples the planet fields into a local 81×81 mesh, then creates streets on a traversability graph. Arterial branches and district links share a connected seed. Sea/lake nodes cannot be traversed by streets. Narrow parent-drainage river nodes can receive schematic bridges. Parcels are checked against water and roads at the center and footprint corners/edges; occupied footprints are excluded.

The grid is only a schematic local view of a much coarser planet. The local city moves its market anchor only to nearby buildable ground; it does not move the province or edit any parent array. The explicit base height transform compresses relief for readable city rendering. Footprints and roofs are out of physical scale.

District centers follow the road network. Waterfront districts depend on actual sampled sea/lake shore, not a preassigned "naval state". Architecture reflects climate and local arcane opportunity. Culture and religion in the dossier are the live province's mixtures; they are not invented per-house ethnic classifications.

## State

`world` holds typed arrays and physical metadata. `sim` holds serializable civilization data. New `sim.cityState[provinceId]` records levels, project dates, sponsor and local events. The province's `detailSupport` freezes the representative initial building count so a food-support upgrade does not reroll the street plan.

City completion is called **after** each original `stepCivilization`. A project pays at commissioning, not every year. Completion is guarded by status and cannot apply twice. If ownership changes, a completed civic improvement belongs to the current local government; no physical relocation or automatic religious conversion occurs.

The cache is not part of the save. Saved world seed, province location, initial detail support and completed projects reproduce the scene. The UI holds at most eight layout objects and uploads only the active city's geometry. The city renderer itself is reused across visits.

## Rendering and input

The city uses the existing `AtlasRenderer` geometry/shader pipeline. WebGL2 provides depth and shadow buffers; Canvas fallback performs projection and depth sorting of the same procedural mesh. Software drawing is slower and can show painter-order/aliasing artifacts on complex overlapping geometry. No image substitutes for simulation output.

Picking intersects the orthographic camera ray with building boxes. Mouse, pointer capture, touch pinch and keyboard alternatives are supported. District chips and landmark lists are accessible alternatives to precision map clicks. The native dialog traps focus; close returns to the prior focused control.

`CityUI` is the feature controller. World-side hooks are explicit in `refreshAll`, selection and initial generation; there is no mutation observer or periodic DOM scraping. Time advancement calls both simulation layers, and a city refresh rebuilds project geometry without rerolling its cached plan.

## Source organization

Classic scripts are loaded in the order in `scripts/manifest.mjs`. The legacy shared lexical scope is retained for compatibility. `scripts/build.mjs` embeds those exact source files and styles in a standalone HTML artifact. The build needs only the Node standard library. The optional browser tests use Python Playwright; it is not a runtime dependency.

## Derived layers

`src/world/roads.js` and `src/civilization/folk.js` read the finished world and civilization and produce roads, quays and walking figures. They are strictly downstream: the causal chain above is unchanged, and no travel cost, income, border or historical outcome depends on them. The road network is cached in a `WeakMap` keyed on the world, so neither the world object nor the save gains a field, and it is rebuilt only when the set of settlements changes. Town waterfront fittings live in `city.port`, beside `piers` and `farms`, and are deliberately not `city.buildings`: the block plan, the LOD budget and `city.fingerprint` are unaffected.

A figure is one sample of a province's live `people` mixture, not a per-house ethnic classification — the same constraint the dossier already carries. Appearance differs between peoples; speed, routes and capability do not. `src/render/road-renderer.js` and `src/render/folk-renderer.js` extend `AtlasRenderer.prototype` after definition rather than editing the baseline-locked renderer. See `docs/ROADS_PORTS_FOLK.md`.

## Versioning

The outer world-save envelope uses `version: 7, engine: 7.0.0`. The inherited civilization data stays at `simulation.version: 6`; the loader accepts known VI/VII envelopes and validates city project records. Unknown schema versions are rejected. City-plan JSON has its own `telluric-city-plan` format and is export-only.
