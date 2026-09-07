# Sacred Cities 12.0.0 — actual verification

This is the record for the integrated-map sanctuary release. Reports for Townsmith, OneMap, Citadel Studies and other earlier versions are historical and are not new tests of this release.

## Automated code/model tests

Executed on Node.js v22.16.0:

```text
node --test --test-concurrency=1 tests/*.test.mjs
43 tests, 43 passed, 0 failed, 0 cancelled, 0 skipped
Observed duration: approximately 90 seconds
```

Raw output: `SACRED_CITIES_TESTS.tap`.

The seven new sanctuary-specific cases cover an actual existing Silverford town; reserved dry, unblocked land and the market access constraint; deterministic real geometry; shared world-site/town/detail recipes; nine qualifying default towns retaining housing; ritual/crown variations; dry-input fountain omission; recipe save/replay; and GLB mesh export. Results: `SANCTUARY_NODE_RESULTS.json`.

Existing regression tests include all 96 default town layouts, parent-coordinate terrain/ice coloring, Stonefall's basin and mountain context, polity/settlement independence, inherited public-works and travel behavior, long-run civilization invariants, offline bundling, UI topology, regeneration guards, nine town grammars, and reusable-asset contracts. Passing these internal invariants is not scientific validation of the world or civilization model.

## Actual browser workflow, fully offline

The release was opened as bundled HTML in Chromium. The actual path used software triangle rasterization and a depth/shadow buffer. The test exercised the visible OneMap controls rather than replacing the map with a separate demo.

**11 checks passed**, with no JavaScript page errors, console errors or external network requests. Machine-readable details: `SANCTUARY_BROWSER_RESULTS.json`.

| Workflow | Observed result |
|---|---|
| Startup | Single world canvas; 38 realms, 96 towns; town and border overlays visible. |
| More → Visit a grand sanctuary | Entered existing Moonport, province 297; 56 building compounds, including the actual grand-sanctuary parcel; no terrain, settlement, political or year changes. |
| Search Silverford → Enter | Entered existing province 213 with 95 building compounds and a shared sanctuary recipe; only city canvas visible. |
| Click actual sanctuary in town | Selected the building record; visible Explore landmark action opened it. |
| Architectural close-up | Same recipe signature as the town model; 221,213 real triangles and 10 named mesh groups. |
| Return, orbit and zoom | Returned to the original town, changed the actual 3D camera without regenerating the layout. |
| +1 year in town | Simulation reached year 401; parent geography fingerprint unchanged. |
| Regenerate from town | Seed `Sacred-world-regression-12` produced 34 realms and 107 towns, visible political overlay, year 400; no stale city remained open. |
| Save/load | Restored the original world's complete checked fingerprints and year 401; entering Silverford reconstructed the same sanctuary recipe. |
| Mobile shell | At 390 × 844, no horizontal overflow. This is not a mobile performance certification. |
| Offline/error audit | No external HTTP requests; no page or console errors. |

Screenshots in `previews/sanctuary/` were taken from this running application. `silverford-city.png` shows the sanctuary integrated with houses, streets and defenses. `silverford-close.png` remains in the town. `sanctuary-detail.png` is the optional named-parts close-up, not the default entry.

## Geometry/export verification

The solar example: 221,213 triangles; 10 named meshes; approximate art-unit bounds 37.24 × 54.33 × 41.30. The celestial example: 221,605 triangles; 10 named meshes. Both exported GLBs were independently loaded with trimesh, yielding finite vertices and expected bounds. The files contain geometry and vertex colors, not the earlier concept images. Details: `SANCTUARY_GLB_CHECK.json`.

Named parts include the acropolis, nave/chapels, facade, tower groups, buttresses, cloister structures and ceremonial courts. The kit's module counters report 116 traceried windows, 12 double flying buttresses and 14 schematic guardian sculptures in the representative solar model. Counters describe programmed mesh components, not claims of photorealistic stonework.

## Unchanged and intentionally changed

The geography and civilization source files still match the supplied baseline hashes. Generated town layouts intentionally change because a larger usable parcel is reserved before street generation. The main market must stay outside that reserve. Cities remain tied to existing locations; no mountain, glacier, water body, new town or extra simulated population is created to fit a temple.

The source tests normalize the deliberately added shader light-direction uniform before checking the older world-renderer baseline. This does not claim the renderer is byte-for-byte unchanged; the world geography and simulation code are.

## Not established

No true hardware WebGL2 GPU benchmark or GPU visual-parity validation was run. The full Silverford scene is approximately 917,000 triangles and can be slow in software. Screen-space contact shadows and oversampling are visual approximations. No physics-based stone material set, walkable interior, NPC system or cinematic-quality match to the approved concept image is claimed. GLBs were not rendered in Blender here. This release improves one large sanctuary family and its ritual variants; it does not remake all cultural cities to the same new detail standard.
