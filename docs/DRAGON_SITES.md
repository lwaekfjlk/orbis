# Dragon sites and complete country names

Dragon King Citadels, High Holy Cities and ancient dragon ruins have distinct local SVG symbols: a coiled dragon totem, a sacred sun seal and a broken dragon totem. The small monochrome marks share the ordinary wonder pins’ scale, parchment ground and subdued ink. Their map buttons preserve geographic anchors and receive space before map lettering; ordinary monument icons can yield to country names. Search presents the existing special sites and accepts their English names or 龙城, 圣城 and 龙族遗迹.

Country labels always print `RealmNames.fullName(realm)`. A narrower label uses the same complete text, wraps it and, when necessary, connects it to an owned territory anchor. There is no short-name or numbered substitute. Layout preserves all town names and avoids the header, timeline, status, camera controls and dedicated site markers.

## Ancient dragon ruins

`DragonRuins.sites(world, simulation)` selects up to three existing dry upland locations, separated from potential town centres, water, strong ice cover and each other. Sites remain stable as population and ownership change. A bounded, deterministic catalog supplies three variants: ruined aerie, dragon spine and horned gateway. Ruins do not create settlements or alter the physical world or province ownership.

The model is original triangle geometry with broken rings, nesting remains, spine arches, a horned gate and fallen masonry. Each structural group carries its real stone support footprints. `ContinuousRuinLayer` rotates each site consistently, seats the groups rigidly on `AtlasSpace.surface`, and extends individual stone supports to the terrain. It leaves courtyards and gateways open. The same mounted geometry supports WebGL, software rendering, triangle picking and per-site GLB export.

The streaming layer holds at most three sites, increases detail with zoom and releases old GPU resources when the world changes. History updates reassemble any invalidated model even while the camera stays still; selections and exports then use its current mounted parts. Selecting a ruin moves the existing atlas camera; its parts list and GLB export refer to that site's mounted meshes.

## High mountain cities

[High citadel founding and saved-world compatibility](HIGH_CITADELS.md) describes how very small settlements obtain a safe mountain platform and an existing local population budget. Generation depends on suitable geography; imported worlds keep their original founding rules.

## Preview

[Open the screenshot gallery](../previews/dragon-sites/index.html) for the default world, dedicated high-city models and all three dragon relic variants.

## Verification

```sh
node --test tests/dragon-ruins.test.mjs tests/ruin-layer.test.mjs tests/realm-names.test.mjs tests/town-labels.test.mjs
npm run test:full-realm-labels-browser
npm run test:dragon-sites-browser
```

The optional browser scripts accept `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` for a local browser runtime. By default they test the standalone HTML offline. The site browser test verifies real map buttons, both high-city models, every default ruin, projected mesh visibility, triangle hits, part navigation, isolated GLB content and unchanged world fingerprints after exploration.

A separate validated save fixture redistributes one ordinary town’s existing population to just below the city-detail threshold. Advancing one real year crosses that threshold and invalidates landscape protection. The test keeps both models at LOD 2 and checks actual landscape-key changes, unmoved camera, remounting, current exports and a closed card that remains closed. Its history fingerprints are recorded separately from unmodified exploration.
