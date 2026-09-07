# Continuous Atlas 13.0 — Verification

## What was changed

Town meshes now inhabit the existing world canvas. The same world coordinates, terrain surface and camera are used for the atlas, region, town and building views. City and landmark dialogs are not opened by the default exploration controls. This is an implementation change, not a generated illustration or a fade between separate scene canvases.

## Executed tests

| Suite | Result |
| --- | --- |
| Complete Node model / layout / geometry / interface suite | 50 passed, 0 failed |
| Final focused coordinate and one-map regression run | 10 passed, 0 failed (subset, not 10 additional tests) |
| Chromium interaction suite | 20 passed, no page errors |

Raw logs: `CONTINUOUS_NODE_RESULTS.tap`, `CONTINUOUS_FINAL_RESULTS.tap`, and `CONTINUOUS_BROWSER_RESULTS.json`.

The browser suite exercised the built standalone HTML with real mouse clicks, wheel events, UI controls, downloads, saves and imports. Every town/building navigation assertion checked that the renderer still uses the original `canvas#map`, that `OneMap.scene` is `world`, and that the former city and landmark dialogs remain closed.

## Browser check inventory

1. PASS — Initial geography, towns and polities load
2. PASS — Search zooms to Stonefall without replacing the map
3. PASS — Exploration leaves geography, population and politics unchanged
4. PASS — Stonefall inherits a dry lake basin and real glacial foothills
5. PASS — Wider setting is only a continuous camera pullback
6. PASS — Mouse wheel crosses regional/town detail thresholds in place
7. PASS — A building is selectable on the world canvas
8. PASS — Closer focuses the same in-place mesh, not a monument dialog
9. PASS — Details open only a small side drawer
10. PASS — Existing grand sanctuary stays in the actual town during zoom
11. PASS — Repeated city/building zooms do not mutate the world
12. PASS — Annual simulation runs while looking at an embedded sanctuary
13. PASS — Local mesh cache remains bounded
14. PASS — Lakeshore town preserves the same canvas and surrounding water
15. PASS — Regenerate replaces world data, keeps canvas, removes stale towns
16. PASS — Existing save/load works with the continuous view
17. PASS — Newly generated cities reference the new geography
18. PASS — Mobile viewport retains the one-map view
19. PASS — Recasting societies on the same terrain invalidates city and worker caches
20. PASS — No page errors or external asset requests; mesh worker active

## Reproduction cases

The default `Aereth-47` seed initialized 38 living polities and 96 towns. `Stonefall 5` retained the inherited “Salt basin · glacial foothills” environment. Its surrounding lake, mountain slopes and glacier surfaces were never replaced by a city template. `Silverford` exercised the large sanctuary geometry. A lakeshore settlement exercised water consistency.

Regeneration with `Continuous-ridge-17` produced 32 living polities and 103 towns, preserved the same canvas object, cleared the old detail layers and continued to support civilization simulation. Recasting societies on the same geography also invalidated the city/worker cache. The final JSON may show `loading: true` immediately after that last invalidation; it records a pending replacement mesh, not a completed city render for that final recast.

Exploration checks compared natural-world, population and political fingerprints before and after city and building focus. Annual simulation was tested separately and intentionally changes the civilization state. Local mesh cache size is capped at two towns. Background mesh generation used the Blob Worker; the observed requests were only locally generated blob URLs.

## Rendering and execution scope

Actual screenshots were produced by Chromium using the **software rendering path**. Hardware WebGL2/GPU performance was not measured. Browser policy in this test environment blocks navigation to file and HTTP pages, so the complete offline HTML was executed via Playwright `set_content` in an about:blank document. No browser security policy was disabled or bypassed. The worker, application scripts, graphics and interaction controls ran in that document. Direct double-click launch of a local file was therefore not tested in this environment; it is the intended offline distribution path, subject to the user's browser allowing JavaScript and Blob Workers. A local Node server is also supplied.

## Known limits

The whole-world height grid is still coarse. Subdividing its existing triangles adds display tessellation, not newly inferred geographic information. The atlas is a stylized, exaggerated rectangular model space, not a metric terrain survey. Buildings are rigidly seated on sampled foundations; very steep sites can show substantial retaining blocks. Wall and foundation geometry is schematic and has not been structurally validated.

Town detail is loaded on demand. Regional silhouettes and full-detail models have discrete visibility thresholds, and initial generation can take time. The camera stays continuous, but detail can appear or change level; the implementation does not claim cinematic-quality streaming or a fixed frame rate. Large sanctuaries can remain slow with software rasterization. Only up to two detailed towns are retained at once.

Screenshots in `previews/continuous/` are actual application output. Older verification documents and modal-browser tests retained elsewhere in the codebase describe earlier versions; the current browser test is `tests/continuous_browser.py`.

## Run

```bash
npm run build
npm test
npm run test:continuous
npm run test:browser
```

The application, build and Node tests require no third-party npm packages. The optional browser suite requires Python Playwright and Chromium. See the README for setup and controls.
