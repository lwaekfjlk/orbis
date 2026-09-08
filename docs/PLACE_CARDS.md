# Place cards

City cards offer **Zoom**, **Story**, and **Details**. Zoom approaches the town on the same map. Story approaches it and opens its narrator's account. Details opens the city's current overview without moving the camera.

The city card and both city dossiers show town residents, district residents, and stacked bars for peoples and faiths. These mixtures describe the entire district: the simulation does not store a separate urban census. A narrator is one resident, not the statistical majority.

Country introductions show residents, towns, districts, share of world land, peoples, faiths, food supply, and stability. Population and mixtures are computed from districts currently owned by that country, rather than cached country totals. The faith bar describes residents' beliefs, separately from the state tradition described in the introduction.

`PlaceVitals` reads the existing simulation without changing it. Population weights the composition bars; missing shares stay unrecorded, and missing population stays unknown. The food gauge marks demand at 100% and displays up to 200%; its numerical label retains larger surpluses. All bars have text legends and accessible descriptions.

Selection cards scroll within the screen on small devices. Open overviews and stories retain their selected place while the simulation updates. An explicit drawer context prevents a previously selected town or ruin from replacing government details during refresh.

Validation: `npm run test:cards`, then `npm run build` and `npm run test:cards-browser`. The browser check uses the offline Orbis build and verifies actual values, ownership changes, the three actions, and 430px / 360px layouts. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to use an installed browser runtime; `ORBIS_CARDS_OUTPUT` controls its screenshots and report directory.
