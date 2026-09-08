<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/orbis-wordmark-dark.svg">
  <img src="assets/brand/orbis-wordmark.svg" alt="ORBIS" width="200" height="72">
</picture>

A procedural fantasy atlas you can explore from continents to city streets. Generate a world, discover its countries and people, and watch its history unfold—all in your browser.

**[Explore online](https://haofeiyu.me/telluric/)** · [中文说明](README.zh-CN.md)

![World overview with named countries, settlements and marked wildness](previews/orbis/overview-desktop.png)

*The default world, Aereth-47. Click a country name to see its territory, population and history. Countries print their full formal names. Domestic lakes belong to their surrounding countries; open wildness remains clearly marked.*

## Start exploring

| What you want to do | Control |
| --- | --- |
| Zoom from the world into a town | Scroll, pinch, or use **+ / −** |
| Move or rotate the view | Drag to pan; **Shift + drag** or right-drag to orbit |
| Turn around the current place | Click the lower-right **rotation arrow** to orbit one quarter turn; zoom, tilt and the selected place stay the same |
| Find a place | Open **Search** or press **/**; choose **Zoom ↗** to approach a town |
| Inspect a country or building | Click its name, marker or building; hover a country name to highlight its borders |
| Return to the world | Use **← Back to world** after zooming in, click the **ORBIS** logo, or press **H**; **Wider setting** pulls back from a town |

Use **Play** or the year-step buttons to advance history. **Recreate** creates a new world from a seed and your settings. The **⋯** menu includes save/load, the chronicle and exports; save your world before replacing it.

## A world with distinct landforms

![Red sandstone tablelands divided by deep canyons](previews/orbis/red-plateau.png)

*Red tablelands and canyon walls. Tree, town and border layers are switched off to show the terrain.*

Explore red-rock mesas, basalt calderas, irregular mountain massifs, branching ridges and limestone towers. Their slopes change the rivers, climate and places people can settle. Plate compression shapes the uplands; seasonal winds carry ocean heat and moisture inland. Wet slopes retain forests and meadows, dry highlands keep their earth colours, and exposed cliffs and ice have distinct surfaces.

Search for a named landform to find it. Recreate to explore the new terrain; old saves retain their original geography and history. [See the landform guide](docs/FANTASY_LANDFORMS.md) and [tectonics, climate and colour comparisons](docs/TECTONICS_AND_LANDCOVER.md).

## The largest cities

![The four largest cities by building plots, shown in a 2×2 collage](previews/readme/grids/cities-grid.png)

*Aereth-47, year 400. Ranked by generated building plots, in the same order as the table. A plot may contain a group of buildings.*

| Rank | City | Building plots | Population |
| --- | --- | ---: | ---: |
| 1 | Corbinbelararhaven | **3,452** | 41,006 |
| 2 | Alflundenvik | **2,867** | 32,228 |
| 3 | Sarrelmont | **2,789** | 32,386 |
| 4 | Camelelorport | **1,759** | 25,718 |

Zooming reveals dense residential blocks, narrow lanes, walls, temples, palaces and waterfronts in the same landscape. Main streets, gates and landmark entrances stay clear. Nearby terrain gains finer detail, and climate shapes the ground, vegetation and architecture. Click a building to inspect it; its **Details** panel also exports the town as a 3D model (GLB), excluding the surrounding terrain.

City detail loads as you approach. Initial generation and large cities can take longer on slower devices. Terrain and buildings use stylized scales.

### High cities and dragon relics

A coiled dragon totem marks a Dragon King Citadel; a sacred sun seal marks a High Holy City. These tiny settlements can appear where mountain platforms above 3,500 m have enough space, water and residents. A broken dragon totem marks ancient ruins: shattered nesting courts, dragon-spine arches and horned gateways.

Click a special symbol or open Search to visit. Searches for **龙城**, **圣城** and **龙族遗迹** work too. Ruins can be explored part by part and exported as a 3D model. [Explore the dragon sites](docs/DRAGON_SITES.md).

![A 2×2 collage of a dragon citadel, a holy city and two ancient dragon ruins](previews/readme/grids/sites-grid.png)

*Top: Sarrlororford's Dragon King's Aerie and Corbinastrelfort's High Sanctuary. Bottom: the Obsidian Aerie and the Flint Spine ruins.*

## People, countries and stories

![Four city story panels in a 2×2 collage, each with its resident narrator and town](previews/readme/grids/stories-grid.png)

*Residents tell the stories of Ath Annaber, Sarrnavgalbourne, Tapiopiirkoski and Vainojuurniemi. Each chapter includes the world or historical facts behind it.*

Seven peoples inhabit the atlas. New countries form around a majority people while retaining minority communities; migration and political events can change that mix. Names draw on mythological traditions, and national overviews explain their origins.

Select a town and choose **Hear the whole story** to meet its narrator. Explore founding stories, recorded conflicts and local landmarks, including legendary places chosen from the world's geography.

## Run locally

Download or clone this repository, then open **[dist/orbis-onemap.html](dist/orbis-onemap.html)** in a modern browser. The standalone file works offline, with no account, API key or external asset downloads. The former `dist/telluric-onemap.html` path remains available as a compatibility copy.

For development, use **Node.js 20+**. No npm dependencies need installing:

```bash
npm run dev
```

Open **http://127.0.0.1:5173**. After changing source, rebuild the offline HTML and its worker:

```bash
npm run build
npm test
```

New generation rules apply when you regenerate; loading an old save preserves its existing history.

## Learn more

- [Countries and population](docs/POLITIES.md) · [Borders and wildness](docs/LAKE_TERRITORY_AND_LABELS.md) · [Mythological names](docs/REALM_NAMES.md)
- [Cities and terrain](docs/CITY_COHERENCE.md) · [Climate and landscapes](docs/BIOME_LANDSCAPES.md)
- [Resident stories](docs/CITY_SAGAS.md) · [Architecture gallery and GLB exports](docs/WONDER_REFINEMENT.md)
- [Houses and street fronts](docs/DOMESTIC_STREETS.md)
- [Loading performance](docs/MAP_LOADING.md) · [Map architecture](docs/CONTINUOUS_ARCHITECTURE.md)
