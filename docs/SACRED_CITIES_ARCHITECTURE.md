# Integration contract

The release does not display a concept image in the map. Runtime geometry flows through:

1. `generateWorld` → existing physical arrays.
2. `createCivilization` → existing populated settlements and polities.
3. `TownCatalog.resolve` → town recipe, preserving geographic compatibility.
4. `FortressPlan.reserve` → a dry non-icy real local parcel. Monument footprint must not enclose the starting market; otherwise all roads could be disconnected.
5. `generateCity` → streets around the reserved parcel, buildings outside it, walls around actual developed land. `building.sacred=true` marks the grand sanctuary.
6. `TownCityBinding.resolve` → one recipe, including parent location, ritual, seed, and `sacredVersion`.
7. `SacredCityKit.build` → model parts with real triangles.
8. `SacredCityKit.miniature` → fits those parts into the world-derived local parcel. Landmark detail keeps original scale, named parts and roof visibility. World-site registry obtains the same flagged recipe by verifying the actual town footprint.

The new sacred-site cache uses a `WeakMap` keyed by the world object. It retains only the monument record, town recipe and profile, not a second simulation or all city vertices. Replacing the world releases this mapping. City renderer geometry reuse includes the city/environment signatures, mode, realm, saved landmark recipes and ongoing project state.

The sacred kit uses one authored structural family, with solar, celestial, hearth, and grove ritual variants. Disabled editor choices explicitly indicate which material/culture/roof controls are not compatible with this particular authored kit. Existing non-sacred families continue using their prior modules. Do not market these variants as nine newly hand-authored photorealistic cities.

## Units and conservation

Town dimensions, building scales and monument heights are schematic art units. Geometry exaggerates vertical scale intentionally. It is not safe construction engineering. Foundation meshes can stand above the sampled ground but never mutate the physical world height or climate arrays. Ornamental water is omitted when the inherited freshwater flag is insufficient. This is a visibility/eligibility rule, not a dynamic model of an aqueduct's water budget.

## Rendering

WebGL2 shader now accepts a configurable light direction; its original default is retained for the world view. The software fallback has oversampling, light-space shadows and approximate screen-space contact occlusion. Contact occlusion is cosmetic, not physical. Pointer interaction temporarily lowers software sampling. Real hardware GPU performance and visual parity still need testing.
