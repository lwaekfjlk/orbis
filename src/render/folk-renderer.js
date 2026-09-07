/** Drawing the world's peoples.
 *
 * A figure is about thirty triangles, rebuilt every frame for whatever is on screen.
 * Two meshes are produced: `caravans`, map-symbol traffic on the regional view, and
 * `folk`, true-scale residents and travellers once a town's architecture has resolved.
 *
 * The figure mesh is uploaded with shadow=false and restores `dirtyShadow` afterwards.
 * Both AtlasRenderer.upload and the software rasterizer set that flag unconditionally,
 * and without this a walking crowd would re-render the shadow map every frame.
 */
/** Torso, head, two legs and one silhouette accent. The accent is the only part that
 * depends on which people a figure was drawn from; nothing else about it does.
 * `at` takes offsets from the feet — forward, sideways, up — never absolute heights. */
Geometry.prototype.figure = function (x, y, z, height, girth, angle, cloth, skin, accent, stride, legs = true) {
    const hip = height * .46, shoulder = height * .82, c = Math.cos(angle), s = Math.sin(angle);
    const at = (d, side, h) => [x + c * d - s * side, y + h, z + s * d + c * side];
    if (legs) {
        const swing = Math.sin(stride) * height * .17;
        for (const [side, phase] of [[-girth * .30, swing], [girth * .30, -swing]]) {
            const foot = at(phase, side, 0);
            this.cone(foot[0], foot[1], foot[2], girth * .17, girth * .13, hip, colorScale(cloth, .78), 3, angle);
        }
    }
    this.cone(x, y + hip, z, girth * .40, girth * .46, shoulder - hip, cloth, 4, angle + .78);
    const head = shoulder + height * .04, crown = height;
    this.cone(x, y + head, z, girth * .30, girth * .17, height * .16, skin, 4, angle + .40);
    if (accent === 'horns')
        for (const side of [-1, 1])
            this.tri(at(0, side * girth * .26, head + height * .07), at(-girth * .10, side * girth * .46, crown + height * .10), at(girth * .10, side * girth * .26, head + height * .07), skin);
    else if (accent === 'crest')
        this.tri(at(-girth * .22, 0, head + height * .04), at(girth * .10, 0, crown + height * .13), at(girth * .20, 0, head + height * .04), colorScale(cloth, 1.22));
    else if (accent === 'ridge')
        for (const t of [0, 1]) {
            const base = shoulder - t * height * .20;
            this.tri(at(-girth * .40, 0, base), at(-girth * .62, 0, base + height * .11), at(-girth * .40, 0, base - height * .10), colorScale(cloth, .74));
        }
    else if (accent === 'tail')
        this.quad(at(-girth * .34, -girth * .07, hip * 1.02), at(-girth * .90, -girth * .07, hip * .58), at(-girth * .90, girth * .07, hip * .58), at(-girth * .34, girth * .07, hip * 1.02), colorScale(cloth, .82));
    else if (accent === 'cloak')
        this.quad(at(-girth * .34, -girth * .44, shoulder), at(-girth * .34, girth * .44, shoulder), at(-girth * .16, girth * .34, hip * .32), at(-girth * .16, -girth * .34, hip * .32), colorScale(cloth, .88));
    else if (accent === 'broad')
        this.cone(x, y + shoulder - height * .10, z, girth * .52, girth * .40, height * .12, colorScale(cloth, .92), 4, angle + .78);
};
(() => {
    // A figure is 1.5 town-plan units tall. Buildings in the same plan are 1.5 to 4, so a
    // person reads as a person beside them. Everything here is the atlas's own exaggerated
    // scale; none of it is metric.
    const LOCAL_HEIGHT = 1.5, NOMINAL = .043;
    const SYMBOL = .30;
    const GRID_X = MAP_X / (GW - 1), GRID_Z = MAP_Z / (GH - 1);
    const skinOf = (cloth, tone) => colorMix(cloth, rgb('#e7d3b6'), .34 + tone * .22);
    const clothOf = (people, tone) => colorScale(rgb(PEOPLES[people].color), .84 + tone * .34);
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
            g.obb(x, y, z, size * .55, size * .20, size * .20, angle, rgb('#6d6350'));
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
        if (this.options.folk !== false) {
            this.updateCamera();
            const centre = AtlasSpace.grid(this.target[0], this.target[2]);
            const radius = Math.max(this.halfW, this.halfH) / AtlasSpace.X + 3;
            const close = this.zoom >= AtlasRenderer.FOLK_ZOOM;
            if (close)
                residents = drawResidents(this, folk, t, centre, radius, budget);
            travelling = drawTravellers(this, close ? folk : caravans, t, centre, radius, close, Math.max(12, budget - residents));
        }
        // Keep the shadow map: a walking crowd must not force a shadow pass every frame.
        const wasDirty = this.dirtyShadow;
        this.upload('folk', folk, false, .10);
        this.upload('caravans', caravans, false, .10);
        this.dirtyShadow = wasDirty;
        this.folkStats = { residents, travelling, budget, triangles: (folk.data.length + caravans.data.length) / 27, clock: +t.toFixed(2) };
    };
    /** Townsfolk belong to a loaded town model, so they share its exact georeference. */
    function drawResidents(r, g, t, centre, radius, budget) {
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
                const l = agent.look, cloth = clothOf(agent.people, agent.tone), bob = Math.sin(q.stride * 3.1) * height * .022;
                g.figure(v[0], v[1] + bob, v[2], height * l.height, height * .30 * l.build, q.heading,
                    cloth, skinOf(cloth, agent.tone), l.accent, q.stride * 3.1);
                drawn++;
            }
            if (drawn >= budget)
                break;
        }
        return drawn;
    }
    /** Traffic on the roads and lanes. At regional zoom these are map symbols on the same
     * footing as the town markers; close in they become the same figures as the residents. */
    function drawTravellers(r, g, t, centre, radius, close, budget) {
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
                vehicle(g, 'boat', p[0], p[1], p[2], scale * (close ? 6 : 1.15), heading, agent.tone);
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
                g.figure(p[0] + ox, k ? r.ground(gx, gy) + lift : p[1], p[2] + oz, scale * l.height, scale * .30 * l.build, heading,
                    cloth, skinOf(cloth, agent.tone), l.accent, q.stride * 2.6 + k, close);
            }
            drawn++;
        }
        return drawn;
    }
})();
