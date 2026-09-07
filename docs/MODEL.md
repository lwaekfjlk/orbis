# Model assumptions and deliberate simplifications

The geography/civilization model from Many Crowns is retained. It is not a new claim of scientific validation. Plates carry prescribed kinematics; continent provinces and preserved channels include design priors. Climate transport, ice storage, fjords and inland basin rules are qualitative approximations. A latitude-longitude-like rectangular grid is not a geometrically exact spherical simulation.

City refinement reads a 7.8-world-cell-wide area around a pre-existing settlement. Water masks and surface elevations are interpolated from parent data; narrow rivers follow inherited drainage segments. Local buildings, lots, walls, orchards and their names are generated additions. No archaeological, cadastral or meter-accurate fidelity is claimed.

A local mesh is compressed in height for legibility. Its footprints are tested against local refined fields, not validated against a higher-resolution physical Earth model. Neighborhood labels describe function; they do not mean real inhabitants or institutions were microsimulated. An "orchards and commons" district can contain edge houses.

The simulation supports different peoples and traditions. They are fantasy definitions and normalized population mixtures, not human stereotypes or claims that ancestry determines government. State borders, religion and ancestry remain separate arrays. The city dossier inherits the province's demographic mixtures; it does not generate individual people.

City projects are an explicit small game system:

| Project | Preconditions | Completion effect |
| --- | --- | --- |
| Granary | Existing settled place, live government, budget | Existing urban food support ×1.08; max two upgrades |
| Waterworks | Freshwater access ≥0.30 | Development +0.06, unrest −5; no new water |
| Academy | Live government and budget | Realm technology +0.045, arcana +0.05 |
| Waterfront | Existing harbor ≥0.12 or lake access ≥0.25 | Development +0.10; no new graph route |
| Festival | Live government and budget | Unrest −8; max four commissions |

Infrastructure does not currently have an independent maintenance ledger. New buildings are representative visual upgrades, not a complete physical production economy. Food improvement models lower losses and organization within a small cap. There is no dynamic water-table simulation.

Journey planning finds a least-cost path on the existing market graph and removes edges across active enemy frontiers. Land/sea connection kinds are inherited. It does not draw a meter-level route, animate a party, estimate days, add ship fleets, or simulate individual encounter outcomes.

The default street plan does not grow house-by-house when population increases. Population, state membership, unrest, public works and selected landmark forms update; core layout remains reproducible. Some buildings may appear abandoned in story interpretation, but visual dereliction is not simulated in this release.

Missing deliberately: seamless infinite LOD, interiors, dungeon geometry, citizen behavior, traffic AI, high-fidelity erosion, continuous city sprawl, complete dynasties, and character portraits.
