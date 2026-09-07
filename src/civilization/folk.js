/** The world's peoples, at walking scale.
 *
 * Every figure is ONE SAMPLE drawn from the province's live `people` mixture. It is not
 * a claim about who lives in the building beside it, and no building, street or district
 * is ever labelled by ancestry. Appearance varies — height, build, colour, one silhouette
 * accent — and nothing else does: `speedOf` never reads `agent.people`, routes never
 * depend on it, and no people walks faster, further or anywhere another may not.
 *
 * Positions are a pure function of time. There is no stepped agent state to drift out of
 * sync with the simulation, and none of this feeds back into it.
 */
const Folk = (() => {
    // Indexed exactly like PEOPLES in the civilization model.
    const LOOKS = [
        { height: 1.00, build: 1.00, accent: 'none' }, // Humans
        { height: 1.11, build: .86, accent: 'cloak' }, // Sylvans
        { height: .81, build: 1.30, accent: 'broad' }, // Stonekin
        { height: 1.00, build: 1.07, accent: 'tail' }, // Beastfolk
        { height: 1.05, build: 1.01, accent: 'horns' }, // Hornkin
        { height: .93, build: .95, accent: 'crest' }, // Tideborn
        { height: 1.07, build: 1.14, accent: 'ridge' } // Drakekin
    ];
    const roll = (a, b, seed) => hash2(a | 0, b | 0, seed | 0);
    /** Draw one people from a normalised mixture. A tiny floor keeps a minority present
     * instead of rounding whole peoples out of a town that genuinely has some. */
    function pick(mixture, r) {
        if (!mixture?.length)
            return 0;
        let sum = 0;
        for (const v of mixture)
            sum += Math.max(v, .004);
        let value = clamp(r, 0, .999999) * sum;
        for (let k = 0; k < mixture.length; k++) {
            value -= Math.max(mixture[k], .004);
            if (value <= 0)
                return k;
        }
        return mixture.length - 1;
    }
    const look = k => LOOKS[k] || LOOKS[0];
    /** Deliberately blind to agent.people. Only the per-agent gait roll varies.
     *
     * The base rates below are SLOW on purpose. A "building" in a town plan is a whole
     * compound and a parent grid cell is a large piece of a continent, so anything near a
     * real walking pace reads as figures skating across the map — a resident crossing a
     * courtyard in under a second, a carter crossing a province in twenty. These are
     * tuned by what they look like against the scenery, not by any metric speed, and
     * tests/folk.test.mjs pins them that way. */
    /** Everything moves at a fraction of a body length per second. The figures and hulls are
 * scenery on a map, not a traffic simulation: read against their own size, the previous
 * speeds had a walker covering its own height every second and a ship its own hull every
 * six, which is why they scanned as hurrying rather than inhabiting. */
    function speedOf(agent) { return agent.base * (.82 + agent.gait * .38); }
    function polyline(points) {
        const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z)), acc = [0];
        for (let k = 1; k < pts.length; k++)
            acc.push(acc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
        return { pts, acc, len: acc[acc.length - 1] || 0 };
    }
    function at(route, d) {
        const { pts, acc } = route;
        if (pts.length < 2)
            return { x: pts[0]?.x || 0, z: pts[0]?.z || 0, y: pts[0]?.y || 0, heading: 0 };
        let k = 1;
        while (k < acc.length - 1 && acc[k] < d)
            k++;
        const span = acc[k] - acc[k - 1] || 1, f = clamp((d - acc[k - 1]) / span), a = pts[k - 1], b = pts[k];
        // atan2(z, x): the same convention the figure geometry and RoadNetwork.along use.
        return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), y: lerp(a.y ?? 0, b.y ?? 0, f), heading: Math.atan2(b.z - a.z, b.x - a.x) };
    }
    /** Out and back along the route. Wrapping would teleport a walker from one end of a
     * street to the other; turning round is what a resident actually does. */
    function positionAt(agent, t) {
        if (agent.kind === 'idler') {
            const a = agent.phase * 6.2831853 + t * agent.speed / Math.max(.5, agent.radius);
            return { x: agent.anchor.x + Math.cos(a) * agent.radius, z: agent.anchor.z + Math.sin(a) * agent.radius * .74,
                y: agent.anchor.y, heading: a + 1.5707963, stride: t * agent.speed, moving: true };
        }
        const route = agent.route;
        if (route.len <= 1e-6) {
            const p = at(route, 0);
            return { ...p, stride: 0, moving: false };
        }
        const cycle = 2 * route.len / agent.speed;
        let u = (t / cycle + agent.phase) % 1;
        if (u < 0)
            u += 1;
        const out = u < .5, d = (out ? u * 2 : (1 - u) * 2) * route.len, p = at(route, d);
        return { x: p.x, z: p.z, y: p.y, heading: out ? p.heading : p.heading + Math.PI, stride: d, moving: true };
    }
    /** Townsfolk on the streets this town actually has. Routes are cut from city.roads,
     * from the door-to-street connectors, and from the market square. */
    function roster(city, province, options = {}) {
        const seed = (city.seed ^ 0x5f3a) | 0, mixture = province.people, agents = [];
        const cap = options.max ?? 96;
        const count = Math.max(6, Math.min(cap, Math.round(Math.sqrt(Math.max(0, province.urbanPop)) / 5.6)));
        const streets = city.roads.filter(r => r.points.length >= 4);
        const wet = k => city.waterKind[k] === 1 || city.waterKind[k] === 2;
        const add = agent => { agents.push(agent); return agent; };
        const dress = (index, kindRoll) => {
            const people = pick(mixture, roll(index, 17, seed)), l = look(people);
            return { id: `f${index}`, people, look: l, gait: roll(index, 41, seed), base: .30,
                tone: roll(index, 73, seed), phase: roll(index, 97, seed), kindRoll };
        };
        for (let k = 0; k < count; k++) {
            const kindRoll = roll(k, 5, seed), agent = dress(k, kindRoll);
            if (streets.length && kindRoll < .74) {
                // A short contiguous run of one street, not a tour of the whole town.
                const road = streets[Math.floor(roll(k, 11, seed) * streets.length) % streets.length];
                const run = 5 + Math.floor(roll(k, 13, seed) * 12), start = Math.floor(roll(k, 19, seed) * Math.max(1, road.points.length - run));
                const slice = road.points.slice(start, Math.min(road.points.length, start + run));
                if (slice.length < 2)
                    continue;
                // Walk a shoulder rather than the centre line, but never off the paving.
                let side = (roll(k, 23, seed) - .5) * .44;
                const pts = slice.map((p, j) => {
                    const q = slice[Math.min(slice.length - 1, j + 1)], dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz) || 1;
                    return { x: p.x - dz / len * side, z: p.z + dx / len * side, y: p.y + .02 };
                });
                if (pts.some(q => wet(city.index(q.x, q.z))))
                    for (let j = 0; j < pts.length; j++) {
                        pts[j].x = slice[j].x;
                        pts[j].z = slice[j].z;
                    }
                add({ ...agent, kind: 'walker', route: polyline(pts), speed: 0 });
            }
            else if (city.connectors?.length && kindRoll < .89) {
                // Stepping out of a compound onto the street it is connected to.
                const c = city.connectors[Math.floor(roll(k, 29, seed) * city.connectors.length) % city.connectors.length];
                const ya = city.height[city.index(c.a.x, c.a.z)] + .15, yb = city.height[city.index(c.b.x, c.b.z)] + .15;
                add({ ...agent, kind: 'walker', base: .036, route: polyline([{ ...c.a, y: ya }, { x: c.b.x, z: c.b.z, y: yb }]), speed: 0 });
            }
            else {
                const a = roll(k, 31, seed) * 6.2831853, radius = 1.6 + roll(k, 37, seed) * 3.4;
                const x = city.market.x + Math.cos(a) * radius, z = city.market.z + Math.sin(a) * radius;
                const i = city.index(x, z);
                if (wet(i))
                    continue;
                add({ ...agent, kind: 'idler', base: .07, radius: .5 + roll(k, 43, seed) * .9,
                    anchor: { x, z, y: city.height[i] + .15 }, speed: 0 });
            }
        }
        for (const a of agents)
            a.speed = speedOf(a);
        return agents;
    }
    /** Travellers between towns, and hulls on the sea lanes the simulation already has.
     * They carry nothing: no cargo, tax or contact is modelled by their movement. */
    function travellers(net, sim, options = {}) {
        if (!net)
            return [];
        const perClass = { highway: 3, road: 2, trail: 1 }, agents = [], cap = options.max ?? 140;
        const density = options.density ?? 1;
        for (const road of net.roads) {
            const n = Math.round(perClass[road.cls] * density);
            for (let k = 0; k < n && agents.length < cap; k++) {
                const seed = (road.from * 7919 + road.to * 104729 + k) | 0;
                const a = sim.provinces[road.from], b = sim.provinces[road.to];
                // A traveller comes from one end or the other, so the mix on a road is
                // the mix of the places it joins.
                const home = roll(k, 3, seed) < .5 ? a : b;
                const people = pick(home.people, roll(k, 7, seed)), l = look(people);
                const kindRoll = roll(k, 53, seed);
                agents.push({ id: `t${road.from}-${road.to}-${k}`, scope: 'road', road, people, look: l,
                    kind: road.cls === 'highway' && kindRoll < .42 ? 'cart' : kindRoll < .22 ? 'rider' : 'walker',
                    gait: roll(k, 59, seed), base: .010, tone: roll(k, 61, seed), phase: roll(k, 67, seed),
                    escort: road.cls === 'highway' ? 2 : road.cls === 'road' ? 1 : 0, speed: 0 });
            }
        }
        for (const [k, route] of (sim.routes || []).entries()) {
            if (agents.length >= cap + 40 || RoadNetwork.length(route) < 6 || k % 3)
                continue;
            const seed = (route.a * 1301 + route.b * 7717) | 0, home = sim.provinces[route.a];
            agents.push({ id: `s${route.a}-${route.b}`, scope: 'sea', road: route, people: pick(home.people, roll(k, 71, seed)),
                look: look(0), kind: 'boat', gait: roll(k, 79, seed), base: .006, tone: roll(k, 83, seed),
                phase: roll(k, 89, seed), escort: 0, speed: 0 });
        }
        for (const a of agents)
            a.speed = speedOf(a);
        return agents;
    }
    /** Where a road or sea traveller is, in parent grid coordinates. */
    function travellerAt(agent, t) {
        // Distance in grid cells, not path nodes: a straightened sea lane has very unequal
        // legs, and speed has to mean the same thing on all of them.
        const span = Math.max(1e-3, RoadNetwork.length(agent.road)), cycle = 2 * span / agent.speed;
        let u = (t / cycle + agent.phase) % 1;
        if (u < 0)
            u += 1;
        const out = u < .5, f = out ? u * 2 : (1 - u) * 2, p = RoadNetwork.along(agent.road, f);
        return { ...p, heading: out ? p.heading : p.heading + Math.PI, stride: f * span, forward: out };
    }
    return { LOOKS, pick, look, speedOf, roster, travellers, positionAt, travellerAt, polyline, at, version: 1 };
})();
