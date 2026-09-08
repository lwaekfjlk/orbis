# Inland territory and city names

National frontiers now extend through inland lakes. A lake surrounded by one
country belongs to that country and leaves no hole in its highlighted territory.
Shared lakes are partitioned by shortest distance through water from their shores;
ties prefer unclaimed shores, then the lower country ID. Separate water components
remain separate even when they share a drainage basin. Ocean and water directly
open to the ocean or raster edge remain outside national territory.

`PoliticalLand.territory(world, sim).owners` is a derived display snapshot. Borders,
country highlighting and lake dossiers share it. Country ownership changes and
world replacement invalidate the cache. Physical water levels, province cells,
population, resources and reported **land** area are unchanged. In particular, a
lake is never converted into an inhabited province to draw its political boundary.

Every settled town has a complete name in the world view, including villages,
independent communities and the two high-altitude citadels. Town lettering is
smaller than country lettering. Labels move around crowded locations and retain a
fine leader and marker at the real settlement position. Camera distance, town
population and per-country quotas no longer remove names. Off-screen towns do not
produce floating names; the Names control still hides the entire label layer.
The same town labels continue into local views, avoiding duplicate streaming pins.

The default map has 104 named settlements and 22 living countries. Its physical,
settlement and political fingerprints remain `440ae5d0 / e6aee7b8 / d8ba763d`.

Generate the four real-lake review scenes with `npm run preview:politics` and open
`previews/politics/index.html` through the development server. The optional
`npm run test:lake-labels-browser` verifies the production DOM at desktop and narrow
sizes, thematic layers, the Names control, local zoom transitions and lake cards.
It accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `TELLURIC_LABEL_OUTPUT` for an
external browser runtime and screenshot destination.
