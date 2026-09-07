# Roads, ports and the peoples on them

Three layers sit on top of the existing atlas without changing what it models: land routes
between settlements, working waterfronts, and walking figures drawn from each province's
own population mixture.

## Nothing here is an input to the simulation

The road network is **derived from** the civilization state and never fed back into it.
No travel cost, income, border, war outcome or saved timeline depends on a road existing.
`tests/roads.test.mjs` pins this: the physical, settlement and political fingerprints and
the full `JSON.stringify(sim)` are byte-identical before and after the network is built,
and `sim.roads` is asserted to not exist. A save written after this change loads in an
unmodified build, and vice versa.

`src/world/geography.js`, `src/civilization/simulation.js` and `src/render/world-renderer.js`
are byte-locked by `docs/CORE_BASELINE.json`. None of them is edited. The renderer is
extended the same way it already extends itself — by wrapping `AtlasRenderer.prototype`
after definition, in `src/render/road-renderer.js`.

## The network

`RoadNetwork.ensure(world, sim)` runs **one** multi-source Dijkstra over the raster, seeded
at every settled province cell. Each cell learns its cheapest settlement and its parent, so
a road is a parent walk from a catchment boundary rather than one search per town pair.
The step cost is grade first, then altitude, wetland and waterless ground, with a discount
along modelled river valleys — the same terms `buildAdministrationGraph` already uses.

- Sea and lake cells are **impassable**. A road is never drawn over open water, and a
  crossing to another shore needs a ferry nobody has modelled.
- River cells stay passable at a surcharge and are flagged. That flag, and only that flag,
  is what places a bridge deck.
- Where two catchments meet, the cheapest boundary cell is the pass, ford or shoulder the
  route would actually take. Pairs costing more than 210 units are dropped: two towns with
  a mountain range between them are not neighbours.
- Traffic is a betweenness estimate over the resulting ~100-node graph, weighted by
  `sqrt(popA·popB)` and damped by distance. Trunk roads emerge from where the network's
  travel concentrates instead of being declared by settlement size.

The result is cached in a `WeakMap` keyed on the world — the idiom `CityEnvironment`
already uses — and rebuilt only when the set of settlements changes. Neither the world nor
the save gains a field. Build cost on the default world is about 45 ms for 103 settlements,
182 roads and 147 bridged crossings.

## Ports

Two scales, from the same shoreline.

On the atlas, `RoadNetwork` finds each settlement's nearest land cell touching real sea or
non-frozen lake, within three cells so the quay belongs to its town. That yields a quay
slab, two jetties, a moored hull, a warehouse and — on a sheltered harbour — a derrick.
A landlocked province gets nothing; the test asserts the converse too, that no settlement
with usable water on its doorstep is skipped.

In a town, `generateCity` adds `city.port` beside the existing `piers`, `walls` and `farms`:
a quay run ordered along the shore tangent the street grammar already estimated, jetties
that are only built where water is continuous for their whole length, moored hulls, bollards,
landward sheds and a beacon on an exposed harbour. Landings elsewhere on the shore remain
ordinary piers.

These are port **fittings, not `city.buildings`**. The block plan, the LOD triangle budget
and `city.fingerprint` are untouched, so every town regression and saved recipe replays
exactly as before. The fittings are placed with hashes rather than `rng()` draws, so the
tree, field and wall streams that follow are bit-identical to a town without a port.

## The peoples

A figure is **one sample drawn from the province's live `people` mixture**. It is not a
claim about who lives in the building beside it, and no building, street or district is
labelled by ancestry. `tests/folk.test.mjs` checks that a large draw reproduces the
province's mixture and that the smallest minority still appears.

Appearance varies — height, build, colour and one silhouette accent per people. Nothing
else does. `Folk.speedOf` never reads `agent.people`, and a test asserts both that the
function's source contains no reference to it and that all seven peoples yield one speed.
Individual gait still varies, per figure.

Positions are a **pure function of the clock**. There is no stepped agent state to drift
away from the simulation and nothing to save. A street walker follows a short contiguous
run of one real street, on a shoulder rather than the centre line, and turns round at the
end rather than teleporting home. Others step from a compound's door connector to the
street it is attached to, or hold the market square. Travellers walk a road's cell path;
hulls follow the sea lanes the civilization model already computed.

## What is drawn when

The change-over is the existing town-detail threshold, `AtlasRenderer.FOLK_ZOOM = 18`, so
nothing changes representation twice on the way in.

| zoom | roads | ports | traffic | townsfolk |
|---|---|---|---|---|
| < 4.8 world | cartographic ribbons, width by class | quay symbols | — | — |
| 4.8 – 18 region | same, plus bridge decks | quay symbols | carts, riders and hulls as map symbols | — |
| ≥ 18 town | ground-seated near band | the town's own waterfront | true-scale travellers | true-scale residents |

The cartographic ribbon clears the coarse jittered world terrain; inside a town that same
clearance would be a road floating a storey above the street, so the near band is a
separate low-lift mesh built only beside loaded towns. Both are behind one **Roads & ports**
toggle; figures are behind **Townsfolk**.

## Cost and the animation loop

`buildFolk` rebuilds the visible crowd each frame and uploads it with `shadow = false`,
restoring `dirtyShadow` around the call. Both `AtlasRenderer.upload` and the software
rasterizer set that flag unconditionally; without the restore a walking crowd would
re-render the shadow map twenty-four times a second. A test pins it.

A measured close frame — one loaded town, 55 residents, its traffic — costs **1.8 ms mean,
2.5 ms worst** for about 1,800 triangles, against a 40 ms budget. The crowd is culled to
the camera box and capped at 220 figures (45 on software).

The ticker in `ContinuousMap` runs at ~24 fps and only when the map is interactive, the
toggle is on, zoom ≥ 4.8, the tab is visible, the renderer is **not** the Canvas software
fallback, and the reader has not asked for reduced motion. In those last two cases the
streets are still populated — the figures simply hold position.

## Scope

Figures are decoration derived from population, not agents. They carry no cargo, pay no
tax, spread no faith and make no contact; a caravan on a highway does not move trade, and
removing it changes nothing. Road widths, quay sizes and figure heights are the atlas's
existing exaggerated, non-metric scale. Road paths are least-cost lines over a coarse
raster, not surveyed alignments, and no gradient, bridge span or harbour depth is
engineering-valid.
