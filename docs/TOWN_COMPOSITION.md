# Town-level assembly architecture

The city is the main composition, not a container of independent model previews.

```
read-only parent geography + actual settlement + town recipe
                    ↓
         town street / district grammar
                    ↓
 terrain-fitted parcels + road-facing sockets
                    ↓
ordinary compound kits + a few public anchors
                    ↓
    one interactive town scene + whole-scene GLB
```

## Representation

A `TownCatalog` profile contains `plan`, `kit`, `material`, `roof`, district names, compound scale, spacing and wall expression. Nine profiles are authored. Their existence is not a claim that geography uniquely determines institutions or culture.

A serialized `telluric-town-recipe` has `version`, `style`, `seed`, `variety`, `provinceId` and `sourceCell`. Runtime resolution binds it to the selected existing settlement. Same world/site/input/recipe produces the same layout. Importing the same recipe elsewhere requests adaptation, not exact transplanting.

Each placed block has an occupied footprint, a local module family, program, variant, orientation, district, and a street socket. A module can contain several roofs, a court, workshops, stalls, galleries or towers. Counts of represented structures are schematic; they do not create residents.

## Planning

`TownGrammar.plan` establishes different target graphs: axial, processional, rings, groves, terraces, labyrinth, waterfront, grid and ribbon. Targets are snapped to valid local candidates and connected with the terrain-aware pathfinder. A connected component seeded at the market prevents the town from spilling onto an unrelated shore without a crossing. Ocean and lake cells remain obstacles; the inherited river-crossing rules are retained.

Program seeds place economic and civic districts relative to the street grammar. The geometry-backed scene places ordinary compounds and reserved public anchors, rejects unsuitable slopes/water/collisions, and drops compounds without a valid connector to a road. Per-parcel facing and geometry bounds keep roofs and walls inside validated land parcels.

This is not a manually authored full-size city pasted on a map. Nor is it a global tiling solver: no claim of optimal city layout or universally feasible prefab placement is made. Some inputs yield fewer compounds because the terrain is restrictive.

## Geometry

`TownBuildingKit` reuses the architectural primitives from `LandmarkKit` while defining ordinary residential, market and workshop compounds separately from major monuments. Common buildings stay common: not every scholar house receives a giant crystal tower and not every pilgrimage-town house is a cathedral.

Public anchors share the town's material/roof recipe through `TownCityBinding`; explicit stored landmark customizations remain optional. Meshes are grouped for roof visibility and exported as one assembled town with vertex colors, not as a screenshot texture.

## Persistence and independence

Recomposition checks `physicalFingerprint` and `settlementFingerprint` and stores only the visual recipe in `sim.townRecipes`. UI changes do not advance years or change government/faith/population. Whole-world save/load validates recipes before resolving them again on reconstructed geography. Generating a new world or founding history is a separate operation.

## Extending the kit

Add a catalog entry, an allowed-site predicate, a street grammar branch and an ordinary compound builder. Every new compound should be normalized inside its parcel, face its street connection and separate roofs from walls where possible. Add it to the nine-family tests with a compatible fixture and test at least one constrained site. Avoid inventing a lake or changing climate merely to display the new asset.

Further work would include hand-authored GLB prefab sockets, adjacent-block frontage matching, per-neighborhood mixed traditions, bridges/canals at local scale, and finer parcel editing. These are not implemented by the current whole-town seed controls.
