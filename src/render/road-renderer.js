/** Roads, bridges, quays and sea lanes on the shared atlas surface.
 *
 * The locked world renderer is extended the same way it already extends itself: by
 * wrapping AtlasRenderer.prototype after it has been defined. No file under the core
 * baseline is edited, and none of this geometry is an input to the simulation.
 *
 * Every ribbon is sampled against `this.ground`, which ContinuousMap redirects to
 * AtlasSpace.surface — the exact piecewise-linear surface the refined near terrain uses —
 * so a road stays welded to the ground at world zoom and at building zoom alike.
 */
/** An oriented box. Geometry.box is axis aligned, and a quay, cart or hull has a bearing. */
Geometry.prototype.obb = function (x, y, z, rx, ry, rz, angle, color, top = null) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const at = (u, v, h) => [x + u * c - v * s, y + h, z + u * s + v * c];
    const a = at(-rx, -rz, 0), b = at(rx, -rz, 0), q = at(rx, rz, 0), d = at(-rx, rz, 0);
    const A = at(-rx, -rz, ry), B = at(rx, -rz, ry), Q = at(rx, rz, ry), D = at(-rx, rz, ry);
    this.quad(a, A, B, b, color);
    this.quad(b, B, Q, q, color);
    this.quad(q, Q, D, d, color);
    this.quad(d, D, A, a, color);
    this.quad(A, D, Q, B, top || colorScale(color, 1.07));
};
(() => {
    // The existing LOD break: below it a town is silhouettes and map symbols, above it
    // the carved architecture appears. Figures and ground-seated roads follow it exactly
    // so nothing changes representation twice on the way in.
    // The town-detail threshold, restated: AtlasSpace is a `const` declared later in the
    // concatenated bundle, so it cannot be read at module-eval time. Cross-checked
    // against AtlasSpace.DETAIL_ZOOM in tests/continuous.test.mjs.
    AtlasRenderer.FOLK_ZOOM = 60;
    const CLASS_STYLE = {
        highway: { width: .082, color: '#cdba90', casing: '#9c8c6b' },
        road: { width: .055, color: '#c2b089', casing: null },
        trail: { width: .034, color: '#ac9d7f', casing: null }
    };
    // A cartographic ribbon has to clear the coarse jittered terrain of the world view.
    // Inside a town that same clearance is a road floating a storey above the street, so
    // the near band is rebuilt against the ground it actually sits on.
    const LIFT = .085, NEAR_LIFT = .004, DECK = .30;
    /** Sub-cell sampling. One quad per parent cell sags visibly across a refined slope. */
    const SUBDIVISIONS = 3;
    const GRID_X = MAP_X / (GW - 1), GRID_Z = MAP_Z / (GH - 1);
    /** A ribbon is NOT Geometry.line: that offsets both edges sideways at the centre
     * line's height, so on a steep cross-slope the uphill edge buries itself in the hill.
     * Every vertex here is lifted above the ground under that vertex, and the centre line
     * is a real vertex row, so the road follows the slope instead of cutting into it. */
    function ribbon(r, g, path, width, color, lift) {
        const half = width / GRID_X;
        const at = (x, y) => r.coord(x, y, r.ground(x, y) + lift);
        let px = path[0] % GW, py = path[0] / GW | 0;
        for (let k = 1; k < path.length; k++) {
            const i = path[k], fx = path[k - 1] % GW, fy = path[k - 1] / GW | 0, tx = i % GW, ty = i / GW | 0;
            for (let s = 1; s <= SUBDIVISIONS; s++) {
                const t = s / SUBDIVISIONS, bx = lerp(fx, tx, t), by = lerp(fy, ty, t);
                const dx = bx - px, dy = by - py, len = Math.hypot(dx, dy) || 1, ox = -dy / len * half, oy = dx / len * half;
                const a0 = at(px, py), b0 = at(bx, by);
                g.quad(at(px + ox, py + oy), at(bx + ox, by + oy), b0, a0, color);
                g.quad(a0, b0, at(bx - ox, by - oy), at(px - ox, py - oy), color);
                px = bx;
                py = by;
            }
        }
    }
    /** The stretch of a road that is inside the box a detailed town occupies. */
    function nearSlice(path, areas) {
        const inside = i => areas.some(p => Math.abs(i % GW - p.x) < 13 && Math.abs((i / GW | 0) - p.y) < 12);
        const runs = [];
        let run = null;
        for (let k = 0; k < path.length; k++) {
            if (inside(path[k])) {
                if (!run)
                    run = k > 0 ? [path[k - 1]] : [];
                run.push(path[k]);
            }
            else if (run) {
                run.push(path[k]);
                runs.push(run);
                run = null;
            }
        }
        if (run)
            runs.push(run);
        return runs.filter(a => a.length > 1);
    }
    /** A crossing gets a deck and two piers, so a road over a river reads as a bridge
     * rather than as a ford drawn through the water ribbon. The deck is flat and clears
     * the highest of its own corners; a bridge that follows the riverbed is not a bridge.
     * The piers are founded below the bank rather than balanced on one sampled point. */
    function bridge(r, g, i, width) {
        const x = i % GW, y = i / GW | 0, half = width * 1.35 / GRID_X;
        let ground = -Infinity;
        for (const dx of [-.55, 0, .55])
            for (const dy of [-half, 0, half])
                ground = Math.max(ground, r.ground(x + dx, y + dy));
        const top = ground + DECK, at = (dx, dy) => r.coord(x + dx, y + dy, top);
        g.quad(at(-.55, -half), at(.55, -half), at(.55, half), at(-.55, half), rgb('#a8977b'));
        const foot = [width * .55 / GRID_X, width * .95 / GRID_Z];
        for (const dx of [-.42, .42]) {
            let base = Infinity;
            for (const ex of [-foot[0], 0, foot[0]])
                for (const ey of [-foot[1], 0, foot[1]])
                    base = Math.min(base, r.ground(x + dx + ex, y + ey));
            const p = r.coord(x + dx, y, base - .02);
            g.box(p[0], p[1], p[2], width * .55, width * .95, Math.max(.05, top - p[1]), rgb('#9d9384'));
        }
    }
    AtlasRenderer.prototype.buildRoads = function () {
        const w = this.world, s = this.sim;
        if (!w || !s || typeof RoadNetwork === 'undefined')
            return;
        const net = RoadNetwork.ensure(w, s);
        if (!net)
            return;
        const key = `${net.signature}/${this.relief}/${this.continuousLayer ? 1 : 0}`;
        if (this.roadKey === key)
            return;
        this.roadKey = key;
        this.roadNetwork = net;
        const roads = new Geometry(), decks = new Geometry(), ports = new Geometry(), lanes = new Geometry();
        for (const road of net.roads) {
            const style = CLASS_STYLE[road.cls] || CLASS_STYLE.trail;
            if (style.casing)
                ribbon(this, roads, road.path, style.width * 1.42, rgb(style.casing), LIFT - .006);
            ribbon(this, roads, road.path, style.width, rgb(style.color), LIFT);
            for (const i of road.bridges)
                bridge(this, decks, i, style.width);
        }
        for (const port of net.ports)
            quay(this, ports, w, port);
        // A faint standing hint of the shipping the civilization model already computes.
        // The diplomacy layer draws its own trade lanes; this one steps aside there.
        // Dashes step along each leg by DISTANCE. A lane is now a handful of long straight
        // courses rather than a staircase of single cells, so the old every-other-node
        // pattern would have dropped most of it.
        for (const route of s.routes || [])
            for (let k = 1; k < route.path.length; k++) {
                const i = route.path[k - 1], j = route.path[k];
                const x0 = i % GW, y0 = i / GW | 0, x1 = j % GW, y1 = j / GW | 0;
                const span = Math.hypot(x1 - x0, y1 - y0), dashes = Math.max(1, Math.round(span / 2.4));
                for (let d = 0; d < dashes; d++) {
                    const u = (d + .14) / dashes, v = (d + .64) / dashes;
                    lanes.line(this.coord(lerp(x0, x1, u), lerp(y0, y1, u), .055), this.coord(lerp(x0, x1, v), lerp(y0, y1, v), .055), .032, rgb('#b7cbc8'));
                }
            }
        this.upload('roads', roads, false, .22);
        this.upload('bridges', decks, true);
        this.upload('ports', ports, true);
        this.upload('seaLanes', lanes, false, .72, .6);
        this.buildFrontierPosts();
        this.roadStats = { ...net.stats, roadTriangles: roads.data.length / 27, portTriangles: ports.data.length / 27 };
        this.buildNearRoads(true);
    };
    /** The same roads again, seated on the ground rather than above it, for the band
     * where a town's own streets are drawn. Only the stretches beside a loaded town are
     * built, so this stays a few hundred triangles. */
    /** A watch post where two realms actually meet the ground.
     * The administration graph already knows the cell pair each province boundary is crossed
     * at — the pass or ford that carries the traffic — so a post is placed on the CHEAPEST
     * crossing between each pair of neighbouring realms rather than sprinkled along the whole
     * frontier. That is one tower per relationship, standing on the way in, which is what a
     * frontier post is for. It is decoration: nothing in the model reads it.
     */
    AtlasRenderer.prototype.buildFrontierPosts = function () {
        const w = this.world, s = this.sim, g = new Geometry();
        if (!w || !s || !s.administrationGraph)
            return;
        const best = new Map();
        for (let a = 0; a < s.provinces.length; a++)
            for (const e of s.administrationGraph[a]) {
                if (e.to < a)
                    continue;
                const oa = s.provinces[a].owner, ob = s.provinces[e.to].owner;
                if (oa < 0 || ob < 0 || oa === ob)
                    continue;
                const key = oa < ob ? oa + ':' + ob : ob + ':' + oa;
                if (!best.has(key) || e.cost < best.get(key).cost)
                    best.set(key, { cost: e.cost, at: e.crossing[0] });
            }
        const stone = rgb('#a89e8c'), dark = rgb('#6d6555'), roof = rgb('#7a6a58');
        for (const { at } of best.values()) {
            const x = at % GW, y = at / GW | 0;
            if (w.height[at] <= 0)
                continue;
            const ground = this.ground(x, y), base = this.coord(x, y, ground);
            // A shoulder of rubble, a square tower, a dark opening and a cap.
            g.box(base[0], base[1], base[2], .17, .17, .05, dark);
            g.box(base[0], base[1] + .04, base[2], .11, .11, .30, stone);
            g.box(base[0], base[1] + .12, base[2] + .056, .035, .035, .07, dark);
            g.box(base[0], base[1] + .34, base[2], .155, .155, .045, roof);
            g.cone(base[0], base[1] + .385, base[2], .085, 0, .10, roof, 4);
        }
        this.frontierPosts = best.size;
        this.upload('frontierPosts', g, true);
    };
    AtlasRenderer.prototype.buildNearRoads = function (force = false) {
        const net = this.roadNetwork;
        if (!net)
            return;
        const areas = [...(this.continuousModels?.values() || [])].map(m => m.p);
        const key = `${net.signature}/${this.relief}/${areas.map(p => p.id).sort().join(',')}`;
        if (!force && this.nearRoadKey === key)
            return;
        this.nearRoadKey = key;
        const g = new Geometry();
        for (const road of areas.length ? net.roads : []) {
            const style = CLASS_STYLE[road.cls] || CLASS_STYLE.trail;
            for (const run of nearSlice(road.path, areas)) {
                ribbon(this, g, run, style.width * 1.30, rgb('#a2916f'), NEAR_LIFT);
                ribbon(this, g, run, style.width, rgb('#d3c09c'), NEAR_LIFT + .002);
            }
        }
        const wasDirty = this.dirtyShadow;
        this.upload('roadsNear', g, false, .18);
        this.dirtyShadow = wasDirty;
    };
    /** Quay, jetty, warehouse, derrick and a moored hull, on the real shoreline the
     * road network found. Nothing here creates water or moves the town. */
    function quay(r, g, w, port) {
        // Atlas units, against a whole town measuring under four of them and its
        // tallest building 1.25: at the old .26+.52w this one quay's deck ran 0.97
        // units, a quarter of a city, with a moored sail half the height of the
        // largest thing anybody had built. It is a symbol for a harbour, not a
        // harbour, and it now reads at about an eighth of a town.
        const sc = .13 + port.weight * .26, dx = port.wx - port.x, dy = port.wy - port.y, angle = Math.atan2(dy, dx);
        const along = angle + Math.PI / 2;
        const stone = rgb('#bcb49c'), timber = rgb('#8b775c'), hull = rgb('#6f6552'), sail = rgb('#e2dcc6'), roof = rgb('#7d7161');
        const shoreX = port.x + dx * .34, shoreY = port.y + dy * .34, deck = Math.max(r.ground(port.x, port.y), r.ground(port.wx, port.wy)) + .07 * sc + .05;
        const base = r.coord(shoreX, shoreY, deck);
        g.obb(base[0], base[1], base[2], .62 * sc, .10 * sc, .26 * sc, along, stone);
        // Two jetties reaching over the actual water cell.
        for (const side of [-.42, .34]) {
            const ox = Math.cos(along) * side * sc, oy = Math.sin(along) * side * sc;
            const length = (.55 + Math.abs(side)) * sc;
            const tip = r.coord(shoreX + ox + dx * length, shoreY + oy + dy * length, deck - .01);
            const root = r.coord(shoreX + ox, shoreY + oy, deck - .01);
            g.line(root, tip, .075 * sc, timber);
            for (const t of [.4, .85]) {
                const px = lerp(root[0], tip[0], t), pz = lerp(root[2], tip[2], t);
                g.box(px, base[1] - .34 * sc, pz, .022 * sc, .022 * sc, .34 * sc, timber);
            }
        }
        // One moored hull with a mast, at the longer jetty.
        const berth = r.coord(shoreX - Math.cos(along) * .42 * sc + dx * 1.05 * sc, shoreY - Math.sin(along) * .42 * sc + dy * 1.05 * sc, deck - .05 * sc);
        g.obb(berth[0], berth[1], berth[2], .30 * sc, .11 * sc, .10 * sc, along, hull);
        g.cone(berth[0], berth[1] + .11 * sc, berth[2], .014 * sc, .010 * sc, .62 * sc, timber, 4);
        g.tri([berth[0], berth[1] + .70 * sc, berth[2]], [berth[0] + .26 * sc, berth[1] + .40 * sc, berth[2]], [berth[0], berth[1] + .18 * sc, berth[2]], sail);
        // Warehouse and derrick on the landward side of the quay.
        const yard = r.coord(port.x - dx * .30, port.y - dy * .30, r.ground(port.x - dx * .30, port.y - dy * .30));
        g.obb(yard[0], yard[1], yard[2], .30 * sc, .34 * sc, .20 * sc, along, rgb('#c0b69d'));
        g.cone(yard[0], yard[1] + .34 * sc, yard[2], .34 * sc, 0, .20 * sc, roof, 4, along);
        if (port.weight > .55) {
            const mast = r.coord(shoreX + Math.cos(along) * .50 * sc, shoreY + Math.sin(along) * .50 * sc, deck);
            g.cone(mast[0], mast[1], mast[2], .020 * sc, .016 * sc, .56 * sc, timber, 4);
            g.line([mast[0], mast[1] + .56 * sc, mast[2]], [mast[0] + Math.cos(angle) * .42 * sc, mast[1] + .40 * sc, mast[2] + Math.sin(angle) * .42 * sc], .018 * sc, timber);
        }
    }
    const priorBuild = AtlasRenderer.prototype.buildCivilization;
    AtlasRenderer.prototype.buildCivilization = function () {
        priorBuild.call(this);
        this.buildRoads();
        if (typeof this.buildFolk === 'function')
            this.buildFolk(this.folkClock || 0);
    };
    const priorVisible = AtlasRenderer.prototype.visible;
    AtlasRenderer.prototype.visible = function (name) {
        if (['roads', 'roadsNear', 'bridges', 'ports', 'seaLanes', 'folk', 'caravans', 'frontierPosts'].includes(name)) {
            const civil = ['realms', 'faiths', 'peoples', 'diplomacy', 'wealth', 'magic'].includes(this.layer);
            const everyday = civil || this.layer === 'relief' || this.layer === 'settlements';
            if (!everyday)
                return false;
            // Figures and vehicles are one toggle; the fixed works are another.
            if (name === 'folk' || name === 'caravans') {
                if (this.options.folk === false)
                    return false;
                return name === 'folk' ? this.zoom >= AtlasRenderer.FOLK_ZOOM : this.zoom >= AtlasSpace.TOWN_ZOOM && this.zoom < AtlasRenderer.FOLK_ZOOM;
            }
            if (this.options.roads === false)
                return false;
            // The cartographic ribbon hands over to the ground-seated one where a town's
            // own streets appear, so the two are never drawn at the same time.
            if (name === 'roads' || name === 'bridges')
                return this.zoom < AtlasRenderer.FOLK_ZOOM;
            if (name === 'roadsNear')
                return this.zoom >= AtlasRenderer.FOLK_ZOOM;
            // The atlas symbol for a harbour gives way to the harbour. ContinuousCityLayer
            // draws the same line at 4.8, where the town's own cm:*:port waterfront
            // appears, and its answer wins; this is the same rule for a renderer with no
            // city layer installed, so the two never disagree about which one is showing.
            if (name === 'ports')
                return this.layer !== 'diplomacy' && this.zoom < 4.8;
            // tradeRoutes already draws the lanes on the diplomacy layer.
            return this.layer !== 'diplomacy';
        }
        return priorVisible.call(this, name);
    };
    // The network changes only when settlements do; a new world or history must drop it.
    const priorSetCivilization = AtlasRenderer.prototype.setCivilization;
    AtlasRenderer.prototype.setCivilization = function (sim) {
        this.roadKey = null;
        this.nearRoadKey = null;
        this.folkTravellerKey = null;
        priorSetCivilization.call(this, sim);
    };
})();
