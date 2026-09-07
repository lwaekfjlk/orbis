# Verification — roads, ports and townsfolk

Branch `worktree-roads-ports-folk`, based on `848f605`. Default world `Aereth-47`,
history seed `First-dawn`: 622 districts, 103 settlements, 96 towns, 38 realms.

## What was run

```
npm run build     # regenerates generated-worker.js, index.html tags, dist bundle
npm test          # 70 tests, 70 pass, 0 fail  (52 pre-existing + 18 new)
```

The three baseline-locked files still match `docs/CORE_BASELINE.json` byte for byte —
`src/world/geography.js`, `src/civilization/simulation.js`, `src/render/world-renderer.js`
are unedited, and `tests/onemap.test.mjs` confirms it. `settlementFingerprint` is still
`77c3b21f`.

## What was NOT run

`npm run test:browser` (`tests/continuous_browser.py`) is the acceptance test for the
one-canvas interaction, and it has been extended with road, port, waterfront, crowd,
shadow and toggle assertions plus two screenshots. **It was not executed: this environment
has no Chromium binary.** Nothing in this document is a claim about rendered pixels,
observed frame rate on real hardware, or the Canvas software path in a real browser.
The numbers below come from Node, against the same modules the browser loads.

## Measurements

| | |
|---|---|
| Road network build | 45 ms, cached thereafter (rebuilt only when the settlement set changes) |
| Roads / bridged crossings / quays | 182 / 147 / 79 |
| Road classes | 100 trail, 56 road, 26 highway |
| Road cells | 3,122 — none over sea, none over lake |
| Connected components | 11, for 11 landmasses holding settlements: one network each |
| Static geometry | 38,664 road triangles, 7,603 quay triangles, 2,256 near-band triangles |
| Crowd rebuild, close frame | 1.78 ms mean, 2.48 ms worst, ~1,800 triangles, 55 residents |
| Figure cost | 28–36 triangles depending on the people's accent |

Seating, measured against `AtlasSpace.surface` at every emitted vertex:

| mesh | clearance above its own ground |
|---|---|
| `roads` | 0.079 – 0.085 (surface ribbon and its shoulder; exact, no slack) |
| `roadsNear` | 0.004 – 0.006 |
| bridge decks | 0.300 – 0.866 (flat over the gorge, resting 0.30 on its highest support) |
| bridge footings | −0.134 – −0.020 (founded in the bank, as intended) |

## Guarantees asserted, not assumed

- `physicalFingerprint`, `settlementFingerprint`, `politicalFingerprint` and the whole of
  `JSON.stringify(sim)` are identical before and after roads, quays and figures are built.
  `sim.roads` is asserted not to exist: nothing entered the save.
- `city.fingerprint` is unchanged by the new waterfront, because its fittings are not
  `city.buildings`. `auditCity` still reports zero wet, road-overlapping or overlapping
  buildings on a harbour town.
- Every road cell is land; every bridge flag is a real channel; every river cell a road
  passes through is flagged, so nothing quietly fords.
- Every quay stands on land beside real water, and no settlement with usable water on its
  doorstep is skipped.
- `Folk.speedOf` contains no reference to `people`, and all seven peoples yield one speed
  from the same agent. Over 24,000 draws the sampled mixture tracks the province's own
  `people` array to within 0.02, and the smallest minority still appears.
- Figures are translation invariant and stay inside a one-unit box above their own feet.
  This one caught a real defect: the accent helper added the figure's base height to
  already-absolute offsets, so horns, tails and crests floated at double height anywhere
  but the origin. The earlier version of the test built at `0,0,0` and missed it.
- A crowd rebuild uploads with `shadow:false` and leaves `dirtyShadow` untouched.

## Two defects the seating test found

The first ribbon implementation used `Geometry.line`, which offsets both edges sideways
at the centre line's height. On a steep cross-slope that buried the uphill edge 0.113
into the hill — a road vanishing halfway up a pass. Lifting every vertex above the ground
under *that vertex*, with the centre line as a real vertex row, fixed it exactly.

Bridge piers were then founded on one sampled point while the box footprint extended
past it, leaving a pier hanging 0.002 above the bank on steep ground. They are now
founded below the minimum of their own footprint.

## Known limits

Figures are decoration derived from population, not agents: they carry nothing, contact
nobody, and deleting them changes no model quantity. Road widths, quay sizes and figure
heights are the atlas's existing exaggerated, non-metric scale. Road paths are least-cost
lines over a 300×180 raster, not surveyed alignments; no gradient, bridge span or harbour
depth is engineering-valid. The single-component-per-landmass result is a property of this
world, not a theorem — a landmass genuinely split by impassable ice would legitimately
produce two networks, and the test would flag it for a human to look at.
