# TELLURIC 13 — Continuous Atlas

One visible map canvas, one georeference, one camera. Zoom towards a real settlement to see buildings **inside its original landscape**. No town or monument scene replaces the world.

Open `dist/telluric-onemap.html`, or run `npm run dev` with Node.js 20+. There are no npm dependencies or external assets. Run `npm run build` after changing source; it rebuilds both the trusted Blob Worker source and the self-contained HTML.

Countries draw recognizable names from ten mythological traditions, including Asgard, Avalon, Olympus and Kunlun. Inspired by Azgaar's namebases, each short name has a separate government title and a visible explanation of its mythological source. New worlds, new political histories and secessions use these names; loaded saves retain their existing names, and manual renaming clears the generated origin. See [realm names and sources](docs/REALM_NAMES.md).

Scroll to approach, drag to pan, Shift-drag to orbit, click a building to inspect, and use **Wider setting** to pull back. Search → **Zoom** flies the same camera to the town. The timeline, regeneration and world saves remain available.

Heavy meshes are synthesized in a Worker and mounted in atlas coordinates. The model cache is bounded to two detailed towns; regional silhouettes are replaced with finer geometry nearby. This does not promise zero LOD popping or real-time frame rates on software graphics.

Seven **legendary places** are named from the finished physical model, not invented on top of it: The Dragonwell stands on the greatest river's own headwater, The Skymirror on the highest standing water in the world, The Nightspire and The Drowned Choir on the two extremes of the elevation field, and so on for The Emberthroat, The Weeping Stair and The Hollow Crown. Each carries its lore and the measurement it was chosen by, and appears as a gilt marker, a name on the map, a search hit and a detail card. A world whose landform is missing simply has no legend there. Toggle them with **Legends**.

Terrain refinement follows the camera — a grid cell is subdivided up to eight ways once it covers enough screen — and the map renders above CSS resolution. Refined vertices sample the same parent surface, so this adds triangles, not landscape.

Terrain is sampled from the unchanged physical world. Refined triangles do not invent new mountains or water, and buildings use re-seated foundations. Render scale remains exaggerated and non-metric. Architecture is synthetic and not a surveyed, engineering-valid city.

Sanctuaries, palaces and houses use modeled window reveals, layered entrances, supported bell chambers and finished roof edges. See the [architecture refinement and synchronized comparison](docs/ARCHITECTURE_REFINEMENT.md), or run `npm run preview:architecture -- --baseline b5f00bc` to inspect the original and refined meshes together.

Roads join settlements over real ground — bridges only where the world has a channel, never a metre of road over open water — and coastal towns get a working waterfront. Small figures of the world's seven peoples walk the streets and the roads; each is one sample of its province's population mixture, and appearance is the only thing that differs between peoples. None of this feeds back into the simulation: roads carry no trade and figures carry no cargo. See [roads, ports and folk](docs/ROADS_PORTS_FOLK.md).
Ground colour, vegetation and building form all read one climate resolver over the existing temperature, aridity and ice fields, so a boreal town and a tropical town are visibly different places at both scales. Roof pitch, eaves, openings, chimneys and palette are decided per block from that block's own cell. This is a legibility pass over data the model already produced — no snow, water or terrain is invented, and the physical world is byte-identical to before it.

**Click a town and somebody who lives there tells you about it.** An illustrated portrait — a human, an elf, a broad and bearded Stonekin, a horned Hornkin, a finned Tideborn, a muzzled Beastfolk, or a dragon with swept horns and slit pupils — with their name, their office and five chapters in their own voice: the peoples who came, the polity that formed, the trial the town survived, the deed that answered it, and what is still standing. The portraits use layered colour, shaped hair and clothing, and distinct anatomical silhouettes; each narrator keeps the same seeded face wherever they appear. Each chapter shows the model fact beneath it. The trial is a real conquest or siege from the chronicle when there is one, and otherwise the ground itself: the arcane rift under the district, a legendary place within reach, a live volcano, the wells, the open coast. A conqueror belongs to their realm, so one warlord recurs across every town they took and reading along a frontier assembles one war. No people is ever the enemy — an adversary is a state, a disaster or a place, and narrators and heroes alike are drawn from each province's live population mixture. See [city sagas](docs/CITY_SAGAS.md).

See [中文完整说明](README.zh-CN.md), [verification](docs/CONTINUOUS_VERIFICATION.md), and `src/continuous/`.
## Tests

- `npm test` — current model and geometry tests.
- `npm run test:climate` — climate legibility: colour separation, treeline, house response, same-tradition divergence.
- `npm run test:continuous` — shared-surface and rigid-anchor checks.
- `npm run test:roads` — road, bridge, quay and waterfront checks.
- `npm run test:folk` — population mixture, figure and animation-budget checks.
- `npm run test:browser` — the current one-canvas exploration workflow (Python Playwright + Chromium).

Older modal scene browser tests are retained for historical reference and are not the current interaction acceptance tests. The recorded browser run uses the offline bundle loaded in-memory and software graphics, not a hardware GPU benchmark.
