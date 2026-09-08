/** Drawing the world's peoples.
 *
 * Articulated figures use two detail levels, with a bounded number of close views.
 * Two meshes are produced: `caravans`, map-symbol traffic on the regional view, and
 * `folk`, true-scale residents and travellers once a town's architecture has resolved.
 *
 * The figure mesh is uploaded with shadow=false and restores `dirtyShadow` afterwards.
 * Both AtlasRenderer.upload and the software rasterizer set that flag unconditionally,
 * and without this a walking crowd would re-render the shadow map every frame.
 */
(() => {
    // A figure is 1.5 town-plan units tall. Buildings in the same plan are 1.5 to 4, so a
    // person reads as a person beside them. Everything here is the atlas's own exaggerated
    // scale; none of it is metric.
    //
    // SYMBOL is the regional-zoom marker height. It has to stay near one building, because
    // a town's whole footprint is only about 3.7 atlas units: a marker sized like a town
    // marker makes a single cart look bigger than the place it is travelling to.
    //
    // SHIP scales the sea-lane hull against the boats moored at the town's own quay, which
    // are 2 to 4 town-plan units long. It is the INPUT size; `vehicle` turns that into a
    // hull 1.1x as long, so the two have to be read together — halving one and the other
    // separately is how a ship ends up smaller than the dinghies tied up beside it.
    // SHIP was reconciled against the moored dinghies at a town's own quay, which made the
    // sea-lane hull match them — but a vessel three cells out on open water is read against
    // the coastline behind it, not against a jetty, and at that reading it was far too large.
    // These three are ATLAS-unit sizes reconciled against the town model, so they move
    // with it. The town footprint quoted above was ~3.7 atlas units when it mapped onto
    // its whole sampling window; it is now AtlasSpace.CITY_FOOTPRINT of that. Leaving
    // them fixed made a sea-going hull 6.3x the dinghies at the town's own quay and put
    // people in the streets three times over-size.
    // Written as a literal, not read from AtlasSpace: that is a `const` declared later
    // in the concatenated bundle, so touching it here is a temporal-dead-zone throw.
    // tests/continuous.test.mjs asserts this stays equal to AtlasSpace.CITY_FOOTPRINT.
    const F = .30;
    // F applies ONCE. NOMINAL and SYMBOL are absolute atlas sizes; SHIP and HULL are
    // multipliers on top of NOMINAL, so scaling them too shrank a hull elevenfold and
    // left it smaller than the dinghies it was reconciled against.
    const LOCAL_HEIGHT = 1.5, NOMINAL = .043 * F, SYMBOL = .10 * F, SHIP = 1.6, HULL = 1.1;
    AtlasRenderer.FOLK_SCALE = { near: NOMINAL, symbol: SYMBOL, ship: SHIP, hullLength: HULL };
    const GRID_X = MAP_X / (GW - 1), GRID_Z = MAP_Z / (GH - 1);
    const DETAIL = AtlasRenderer.FOLK_DETAIL = { fullPixels: 18, maxDetailed: 48, fullTriangles: 240, simpleTriangles: 70, vehicleTriangles: 40 };
    const SKIN = [['#8d583d','#edc39c'],['#ae9871','#e7d5ad'],['#8c6f5d','#c9aa89'],['#77533c','#bf8e53'],['#855d60','#c69278'],['#477f83','#9bc2b0'],['#64704d','#adb36d']].map(pair => pair.map(rgb));
    const CLOTH = ['#314d4b','#70523c','#516176','#704b54'].map(rgb);
    const skinOf = (people, tone) => colorMix(...(SKIN[people] || SKIN[0]), clamp(tone));
    const clothOf = (people, tone) => colorMix(rgb((PEOPLES[people] || PEOPLES[0]).color), CLOTH[Math.min(3, Math.floor(clamp(tone) * 4))], .48);
    AtlasRenderer.folkAppearance = (people, tone = .5) => ({ cloth: clothOf(people, tone), skin: skinOf(people, tone) });
    // Phase measures distance travelled in body lengths. Roads use atlas-grid
    // distances; applying the town multiplier to them made legs almost motionless.
    function strideOf(agent, q, road = false) {
        const distance = road ? q.stride * Math.sqrt(GRID_X * GRID_Z) / NOMINAL : q.stride / LOCAL_HEIGHT;
        return distance * Math.PI * 2 / 1.1 + agent.phase * Math.PI * 2;
    }
    function figure(r, g, detail, x, y, z, height, girth, angle, cloth, skin, accent, stride, moving = true, close = true) {
        const pixels = height * r.height / (2 * r.halfH);
        const full = close && pixels >= DETAIL.fullPixels && detail.full < detail.limit;
        if (full) detail.full++; else detail.simple++;
        g.figure(x, y, z, height, girth, angle, cloth, skin, accent, stride, moving, full ? 'full' : 'simple');
    }
    /** Cart, rider or hull, at whatever scale the caller is drawing in. */
    function vehicle(g, kind, x, y, z, size, angle, tone) {
        const timber = colorScale(rgb('#8d7a5c'), .9 + tone * .2);
        if (kind === 'cart') {
            g.obb(x, y + size * .30, z, size * .52, size * .34, size * .26, angle, timber);
            for (const side of [-1, 1])
                g.cone(x - Math.cos(angle) * size * .30 - Math.sin(angle) * side * size * .28, y, z - Math.sin(angle) * size * .30 + Math.cos(angle) * side * size * .28, size * .26, size * .26, size * .08, colorScale(timber, .8), 6, angle);
            g.line([x, y + size * .34, z], [x + Math.cos(angle) * size * .95, y + size * .30, z + Math.sin(angle) * size * .95], size * .05, timber);
        }
        else if (kind === 'rider')
            g.obb(x, y + size * .34, z, size * .40, size * .26, size * .17, angle, colorScale(timber, 1.05));
        else if (kind === 'boat') {
            // A hull and a cart come through here at the same `size`, so their factors
            // have to be comparable. They were not: the hull ran 2x the cart's length
            // and its sail tip 5.4x the cart's height, which put a single ship on a sea
            // lane at 0.72 atlas units — a fifth of the width of an entire town, and
            // half the height of the tallest building in it.
            // The length factor is HULL, published on AtlasRenderer.FOLK_SCALE, so the
            // test that compares a sea hull to the town's own moorings measures this
            // geometry rather than a copy of the number.
            g.obb(x, y, z, size * HULL * .5, size * .20, size * .20, angle, rgb('#6d6350'));
            g.cone(x, y + size * .20, z, size * .04, size * .028, size * .62, timber, 4);
            g.tri([x, y + size * .78, z], [x + Math.cos(angle) * size * .34, y + size * .46, z + Math.sin(angle) * size * .34], [x, y + size * .26, z], rgb('#e4dcc4'));
        }
    }
    /** Whichever agents are worth drawing: nearest to where the camera is looking, up to
     * the budget. A crowd off screen costs nothing. */
    function nearest(items, cx, cy, radius, budget) {
        const kept = [];
        if (budget <= 0)
            return kept;
        for (const it of items) {
            const d = Math.hypot(it.gx - cx, it.gy - cy);
            if (d <= radius)
                kept.push({ it, d });
        }
        kept.sort((a, b) => a.d - b.d);
        return kept.slice(0, budget).map(k => k.it);
    }
    AtlasRenderer.prototype.buildFolk = function (t = 0) {
        if (!this.world || !this.sim || !this.width || typeof Folk === 'undefined')
            return;
        this.folkClock = t;
        const folk = new Geometry(), caravans = new Geometry();
        const budget = this.folkBudget ?? (this.software ? 45 : 220);
        let residents = 0, travelling = 0;
        const detail = { full: 0, simple: 0, limit: this.software ? 12 : DETAIL.maxDetailed };
        // The overview never draws travellers. Keep both uploads below so returning
        // from a town also clears its old figures; entering the town band rebuilds them.
        if (this.options.folk !== false && this.zoom >= AtlasSpace.TOWN_ZOOM) {
            this.updateCamera();
            const centre = AtlasSpace.grid(this.target[0], this.target[2]);
            const radius = Math.max(this.halfW, this.halfH) / AtlasSpace.X + 3;
            const close = this.zoom >= AtlasRenderer.FOLK_ZOOM;
            if (close)
                residents = drawResidents(this, folk, t, centre, radius, budget, detail);
            travelling = drawTravellers(this, close ? folk : caravans, t, centre, radius, close, Math.max(12, budget - residents), detail);
        }
        // Keep the shadow map: a walking crowd must not force a shadow pass every frame.
        const wasDirty = this.dirtyShadow;
        this.upload('folk', folk, false, .10);
        this.upload('caravans', caravans, false, .10);
        this.dirtyShadow = wasDirty;
        this.folkStats = { residents, travelling, budget, fullFigures: detail.full, simpleFigures: detail.simple, triangles: (folk.data.length + caravans.data.length) / 27, clock: +t.toFixed(2) };
    };
    /** Townsfolk belong to a loaded town model, so they share its exact georeference. */
    function drawResidents(r, g, t, centre, radius, budget, detail) {
        const models = [...(r.continuousModels?.values() || [])];
        if (!models.length)
            return 0;
        let drawn = 0;
        for (const model of models) {
            if (Math.hypot(model.p.x - centre[0], model.p.y - centre[1]) > radius + 10)
                continue;
            if (!model.folk || model.folkKey !== model.key) {
                model.folk = Folk.roster(model.city, model.p, { max: 96 });
                model.folkKey = model.key;
            }
            const frame = model.frame, height = LOCAL_HEIGHT * frame.scale;
            const placed = model.folk.map(agent => {
                const q = Folk.positionAt(agent, t), v = frame.vertex(q.x, q.y, q.z, null), a = frame.at(q.x, q.z);
                return { agent, q, v, gx: a[0], gy: a[1] };
            });
            for (const { agent, q, v } of nearest(placed, centre[0], centre[1], radius, budget - drawn)) {
                const l = agent.look, cloth = clothOf(agent.people, agent.tone);
                figure(r, g, detail, v[0], v[1], v[2], height * l.height, height * .30 * l.build, q.heading,
                    cloth, skinOf(agent.people, agent.tone), l.accent, strideOf(agent, q), q.moving);
                drawn++;
            }
            if (drawn >= budget)
                break;
        }
        return drawn;
    }
    /** Traffic on the roads and lanes. At regional zoom these are map symbols on the same
     * footing as the town markers; close in they become the same figures as the residents. */
    function drawTravellers(r, g, t, centre, radius, close, budget, detail) {
        const net = r.roadNetwork;
        if (!net)
            return 0;
        if (r.folkTravellerKey !== net.signature) {
            r.folkTravellers = Folk.travellers(net, r.sim, { density: r.software ? .5 : 1 });
            r.folkTravellerKey = net.signature;
        }
        const placed = (r.folkTravellers || []).map(agent => {
            const q = Folk.travellerAt(agent, t);
            return { agent, q, gx: q.x, gy: q.y };
        });
        const scale = close ? NOMINAL : SYMBOL;
        let drawn = 0;
        for (const { agent, q } of nearest(placed, centre[0], centre[1], radius, budget)) {
            const p = r.coord(q.x, q.y, agent.scope === 'sea' ? r.ground(q.x, q.y) : r.ground(q.x, q.y) + (close ? .006 : .09));
            const heading = q.heading;
            if (agent.kind === 'boat') {
                vehicle(g, 'boat', p[0], p[1], p[2], scale * (close ? SHIP : 1.15), heading, agent.tone);
                drawn++;
                continue;
            }
            if (agent.kind !== 'walker')
                vehicle(g, agent.kind, p[0], p[1], p[2], scale * 1.15, heading, agent.tone);
            const l = agent.look, cloth = clothOf(agent.people, agent.tone), lift = close ? .006 : .09;
            // A convoy is a few figures in file, not one traveller standing for a nation.
            // Each one is seated on the ground under itself: on a pass, a file that shares
            // the leader's height walks into the hillside behind him.
            for (let k = 0; k <= agent.escort; k++) {
                const back = -k * scale * .85, side = (k % 2 ? .5 : -.4) * scale * (k ? 1 : 0);
                const ox = Math.cos(heading) * back - Math.sin(heading) * side, oz = Math.sin(heading) * back + Math.cos(heading) * side;
                const gx = q.x + ox / GRID_X, gy = q.y + oz / GRID_Z;
                figure(r, g, detail, p[0] + ox, k ? r.ground(gx, gy) + lift : p[1], p[2] + oz, scale * l.height, scale * .30 * l.build, heading,
                    cloth, skinOf(agent.people, agent.tone), l.accent, strideOf(agent, q, true) + k, true, close);
            }
            drawn++;
        }
        return drawn;
    }
})();
