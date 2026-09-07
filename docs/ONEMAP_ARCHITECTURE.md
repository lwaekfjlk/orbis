# One Map shell

## Scene ownership

`OneMap` owns the visible scene (`world`, `city`, `landmark`), shared chrome, optional drawers, search and navigation. Scene controllers still own geometry. City and landmark dialogs use nonmodal `show()` and occupy the same viewport as the world; CSS makes covered scenes invisible and noninteractive. The shared controls remain above the scene and are never blocked by a city editor modal.

`CityUI.open/close` and `LandmarkUI.load/close` explicitly report scene changes. On Back, the original world renderer and camera are reused, not reset. Only the Home/Fit buttons reset a camera. Geographic sampling, town compatibility, city recipes and landmark identity remain in their existing modules.

## Progressive disclosure

The initial screen contains the atlas, minimal location/breadcrumb strip, three tool icons, camera buttons and time/regeneration bar. `inspectWorld`, `inspectBuilding` and `inspectPart` produce small cards; only an explicit Details action reveals a drawer. Existing realm, city and landmark editors are moved into that drawer, keeping their event handlers.

No full table, template gallery or separate city page is shown automatically. Search routes to real entries in the current simulation. There are no invented destinations just to populate the UI.

## Simulation lifecycle

The existing deterministic annual engine is unchanged. `advance` adds a short per-batch yield and a `simAdvancing` lock, preventing overlapping batch steps or regeneration. `refreshAll` notifies the shell after updating existing controllers. The same step controls operate while a town or landmark is visible.

Regenerate shows a nonmodal panel with a proposed random seed. Opening, changing or cancelling that form has no simulation effect. The Generate action calls the existing `buildWorld`; closing local scenes is part of that existing replacement lifecycle. Restart history is a distinct, confirmed action.

## Bundling and compatibility

`index.html` precedes scripts with all required shell nodes. The build inlines CSS regardless of link attribute order and fails if scripts/styles remain external or the shell is after script execution. `src/bootstrap.js` starts the world only, never an asset library or arbitrary town.

`legacyHooks` contains retired, hidden, inert DOM endpoints needed by established controllers. It has no visible layout and receives no keyboard focus. This is a compatibility boundary rather than a claim that all old UI controller functions were deleted.

## Rendering and limitations

One viewport is not a universal scene graph or a literal single WebGL canvas. The scenes are still independently generated at different schematic scales, and the transition is a drill-down rather than continuous physical LOD. The fallback software renderer is supported. Hidden scenes may still perform some geometry updates during a history step; continuous high-speed playback remains compute-bound on complex worlds. A future optimization can decouple hidden rendering from model aggregation without changing the shell contract.
