# TELLURIC 13 — Continuous Atlas

One visible map canvas, one georeference, one camera. Zoom towards a real settlement to see buildings **inside its original landscape**. No town or monument scene replaces the world.

Open `dist/telluric-onemap.html`, or run `npm run dev` with Node.js 20+. There are no npm dependencies or external assets. Run `npm run build` after changing source; it rebuilds both the trusted Blob Worker source and the self-contained HTML.

Scroll to approach, drag to pan, Shift-drag to orbit, click a building to inspect, and use **Wider setting** to pull back. Search → **Zoom** flies the same camera to the town. The timeline, regeneration and world saves remain available.

Heavy meshes are synthesized in a Worker and mounted in atlas coordinates. The model cache is bounded to two detailed towns; regional silhouettes are replaced with finer geometry nearby. This does not promise zero LOD popping or real-time frame rates on software graphics.

Terrain is sampled from the unchanged physical world. Refined triangles do not invent new mountains or water, and buildings use re-seated foundations. Render scale remains exaggerated and non-metric. Architecture is synthetic and not a surveyed, engineering-valid city.

See [中文完整说明](README.zh-CN.md), [verification](docs/CONTINUOUS_VERIFICATION.md), and `src/continuous/`.

## Tests

- `npm test` — current model and geometry tests.
- `npm run test:continuous` — shared-surface and rigid-anchor checks.
- `npm run test:browser` — the current one-canvas exploration workflow (Python Playwright + Chromium).

Older modal scene browser tests are retained for historical reference and are not the current interaction acceptance tests. The recorded browser run uses the offline bundle loaded in-memory and software graphics, not a hardware GPU benchmark.
