# One map, not a transition between dioramas

The existing world generation, settlement/civilization state, city grammars and architectural kits are retained. `ContinuousMap.init()` installs an instance-level terrain and city layer on the existing `AtlasRenderer`. The base world renderer source is unchanged; both the world canvas identity and renderer survive zoom, regeneration and load.

## Coordinate contract

For local city coordinates `(x,z)` the parent grid coordinates are:

```
gx = province.x + x * city.span / city.width
gy = province.y + z * city.span / city.width
X = (gx / (GW-1) - 0.5) * MAP_X
Z = (gy / (GH-1) - 0.5) * MAP_Z
```

`AtlasSpace.surface` interpolates the exact same alternating triangular height surface used in the current atlas display. The source elevation is the existing land/ice or lake surface. Patch subdivision retains the parent plane and shared edges; it does not introduce extra topography. This display extension removes the base renderer's decorative horizontal vertex jitter in the continuous view only. Source terrain arrays are not changed.

Rigid building groups use the maximum of sampled footprint elevations for their foundation deck. Their local vertical detail is scaled into atlas units, and footings extend to the inherited slope. Ground-hugging streets, waterways and field details are projected onto the same surface. Extreme retained slopes can produce tall, schematic retaining structures; this is not civil engineering validation. City layouts remain procedurally synthesized rather than surveyed.

## Resource lifecycle

Full terrain stays resident. At regional zoom the camera requests the nearest existing settlements. A Blob Worker compiles only trusted bundled engine modules, constructs meshes, and transfers typed-array buffers back to the main thread. The main thread attaches those buffers to the existing world renderer. A maximum of two detailed city meshes is cached. At distant zoom, inherited atlas markers are used; at intermediate zoom, low-detail building silhouettes are used; near zoom displays the full architectural mesh.

The built bundle contains a generated Worker source string so the downloadable HTML needs no external scripts. `npm run build` must regenerate it after source changes. Uploaded recipes are validated data, not executable code. No user-provided script is evaluated.

Changing the world or replacing the civilization state terminates the old Worker, invalidates cached mesh identities and discards in-flight stale work. Annual changes within the same simulation invalidate affected city keys through their state and owner metadata. Geography is read-only throughout.

## Interaction contract

OneMap remains in `world` mode. `CityUI.open`, city search and monument entry delegate to smooth camera motion rather than opening the legacy modal renderers. The scroll handler sits on the map stage so map labels do not swallow wheel input. Ray tests select buildings in atlas coordinates and reject hits hidden behind terrain. Optional details and projects use one small drawer, not a second map.

Cartographic borders and large map-symbol trees recede at local zoom. Smaller surrounding vegetation is sampled from the original biome/temperature/ice fields. The map retains the entire physical landscape beyond each town; there is no local slab edge or template mountain backdrop.

## Scope

This is continuous camera navigation and co-located geometry, not a claim of continuous physical resolution. Original geography is still coarse and stylized; LOD objects can appear after loading. Software rendering and large city upload remain expensive. No first-person collision, interior simulation, photogrammetry, new erosion detail, or surveyed metric scale is provided.
