/** Land routes between EXISTING settlements, derived from the unchanged raster.
 * This is a visualisation of connections the simulation already has; it is not a new
 * input to it. No travel cost, income, border or historical outcome depends on a road,
 * and nothing here writes to the world or to the civilization state.
 *
 * Sea and lake cells are impassable: a road is never drawn across open water. River
 * cells stay passable at a surcharge and are flagged, which is what puts a bridge there.
 */
const RoadNetwork = (() => {
    const cached = new WeakMap();
    const CLASSES = ['trail', 'road', 'highway'];
    const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const nodesOf = sim => sim.provinces.filter(p => p.settled && p.urbanPop >= 650);
    function signature(w, sim) {
        let h = 2166136261;
        for (const p of nodesOf(sim)) {
            h ^= p.i;
            h = Math.imul(h, 16777619);
        }
        return `${w.params.seed}/${sim.gridSignature}/${(h >>> 0).toString(16)}`;
    }
    const channel = (w, i) => w.channelThreshold?.[i] || w.riverThreshold;
    /** A land cell that is neither sea nor lake. Ice sheets and glaciers are refused. */
    const passable = (w, i) => w.height[i] > 0 && w.lake[i] < 0 && (w.ice?.[i] || 0) < 220;
    const isRiver = (w, i) => w.lake[i] < 0 && w.flow[i] > channel(w, i);
    /** Terrain effort, in the same spirit as the administration graph's step cost:
     * grade dominates, wetland and waterless ground are avoided, valleys are cheap. */
    function step(w, i, j) {
        const altitude = (w.height[i] + w.height[j]) * .5, grade = Math.abs(w.height[i] - w.height[j]);
        const wet = ((w.wetness?.[i] || 0) + (w.wetness?.[j] || 0)) * .5;
        const dry = Math.max(0, .30 - (w.human.fresh[i] + w.human.fresh[j]) * .5);
        const frost = Math.max(0, ((w.ice?.[j] || 0) - 25) / 260);
        const valley = w.human.river[i] > .30 && w.human.river[j] > .30 ? .84 : 1;
        const ford = isRiver(w, j) ? 2.6 + Math.min(6, w.flow[j] / channel(w, j)) * .5 : 0;
        return (.80 + Math.max(0, altitude - 600) / 4200 + grade / 620 + wet * .60 + dry * 2.4 + frost) * valley + ford;
    }
    /** ONE multi-source search over the whole raster. Every cell learns which settlement
     * is cheapest to reach and by which parent, so a road is a parent walk rather than
     * one Dijkstra per town pair. */
    function catchments(w, nodes) {
        const cost = new Float64Array(GN).fill(Infinity), owner = new Int32Array(GN).fill(-1), parent = new Int32Array(GN).fill(-1), heap = new MinHeap();
        for (let k = 0; k < nodes.length; k++) {
            const i = nodes[k].i;
            if (!passable(w, i))
                continue;
            cost[i] = 0;
            owner[i] = k;
            heap.push(i, 0);
        }
        while (heap.length) {
            const [i, d] = heap.pop();
            if (d > cost[i] + 1e-9)
                continue;
            const x = i % GW, y = i / GW | 0;
            for (const [dx, dy] of STEPS) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                    continue;
                const j = yy * GW + xx;
                if (!passable(w, j))
                    continue;
                // A diagonal may not squeeze between two impassable cells.
                if (dx && dy && (!passable(w, y * GW + xx) || !passable(w, yy * GW + x)))
                    continue;
                const v = d + step(w, i, j) * (dx && dy ? 1.41421356 : 1);
                if (v < cost[j]) {
                    cost[j] = v;
                    owner[j] = owner[i];
                    parent[j] = i;
                    heap.push(j, v);
                }
            }
        }
        return { cost, owner, parent };
    }
    const walk = (parent, from) => { const out = []; for (let i = from; i >= 0; i = parent[i]) out.push(i); return out; };
    /** Traffic is a betweenness estimate over the small road graph: how much of the
     * network's town-to-town travel would actually use this segment. Trunk roads emerge
     * from that instead of being declared by settlement size. */
    function loadEdges(nodes, edges) {
        const adjacency = nodes.map(() => []);
        edges.forEach((e, k) => { adjacency[e.a].push({ to: e.b, k, cost: e.cost }); adjacency[e.b].push({ to: e.a, k, cost: e.cost }); });
        for (const e of edges)
            e.traffic = 0;
        for (let s = 0; s < nodes.length; s++) {
            const dist = new Float64Array(nodes.length).fill(Infinity), via = new Int32Array(nodes.length).fill(-1), heap = new MinHeap();
            dist[s] = 0;
            heap.push(s, 0);
            while (heap.length) {
                const [i, d] = heap.pop();
                if (d > dist[i] + 1e-9)
                    continue;
                for (const e of adjacency[i])
                    if (d + e.cost < dist[e.to]) {
                        dist[e.to] = d + e.cost;
                        via[e.to] = e.k;
                        heap.push(e.to, d + e.cost);
                    }
            }
            for (let t = 0; t < nodes.length; t++) {
                if (t === s || !Number.isFinite(dist[t]))
                    continue;
                // Trips are weighted by both endpoints and damped by distance, the same
                // gravity shape initializeSettlements already uses to share surplus.
                const trips = Math.sqrt(nodes[s].urbanPop * nodes[t].urbanPop) * Math.exp(-dist[t] / 90);
                for (let at = t; at !== s && via[at] >= 0;) {
                    const e = edges[via[at]];
                    e.traffic += trips;
                    at = e.a === at ? e.b : e.a;
                }
            }
        }
    }
    /** A quay needs a real shoreline: a land cell of this province touching actual sea
     * or lake. Nothing is dug, and a landlocked province simply gets no port. */
    function findPorts(w, sim, nodes) {
        const ports = [];
        for (const p of nodes) {
            let best = null;
            for (const i of p.cells) {
                if (!passable(w, i))
                    continue;
                // A quay belongs to its town. Water four cells away is a different place.
                const x = i % GW, y = i / GW | 0, reach = Math.hypot(x - p.x, y - p.y);
                if (reach > 3)
                    continue;
                for (const [dx, dy] of STEPS) {
                    const xx = x + dx, yy = y + dy;
                    if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                        continue;
                    const j = yy * GW + xx, sea = w.height[j] <= 0, lake = w.lake[j] > 0;
                    if (!sea && !lake)
                        continue;
                    if (sea && w.seaIce[j] > .80)
                        continue;
                    const score = reach + (sea ? 0 : .8) + (dx && dy ? .3 : 0);
                    if (!best || score < best.score)
                        best = { score, shore: i, water: j, kind: sea ? 'sea' : 'lake', dx, dy };
                }
            }
            if (!best)
                continue;
            // Berth size follows shelter and the town it serves, so a fishing landing and
            // a great harbour do not draw the same quay.
            const weight = clamp(.20 + p.harbor * .62 + (p.siteLake || 0) * .30 + Math.sqrt(Math.max(0, p.urbanPop) / 130000) * .52, .20, 1);
            ports.push({ province: p.id, name: p.name, shore: best.shore, water: best.water, kind: best.kind,
                x: best.shore % GW, y: best.shore / GW | 0, wx: best.water % GW, wy: best.water / GW | 0,
                bearing: Math.atan2(best.dy, best.dx), urbanPop: p.urbanPop, weight });
        }
        return ports.sort((a, b) => b.urbanPop - a.urbanPop);
    }
    function build(w, sim) {
        const nodes = nodesOf(sim);
        const empty = { signature: signature(w, sim), roads: [], ports: [], byProvince: new Map(), nodes, stats: { nodes: nodes.length, roads: 0, bridges: 0, ports: 0 } };
        if (nodes.length < 2)
            return empty;
        const { cost, owner, parent } = catchments(w, nodes), best = new Map();
        // Two settlements are road neighbours where their catchments meet. The cheapest
        // meeting point is the pass, ford or shoulder the route would actually use, and a
        // pair whose cheapest meeting still costs more than 210 is not a neighbour: a
        // whole mountain range between two towns is not a road.
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const i = y * GW + x, a = owner[i];
                if (a < 0)
                    continue;
                for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
                    const xx = x + dx, yy = y + dy;
                    if (xx >= GW || yy >= GH)
                        continue;
                    const j = yy * GW + xx, b = owner[j];
                    if (b < 0 || a === b || !passable(w, j))
                        continue;
                    // The catchment search refuses to squeeze a diagonal between two
                    // impassable cells; the boundary crossing has to refuse it too, or a
                    // road threads the gap between two lakes that touch at a corner.
                    if (dx && dy && (!passable(w, y * GW + xx) || !passable(w, yy * GW + x)))
                        continue;
                    const total = cost[i] + step(w, i, j) * (dx && dy ? 1.41421356 : 1) + cost[j];
                    if (!Number.isFinite(total) || total > 210)
                        continue;
                    const key = a < b ? a + ':' + b : b + ':' + a;
                    if (!best.has(key) || total < best.get(key).cost)
                        best.set(key, { a, b, cost: total, crossing: [i, j] });
                }
            }
        const roads = [];
        for (const e of best.values()) {
            const left = walk(parent, e.crossing[0]), right = walk(parent, e.crossing[1]);
            const path = [...left.reverse(), ...right];
            if (path.length < 2 || path.some(i => !passable(w, i)))
                continue;
            const a = owner[e.crossing[0]], b = owner[e.crossing[1]];
            roads.push({ a, b, from: nodes[a].id, to: nodes[b].id, cost: e.cost, path,
                bridges: path.filter(i => isRiver(w, i)), traffic: 0, cls: 'trail' });
        }
        loadEdges(nodes, roads);
        const loads = roads.map(r => r.traffic).sort((x, y) => x - y);
        const q = f => loads.length ? loads[Math.min(loads.length - 1, Math.floor(loads.length * f))] : 0;
        const mid = q(.55), high = q(.86);
        for (const r of roads)
            r.cls = CLASSES[r.traffic >= high ? 2 : r.traffic >= mid ? 1 : 0];
        roads.sort((x, y) => y.traffic - x.traffic);
        const byProvince = new Map();
        for (const r of roads)
            for (const id of [r.from, r.to]) {
                if (!byProvince.has(id))
                    byProvince.set(id, []);
                byProvince.get(id).push(r);
            }
        const ports = findPorts(w, sim, nodes);
        return { signature: empty.signature, roads, ports, byProvince, nodes,
            stats: { nodes: nodes.length, roads: roads.length, bridges: roads.reduce((n, r) => n + r.bridges.length, 0), ports: ports.length,
                highways: roads.filter(r => r.cls === 'highway').length, cells: roads.reduce((n, r) => n + r.path.length, 0) } };
    }
    /** Cached per world object, rebuilt only when the set of settlements changes.
     * The cache lives in a WeakMap so neither the world nor the save gains a field. */
    function ensure(w, sim) {
        if (!w || !sim || !w.human)
            return null;
        const key = signature(w, sim), hit = cached.get(w);
        if (hit && hit.signature === key)
            return hit;
        const net = build(w, sim);
        cached.set(w, net);
        return net;
    }
    /** Interpolated position along a road, as a fraction of its cell path. */
    /** Cumulative length of a path, in grid cells, cached on the road itself. A sea lane is
     * straightened after it is found, so its legs are wildly unequal; parameterising by node
     * index would crawl a hull along a long leg and fling it across a short one. */
    function measure(road) {
        const path = road.path;
        if (road.acc && road.acc.length === path.length)
            return road;
        const acc = [0];
        for (let k = 1; k < path.length; k++)
            acc.push(acc[k - 1] + Math.hypot(path[k] % GW - path[k - 1] % GW, (path[k] / GW | 0) - (path[k - 1] / GW | 0)));
        road.acc = acc;
        road.len = acc[acc.length - 1] || 0;
        return road;
    }
    function length(road) { return measure(road).len; }
    function along(road, t) {
        const path = road.path;
        if (path.length < 2) {
            const i = path[0] || 0;
            return { x: i % GW, y: i / GW | 0, cell: i, heading: 0 };
        }
        const { acc, len } = measure(road), d = clamp(t) * len;
        let k = 1;
        while (k < acc.length - 1 && acc[k] < d)
            k++;
        const run = acc[k] - acc[k - 1], f = run > 1e-9 ? (d - acc[k - 1]) / run : 0;
        const i = path[k - 1], j = path[k];
        return { x: lerp(i % GW, j % GW, f), y: lerp(i / GW | 0, j / GW | 0, f), cell: f < .5 ? i : j,
            heading: Math.atan2((j / GW | 0) - (i / GW | 0), j % GW - i % GW) };
    }
    return { ensure, along, length, signature, classes: CLASSES, isRiver, passable, version: 1 };
})();
