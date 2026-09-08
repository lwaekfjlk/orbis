# Map interaction performance

The interaction changes defer optional camera refinements during held gestures, avoid model-change work on every camera frame, reuse dynamic figure buffers, and reduce town-label collision-search allocation. They retain the complete names and the populated city view.

Measured on 2026-09-08 with the default `Aereth-47` world at year 400, 1280 × 900 CSS pixels, DPR 1, offline headless Chrome and SwiftShader. The baseline bundle was built from `9f18403`. Both runs visited Ath Annaber (province 421). Every phase finished at exactly the same camera coordinates in the two runs.

| Observation | Baseline | Candidate |
| --- | ---: | ---: |
| World-drag label layout, average per call | 36.55 ms | 20.16 ms |
| World-drag label layout, total / calls | 913.7 ms / 25 | 483.8 ms / 24 |
| City-pan terrain rebuilds while pointer held | 2 | 0 |
| City-rotate terrain rebuilds while pointer held | 4 | 0 |
| City-pan / rotate terrain rebuilds, including release | 2 / 4 | 1 / 1 |
| City-pan / rotate river builds while pointer held | 5 / 23 | 0 / 0 |
| Idle label layouts over 2.4 seconds | 9 | 0 |
| Idle browser layouts over 2.4 seconds | 18 | 0 |
| Visit terrain rebuilds | 3 | 3 |
| Visit phase, including fixed 1.5-second settling period | 3.99 s | 5.15 s |
| World-wheel terrain rebuilds | 8 | 9 |

The robust behavioral result is that the measured pan and rotation rebuilt terrain only after the pointer was released. The idle scene continued animating its residents without rerunning label layout. The final scene contained 299 buildings, 48 resident figures and 9,444 figure vertices; WebGL reported no error. Browser exceptions and console errors were absent, and physical, settlement and political fingerprints were unchanged.

This does **not** establish an overall FPS or Visit-speed improvement. SwiftShader is a software GPU, and unrelated CPU-intensive Node processes were observed during the candidate capture. In the world-drag phase, both versions submitted exactly 5,141,550 triangles, but elapsed time rose from 7.34 to 20.86 seconds despite less label CPU work. CPU/driver timing varies under this contention. The candidate still spent about 1.21 seconds on one terrain rebuild after pan release and 0.69 seconds after rotation. Wheel events still triggered repeated rebuilds, and Visit retained three terrain builds. These remain follow-up performance targets.

A separate baseline CPU probe found 967.5 ms in 25 label layouts, with only about 17.5 ms in directly timed DOM reads. Sampled CPU time was concentrated in `nearby` and `fitTown`, so the change targets collision lookup rather than adding a dimensions cache.

To control for the different machine load between captures, a second probe ran both label functions in the **same browser process**, using the final world and the original function extracted from `before.html`. It replayed the same 24 pan camera positions, warmed both implementations, then alternated their order over four measured rounds. Rendering was paused to isolate the layout operation. All 96 paired comparisons produced exactly equal outer HTML and bounding rectangles for all 148 labels, as well as equal landmark pins and compass state.

| Same-process label A/B, 96 calls each | Original function | New function |
| --- | ---: | ---: |
| Mean layout duration | 120.01 ms | 45.77 ms |
| Median layout duration | 117.70 ms | 43.50 ms |
| 95th percentile | 162.00 ms | 56.40 ms |

The mean decreased by 61.9% in this paired probe. Other tests were still consuming CPU, so its absolute durations should not be compared with the separate browser runs above. This establishes reduced collision-layout work for identical output; it does not establish an equivalent whole-frame speedup. The same A/B method is available through the benchmark's `--labels-only` mode.

## Reproduce

Use the same browser, viewport, seed and machine for both captures. Keep other browser benchmarks and geometry tests stopped while collecting timings. Install Playwright or point `PLAYWRIGHT_MODULE` at an existing installation; `CHROMIUM_PATH` selects Chrome. The benchmark launches a separate temporary Chrome profile and disables network access.

```sh
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export ORBIS_INTERACTION_OUTPUT=/tmp/orbis-interaction-perf
mkdir -p "$ORBIS_INTERACTION_OUTPUT"

# Extract the exact committed baseline bundle without changing the checkout.
git show 9f18403:dist/orbis-onemap.html > "$ORBIS_INTERACTION_OUTPUT/before.html"
node tests/map-interaction.browser.mjs --before

# In the candidate checkout:
npm run build
node tests/map-interaction.browser.mjs

# Optional isolated label A/B using those same preserved and current bundles:
node tests/map-interaction.browser.mjs --labels-only
```

The current benchmark can execute either preserved bundle; it does not require the new test file to exist in the baseline checkout. It runs 24 native pointer steps for world pan, 18 wheel events, the real Visit entry point, 24 city-pan steps, 24 shift-drag rotation steps, and a 2.4-second animated idle period. Gestures assert that the map captured the pointer and that the camera actually moved. It records method counts, inclusive and self time, maximum call time, calls during pointer capture, long tasks, RAF gaps and Chrome layout/script metrics. Mesh and WebGL checks happen after the timed phases.

Reports are written as `before-report.json` and `after-report.json` under `ORBIS_INTERACTION_OUTPUT`, with a city screenshot from each run. Nested method timings must not be added together; GL submission time is not completed GPU execution time. Long-task entries near phase boundaries and raw RAF gaps are supporting diagnostics, not independent hardware-FPS measurements. `tests/place-cards.browser.mjs` provides the separate card, Visit, Story and model-restoration regression coverage.

The `--labels-only` mode needs only the preserved baseline HTML and a built candidate; a preceding full interaction run is optional. It extracts each complete `positionLabels` function between verified declaration boundaries, runs both against the same current world, and asserts the paired DOM snapshots match. Its separate `label-ab-report.json` records both bundle paths and SHA-256 hashes, function hashes, seed, viewport, every camera pose, raw call durations and mismatch counts. It does not overwrite either full interaction report. For a shorter correctness smoke, add `--label-rounds=1`; the default four measured rounds are used for the comparison above, in addition to one warmup round.
