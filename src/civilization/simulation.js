/* TELLURIC IV / Civilization model.
 * A reproducible, rule-based fantasy sandbox, not a model calibrated to history.
 * Peoples, faiths, governments and borders are independent state variables.
 * No species has hard-coded intelligence, moral alignment, or combat superiority.
 */
const PEOPLES = [
    { name: 'Humans', color: '#bc9062' }, { name: 'Sylvans', color: '#538a62' },
    { name: 'Stonekin', color: '#998675' }, { name: 'Beastfolk', color: '#b57742' },
    { name: 'Hornkin', color: '#916ea5' }, { name: 'Tideborn', color: '#4c9bac' },
    { name: 'Drakekin', color: '#b76253' }
];
const FAITHS = [
    { name: 'Dawn Communion', color: '#d2ac52', tenet: 'Sanctuaries, mercy and the public covenant.' },
    { name: 'Veil of Stars', color: '#987abc', tenet: 'Knowledge is sacred; revelation must be questioned.' },
    { name: 'Rootbound Covenant', color: '#64956e', tenet: 'Reciprocity with ancestors, forests and waters.' },
    { name: 'Ancestral Forge', color: '#b17852', tenet: 'Craft, remembrance and oaths freely given.' },
    { name: 'Tideway', color: '#568faa', tenet: 'Hospitality, navigation and the exchange of gifts.' },
    { name: 'Manyfold Tradition', color: '#a99d8a', tenet: 'Local rites coexist without a single central authority.' }
];
const GOVERNMENTS = ['Feudal monarchy', 'Temple monarchy', 'Magocracy', 'Clan confederacy', 'Merchant republic', 'Mountain federation', 'Civic republic', 'City-state league'];
const REALM_COLORS = ['#ccaa62', '#89b2c8', '#a989c0', '#72996d', '#b48168', '#8f9ca9', '#58aeb0', '#d39a63', '#819f86', '#91a7c4', '#7daac6', '#c2b271', '#a888a1', '#6b9e97', '#b97d73', '#88a18f', '#b4a3c4', '#bfc184', '#9cbbc2', '#ceae99', '#799397', '#c38b90', '#ad9680', '#97ad68', '#789bb5', '#b799b7', '#b2a469', '#6ca38b'];
const cPair = (a, b) => a < b ? a + ':' + b : b + ':' + a;
/** Whether a straight course between two cells stays on navigable water throughout. */
function cSeaClear(w, i, j) {
    const x0 = i % GW, y0 = i / GW | 0, x1 = j % GW, y1 = j / GW | 0;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let k = 1; k < steps; k++) {
        const x = Math.round(x0 + (x1 - x0) * k / steps), y = Math.round(y0 + (y1 - y0) * k / steps), c = y * GW + x;
        if (w.height[c] > 0 || w.seaIce[c] >= .88)
            return false;
    }
    return true;
}
/** A sea lane is a course, not a staircase. The flood fill that finds it may only step
 * N/S/E/W, so its path zigzags across open water where a ship would simply hold a bearing.
 * Keep only the corners a vessel would actually turn at: run forward while the straight
 * line to the next node still clears land and pack ice. Open ocean collapses to one leg. */
function cStraightenSea(w, path) {
    if (path.length < 3)
        return path;
    const out = [path[0]];
    let i = 0;
    while (i < path.length - 1) {
        let j = i + 1;
        while (j + 1 < path.length && cSeaClear(w, path[i], path[j + 1]))
            j++;
        out.push(path[j]);
        i = j;
    }
    return out;
}
const cDominant = a => a.indexOf(Math.max(...a));
function cNormalize(a) { const sum = a.reduce((s, v) => s + Math.max(v, 0), 0); return a.map(v => sum ? Math.max(v, 0) / sum : 1 / a.length); }
/* PLACE NAMES. Two rolls are drawn when a district is created (so the random stream is
 * independent of naming), but the words are chosen later, once terrain averages exist.
 * The suffix states what the site IS; the prefix carries local material, cover or climate. */
const NAME_STEMS = {
    common: ['Ash', 'Bright', 'Grey', 'White', 'Blue', 'Green', 'Black', 'Red', 'Rose', 'Amber', 'Clear', 'Wild', 'Long', 'High', 'Nether', 'Hart', 'Hawk', 'Lark', 'Wren', 'Crow', 'Raven', 'Rook', 'Fox', 'Wolf', 'Storm', 'Swift', 'Sharp', 'Quill', 'Bower', 'Vale'],
    coast: ['Gull', 'Salt', 'Tern', 'Cobble', 'Anchor', 'Kelp', 'Herring', 'Sail', 'Foam', 'Shell'],
    lake: ['Reed', 'Heron', 'Otter', 'Still', 'Glass', 'Swan', 'Rush', 'Sedge'],
    river: ['Mill', 'Willow', 'Alder', 'Trout', 'Osier', 'Silt', 'Kingfisher', 'Weir'],
    upland: ['Stone', 'Slate', 'Flint', 'Granite', 'Eagle', 'Cloud', 'Cairn', 'Scree', 'Wind', 'Crag'],
    forest: ['Oak', 'Birch', 'Elm', 'Hazel', 'Holly', 'Pine', 'Yew', 'Larch', 'Rowan', 'Fern', 'Moss', 'Thorn', 'Bramble', 'Spruce'],
    marsh: ['Mist', 'Bog', 'Peat', 'Snipe', 'Fen', 'Cotton', 'Marl'],
    arid: ['Sun', 'Dust', 'Ochre', 'Sand', 'Bone', 'Tamarisk', 'Gold', 'Scorch'],
    cold: ['Frost', 'Winter', 'Rime', 'Snow', 'Pale', 'North', 'Hoar', 'Cinder'],
    ore: ['Iron', 'Copper', 'Tin', 'Forge', 'Ember', 'Anvil', 'Coal'],
    arcane: ['Star', 'Moon', 'Silver', 'Dawn', 'Vesper', 'Ivory', 'Lantern', 'Ember']
};
const NAME_TAILS = {
    common: ['field', 'meadow', 'dale', 'stead', 'croft', 'garth', 'fold', 'ley', 'thorpe', 'bury', 'combe', 'down', 'hall', 'gate', 'watch', 'reach', 'cross', 'close', 'march', 'wick', 'bourne'],
    coast: ['port', 'quay', 'wharf', 'strand', 'shore', 'ness', 'haven', 'landing', 'cliff'],
    lake: ['mere', 'pool', 'water', 'tarn', 'shallows', 'bank'],
    river: ['ford', 'bridge', 'beck', 'brook', 'mill', 'fall', 'run', 'weir'],
    upland: ['crest', 'tor', 'cairn', 'hold', 'spire', 'keep', 'scar', 'ridge', 'rise', 'mount'],
    forest: ['grove', 'shaw', 'hurst', 'wold', 'holt', 'chase', 'dell', 'hollow', 'glen'],
    marsh: ['marsh', 'fen', 'mire', 'moss', 'carr', 'moor'],
    arid: ['well', 'cistern', 'drift', 'waystead', 'burgh'],
    cold: ['hold', 'watch', 'shelter', 'barrow', 'keep'],
    ore: ['forge', 'delve', 'pit', 'minster', 'yard'],
    arcane: ['spire', 'minster', 'close', 'sanctuary', 'vigil']
};
const NAME_QUALIFIERS = ['Upper', 'Lower', 'Little', 'Great', 'Old', 'New', 'North', 'South', 'East', 'West', 'Far', 'Inner'];
/* Which pools a district draws from. A site can be several things at once (a river mouth on a
 * cold coast); every matching pool contributes, so the vocabulary widens with the geography. */
function cNamePools(p) {
    const keys = ['common'];
    if (p.harbor > .35 || p.coast > .30) keys.push('coast');
    if (p.lake > .12 || p.siteLake > 0) keys.push('lake');
    if (p.river > .35) keys.push('river');
    if (p.altitude > 1100) keys.push('upland');
    if (p.forest > .40) keys.push('forest');
    if (p.wet > .28) keys.push('marsh');
    if (p.aridity > .58) keys.push('arid');
    if (p.temp < 2) keys.push('cold');
    if (p.ore > .55) keys.push('ore');
    if (p.mana > .55) keys.push('arcane');
    return keys;
}
function cName(p) {
    const keys = cNamePools(p), terrain = keys.filter(k => k !== 'common');
    // Terrain pools are weighted above the common pool, so a harbour district usually reads
    // as one. Weighting only biases the draw; the set of possible names is unchanged.
    const pool = (table) => [...table.common, ...terrain.flatMap(k => [table[k], table[k], table[k]]).flat()];
    const stems = pool(NAME_STEMS), tails = pool(NAME_TAILS);
    const stem = stems[Math.floor(p.nameRoll[0] * stems.length)], tail = tails[Math.floor(p.nameRoll[1] * tails.length)];
    // 'Stonestone' and 'Fenfen' read as bugs; step to the neighbouring tail instead.
    return stem + (stem.toLowerCase() === tail ? tails[(tails.indexOf(tail) + 1) % tails.length] : tail);
}
/* Collision fallback: qualify the place ('Lower Ashford') before ever numbering it. */
function cNameDistricts(sim) {
    const taken = new Set();
    for (const p of sim.provinces) {
        const base = cName(p);
        let name = base;
        if (taken.has(name))
            for (let k = 0; k < NAME_QUALIFIERS.length && taken.has(name); k++)
                name = NAME_QUALIFIERS[(Math.floor(p.nameRoll[0] * NAME_QUALIFIERS.length) + k) % NAME_QUALIFIERS.length] + ' ' + base;
        for (let k = 2; taken.has(name); k++)
            name = base + ' ' + k;
        taken.add(name);
        p.name = name;
    }
}
function habitable(w, i) { return w.height[i] > 0 && w.lake[i] < 0 && w.ice[i] < 180 && w.temp[i] > -13; }
/* GEOGRAPHY-FIRST INITIALIZATION.
 * Physical fields are read-only inputs. Districts are accounting units, not towns.
 * Carrying capacity -> rural population -> surplus-sharing market nodes -> polities.
 * All coefficients are fantasy-world design assumptions, not empirical estimates.
 */
function physicalFingerprint(w) {
    let h = 2166136261;
    for (const key of ['height', 'biome', 'rain', 'temp', 'lake', 'flow', 'ice', 'plate']) {
        const a = w[key];
        if (!a)
            continue;
        const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        for (let k = 0; k < bytes.length; k++) {
            h ^= bytes[k];
            h = Math.imul(h, 16777619);
        }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}
function deriveHumanGeography(w) {
    const arr = () => new Float32Array(GN), g = { fresh: arr(), river: arr(), lake: arr(), salt: arr(), harbor: arr(), farm: arr(), food: arr(), waterCapacity: arr(), capacity: arr(), slope: arr(), hazard: arr(), potential: arr(), mana: arr(), ore: arr(), rainwater: arr(), access: arr() };
    const dist = new Float64Array(GN).fill(Infinity), heap = new MinHeap();
    // Drinking-water sources: streams and nonsaline lakes. Neither sea nor salt lake qualifies.
    for (let i = 0; i < GN; i++) {
        if (w.height[i] <= 0)
            continue;
        let strength = 0;
        const b = w.basins[w.lakeId[i]];
        if (w.lake[i] > 0 && !b?.saline) {
            strength = 1;
            g.lake[i] = 1;
        }
        if (w.lake[i] < 0 && w.flow[i] > (w.channelThreshold?.[i] || w.riverThreshold) && w.ice[i] < 25) {
            strength = Math.max(strength, clamp(.48 + .20 * Math.log1p(w.flow[i] / Math.max(.1, w.channelThreshold?.[i] || w.riverThreshold)), 0, 1));
            g.river[i] = strength;
        }
        if (strength) {
            dist[i] = -Math.log(strength);
            heap.push(i, dist[i]);
        }
    }
    while (heap.length) {
        const [i, d] = heap.pop();
        if (d > dist[i] + 1e-8 || d > 5)
            continue;
        const x = i % GW, y = i / GW | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                continue;
            const j = yy * GW + xx;
            if (w.height[j] <= 0)
                continue;
            const v = d + .32 + Math.max(0, w.height[j] - w.height[i]) / 900;
            if (v < dist[j]) {
                dist[j] = v;
                heap.push(j, v);
            }
        }
    }
    for (let y = 1; y < GH - 1; y++)
        for (let x = 1; x < GW - 1; x++) {
            const i = y * GW + x;
            if (w.height[i] <= 0 || w.lake[i] > 0 || !habitable(w, i))
                continue;
            const t = w.temp[i], thermal = clamp((t + 4) / 18) * clamp((39 - t) / 16), snow = clamp(1 - w.ice[i] / 110);
            const slope = (Math.abs(w.height[i + 1] - w.height[i - 1]) + Math.abs(w.height[i + GW] - w.height[i - GW])) / 2;
            g.slope[i] = slope;
            // Rain collection is a limited local supply; no unlimited groundwater or magical oasis.
            const rainwater = clamp(w.rain[i] / .70) * .60;
            g.rainwater[i] = rainwater;
            g.fresh[i] = Math.max(Math.exp(-dist[i]), rainwater) * snow;
            let lakes = 0, salt = 0, coast = 0;
            for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++) {
                    const xx = x + dx, yy = y + dy;
                    if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                        continue;
                    const j = yy * GW + xx, d = Math.hypot(dx, dy);
                    if (d > 2.5)
                        continue;
                    if (w.lake[j] > 0) {
                        if (w.basins[w.lakeId[j]]?.saline)
                            salt = Math.max(salt, Math.exp(-d * .42));
                        else
                            lakes = Math.max(lakes, Math.exp(-d * .42));
                    }
                    if (w.height[j] <= 0 && w.seaIce[j] < .65)
                        coast += 1;
                }
            g.lake[i] = lakes;
            g.salt[i] = salt;
            // Small landward indentations are favored; steep or iced shores make poor port sites.
            g.harbor[i] = coast ? clamp(coast / 5) * (.65 + .35 * clamp((17 - coast) / 12)) * Math.exp(-slope / 650) : 0;
            const river = clamp(g.river[i] + (Math.exp(-dist[i]) > .30 ? .32 : 0));
            g.river[i] = Math.max(g.river[i], river);
            const wet = w.wetness[i] || 0, soil = clamp(.76 + noise(x * .065, y * .065, w.seed + 553) * .18 + river * .12 - lakes * .02, .3, 1);
            const cropWater = Math.max(clamp(w.arid[i] / 1.05), g.fresh[i] * .88);
            const clearing = [7, 8, 9, 10, 11, 21].includes(w.biome[i]) ? .76 : 1;
            g.farm[i] = clamp(thermal * cropWater * soil * Math.exp(-slope / 620) * clearing * (1 - .57 * wet) * snow);
            g.hazard[i] = clamp(wet * .32 + Math.max(0, slope - 250) / 1800 + (w.volcanoes.some(v => v.active && Math.hypot(x - v.x, y - v.y) < 3) ? .55 : 0));
            const gather = (.012 + .06 * cropWater) * thermal * snow;
            const fish = (g.lake[i] * .08 + g.harbor[i] * .06) * thermal * g.fresh[i];
            g.food[i] = w.area[i] * 8000 * (g.farm[i] + gather + fish) * (1 - .4 * g.hazard[i]);
            g.waterCapacity[i] = w.area[i] * 16000 * Math.pow(g.fresh[i], 1.35) * snow;
            g.capacity[i] = Math.min(g.food[i], g.waterCapacity[i]);
            g.access[i] = clamp(g.harbor[i] * .8 + g.lake[i] * .60 + g.river[i] * .50);
            // A port cannot substitute for water or food: these terms multiply rather than simply add.
            g.potential[i] = clamp(Math.pow(g.capacity[i] / Math.max(1, 8000 * w.area[i]), .72) * (.66 + .46 * g.access[i]) * (1 - .6 * g.hazard[i]));
            g.mana[i] = clamp(.42 + .34 * noise(x * .043, y * .043, w.seed + 501) + w.rift[i] * .19 + w.arc[i] * .09);
            g.ore[i] = clamp(.20 + w.height[i] / 6000 + noise(x * .13, y * .13, w.seed + 66) * .35);
        }
    return g;
}
function marketDistances(sim, start, limit = Infinity) {
    const dist = new Float64Array(sim.provinces.length).fill(Infinity), heap = new MinHeap();
    dist[start] = 0;
    heap.push(start, 0);
    while (heap.length) {
        const [i, d] = heap.pop();
        if (d > dist[i] + 1e-8 || d > limit)
            continue;
        for (const e of sim.marketGraph[i]) {
            const v = d + e.cost;
            if (v < dist[e.to] && v <= limit) {
                dist[e.to] = v;
                heap.push(e.to, v);
            }
        }
    }
    return dist;
}
function buildMarketGraph(sim, w) {
    sim.marketGraph = sim.provinces.map(() => []);
    const put = (a, b, cost, kind) => { sim.marketGraph[a].push({ to: b, cost, kind }); sim.marketGraph[b].push({ to: a, cost, kind }); };
    for (const p of sim.provinces)
        for (const j of p.neighbors)
            if (j > p.id) {
                const q = sim.provinces[j], river = p.river > .30 && q.river > .30;
                put(p.id, j, Math.hypot(p.x - q.x, p.y - q.y) * (p.moveCost + q.moveCost) * .5 * (river ? .62 : 1), 'land');
            }
    for (const r of sim.routes)
        put(r.a, r.b, 4 + r.distance * .23, 'sea');
    // Inland navigation connects shores of the SAME lake, not just any two blue patches.
    const shores = new Map();
    for (const p of sim.provinces)
        for (const id of p.lakeIds) {
            if (!shores.has(id))
                shores.set(id, []);
            if (p.fresh > .25)
                shores.get(id).push(p);
        }
    const known = new Set();
    for (const [id, ps] of shores)
        for (const p of ps) {
            const next = ps.filter(q => q.id !== p.id).sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y)).slice(0, 3);
            for (const q of next) {
                const key = cPair(p.id, q.id);
                if (known.has(key))
                    continue;
                known.add(key);
                put(p.id, q.id, 3 + Math.hypot(p.x - q.x, p.y - q.y) * .27, 'lake');
            }
        }
}
function initializeSettlements(w, options = {}) {
    const physical = physicalFingerprint(w), historySeed = String(options.historySeed ?? 'First-dawn'), seed = seedHash(w.params.seed + ' / ' + historySeed), rng = random32(seed + 851), g = deriveHumanGeography(w);
    const sim = { version: 6, year: 400, seed, physicalSeed: w.seed, physicalHash: physical, options: { realms: options.realms || 18, conflict: options.conflict ?? 1, historySeed, politySeed: String(options.politySeed ?? 'First-councils'), highCitadelsVersion: options.highCitadelsVersion ?? 1 }, provinces: [], realms: [], relations: {}, wars: [], routes: [], events: [], history: [], nextWar: 1, totalBattles: 0, totalConquests: 0, totalSplits: 0 };
    const grid = new Int32Array(GN).fill(-1), cost = new Float64Array(GN).fill(Infinity), heap = new MinHeap();
    // Tessellation is solely for accounting. An empty district does NOT receive a settlement.
    for (let by = 2; by < GH - 2; by += 7)
        for (let bx = 2; bx < GW - 2; bx += 7) {
            let i = -1, best = -Infinity;
            for (let y = by; y < Math.min(GH - 2, by + 7); y++)
                for (let x = bx; x < Math.min(GW - 2, bx + 7); x++) {
                    const j = y * GW + x;
                    if (!habitable(w, j))
                        continue;
                    const score = g.potential[j] + g.fresh[j] * .23 + g.access[j] * .11 + hash2(x, y, w.seed + 702) * .012;
                    if (score > best) {
                        i = j;
                        best = score;
                    }
                }
            if (i < 0)
                continue;
            const id = sim.provinces.length;
            sim.provinces.push({ id, i, x: i % GW, y: i / GW | 0, cells: [], neighbors: [], owner: -1, name: '', nameRoll: [rng(), rng()], city: false, settled: false, urbanPop: 0, urbanSupport: 0, ruralPop: 0, pop: 0, capacity: 0, foodCapacity: 0, waterCapacity: 0, ruralCapacity: 0, fertility: 0, mana: 0, ore: 0, forest: 0, wet: 0, lake: 0, coast: 0, altitude: 0, temp: 0, aridity: 0, people: [], faith: [], unrest: 5 + rng() * 8, dev: .4 + rng() * .25, occupation: 0, river: g.river[i], fresh: g.fresh[i], harbor: g.harbor[i], sitePotential: g.potential[i], siteLake: g.lake[i], saltShore: g.salt[i], lakeIds: [], siteReason: '' });
            grid[i] = id;
            cost[i] = 0;
            heap.push(i, 0);
        }
    while (heap.length) {
        const [i, d] = heap.pop();
        if (d > cost[i] + 1e-8)
            continue;
        const x = i % GW, y = i / GW | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                continue;
            const j = yy * GW + xx;
            if (!habitable(w, j))
                continue;
            const v = d + 1 + Math.abs(w.height[i] - w.height[j]) / 900 + (w.wetness[j] || 0);
            if (v < cost[j]) {
                cost[j] = v;
                grid[j] = grid[i];
                heap.push(j, v);
            }
        }
    }
    const edges = new Set();
    for (let i = 0; i < GN; i++)
        if (grid[i] >= 0) {
            const p = sim.provinces[grid[i]];
            p.cells.push(i);
            p.ruralCapacity += g.capacity[i];
            p.foodCapacity += g.food[i];
            p.waterCapacity += g.waterCapacity[i];
            p.fertility += g.farm[i];
            p.mana += g.mana[i];
            p.ore += g.ore[i];
            p.altitude += w.height[i];
            p.temp += w.temp[i];
            p.aridity += w.arid[i];
            p.forest += [7, 8, 9, 10, 11, 21].includes(w.biome[i]) ? 1 : 0;
            p.wet += [18, 19, 20].includes(w.biome[i]) ? 1 : 0;
            const x = i % GW, y = i / GW | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                    continue;
                const j = yy * GW + xx;
                if (w.lake[j] > 0) {
                    p.lake++;
                    if (!p.lakeIds.includes(w.lakeId[j]))
                        p.lakeIds.push(w.lakeId[j]);
                }
                if (w.height[j] <= 0)
                    p.coast++;
                if (grid[j] >= 0 && grid[j] !== p.id)
                    edges.add(cPair(p.id, grid[j]));
            }
        }
    for (const key of edges) {
        const [a, b] = key.split(':').map(Number);
        sim.provinces[a].neighbors.push(b);
        sim.provinces[b].neighbors.push(a);
    }
    for (const p of sim.provinces) {
        const n = Math.max(1, p.cells.length);
        for (const k of ['fertility', 'mana', 'ore', 'altitude', 'temp', 'aridity', 'forest', 'wet'])
            p[k] /= n;
        p.lake = Math.min(1, p.lake / 12);
        p.coast = Math.min(1, p.coast / 15);
        p.capacity = p.ruralCapacity;
        p.pop = p.ruralCapacity * (.32 + rng() * .14);
        p.ruralPop = p.pop;
        p.landmass = w.landmassId[p.i];
        p.moveCost = 1 + p.altitude / 3500 + p.forest * .27 + p.wet * .9 + Math.max(0, .25 - p.fresh) * 5;
    }
    // Named only now: the suffix reports the averaged terrain, which does not exist until here.
    cNameDistricts(sim);
    w.provinceId = grid;
    w.fertility = g.farm;
    w.mana = g.mana;
    w.human = g;
    sim.gridSignature = grid.reduce((s, id, i) => (s + Math.imul(id + 1, i + 1)) >>> 0, 0);
    // Navigable corridors are evaluated BEFORE states exist; no realm gets an automatic port.
    makeSeaRoutes(w, sim);
    buildMarketGraph(sim, w);
    const candidates = [];
    for (const p of sim.provinces) {
        const access = sim.marketGraph[p.id].reduce((s, e) => s + (e.kind === 'sea' ? 1.3 : e.kind === 'lake' ? 1 : .20), 0);
        p.networkAccess = access;
        p.attraction = (.35 + p.sitePotential) * (.65 + Math.min(2, access) * .35) * Math.sqrt(p.ruralCapacity / 100000 + .03);
        if (p.fresh < .30 || p.sitePotential < .12 || p.ruralCapacity < 7000)
            continue;
        // Stochastic settlement pressure, not one town per district or one capital per biome.
        const chance = clamp(p.sitePotential * 1.18 + p.harbor * .28 + p.siteLake * .32, .03, .92);
        if (rng() > chance)
            continue;
        candidates.push({ p, rank: p.attraction * (.7 + rng() * .6) });
    }
    candidates.sort((a, b) => b.rank - a.rank);
    const hubs = [];
    for (const { p } of candidates) {
        const spacing = 4.8 + 4.2 * (1 - p.sitePotential);
        if (hubs.some(q => q.landmass === p.landmass && Math.hypot(q.x - p.x, q.y - p.y) < spacing))
            continue;
        hubs.push(p);
    }
    const distances = hubs.map(p => marketDistances(sim, p.id, 32));
    // Every district's farm surplus is allocated ONCE. Neighboring cities compete for it.
    let budget = 0, allocated = 0;
    const weights = new Float64Array(hubs.length);
    for (const source of sim.provinces) {
        const surplus = source.ruralCapacity * .24;
        budget += surplus;
        let sum = 0;
        for (let k = 0; k < hubs.length; k++) {
            const d = distances[k][source.id];
            weights[k] = Number.isFinite(d) ? Math.pow(hubs[k].attraction + .1, .8) * Math.exp(-d / 11) : 0;
            sum += weights[k];
        }
        if (!sum)
            continue;
        for (let k = 0; k < hubs.length; k++) {
            const v = surplus * weights[k] / sum;
            hubs[k].urbanSupport += v;
            allocated += v;
        }
    }
    for (const p of sim.provinces) {
        p.urbanSupport = Math.min(p.urbanSupport, p.waterCapacity * .38);
        p.urbanPop = p.urbanSupport * (.65 + rng() * .15);
        p.pop = p.ruralPop + p.urbanPop;
        p.capacity = p.ruralCapacity * .70 + p.urbanSupport;
        p.dev += clamp(p.urbanPop / 80000) * .6;
        p.city = p.urbanPop >= 9000;
        p.settled = p.urbanPop >= 650;
        p.settlementType = p.city ? (p.urbanPop > 30000 ? 'City' : 'Town') : p.settled ? 'Village' : p.pop > 1000 ? 'Dispersed households' : 'Sparse / uninhabited';
        const traits = [p.siteLake > .25 ? 'freshwater lakeshore' : null, p.harbor > .25 ? 'usable coast' : null, p.river > .35 ? 'river corridor' : null, p.fertility > .4 ? 'productive hinterland' : null, p.ore > .55 ? 'mineral access' : null].filter(Boolean);
        p.siteReason = p.settled ? `Supported by ${traits.join(', ') || 'rain-fed farms and local paths'}. ${Math.round(p.urbanSupport).toLocaleString('en-US')} model people of shared surplus; no capital bonus.` : p.fresh < .3 ? 'No reliable modeled freshwater at the best site. No town was created.' : p.sitePotential < .15 ? 'Low food/water support or difficult terrain. Dispersed population, not an automatic city.' : 'Local population remains dispersed, or a nearby market captures the limited surplus.';
    }
    sim.settlementBudget = { available: budget, allocated, retained: sim.provinces.reduce((s, p) => s + p.urbanSupport, 0) };
    if (sim.options.highCitadelsVersion === 1) HighCitadels.found(sim, w);
    initializeCulturalOrigins(sim);
    sim.settlementSignature = settlementFingerprint(sim);
    sim.initialDistribution = settlementDistribution(sim, w);
    sim.initialSettlements = sim.provinces.filter(p => p.settled).map(p => ({ province: p.id, cell: p.i, urbanPop: p.urbanPop, type: p.settlementType }));
    if (physicalFingerprint(w) !== physical)
        throw Error('Settlement generation mutated physical geography.');
    return sim;
}
function initializeCulturalOrigins(sim) {
    const rng = random32(sim.seed + 5499), settled = sim.provinces.filter(p => p.pop > 3000);
    const origin = (n) => { const list = []; for (let k = 0; k < n; k++) {
        let best = null, bestS = -Infinity;
        for (const p of settled) {
            const d = list.length ? Math.min(...list.map(o => { const q = sim.provinces[o.province]; return Math.hypot(p.x - q.x, p.y - q.y) + (p.landmass !== q.landmass ? 18 : 0); })) : 40;
            const s = Math.log1p(p.pop) * .2 + Math.min(d, 50) * .10 + rng() * 1.4;
            if (s > bestS) {
                bestS = s;
                best = p;
            }
        }
        if (best)
            list.push({ province: best.id, identity: k, dist: marketDistances(sim, best.id) });
    } return list; };
    const people = origin(PEOPLES.length), faiths = origin(FAITHS.length);
    sim.culturalOrigins = { peoples: people.map(({ province, identity }) => ({ province, identity })), faiths: faiths.map(({ province, identity }) => ({ province, identity })) };
    for (const p of sim.provinces) {
        const weights = Array(PEOPLES.length).fill(.015), fw = Array(FAITHS.length).fill(.025);
        for (const o of people) {
            const d = o.dist[p.id];
            weights[o.identity] += Number.isFinite(d) ? 3 * Math.exp(-d / 45) : .02;
        }
        for (const o of faiths) {
            const d = o.dist[p.id];
            fw[o.identity] += Number.isFinite(d) ? 3 * Math.exp(-d / 52) : .02;
        }
        weights[Math.floor(rng() * weights.length)] += .10;
        fw[Math.floor(rng() * fw.length)] += .10;
        p.people = cNormalize(weights);
        p.faith = cNormalize(fw);
    }
}
function settlementFingerprint(sim) { let h = 2166136261; for (const p of sim.provinces) {
    for (const v of [p.i, p.city ? 1 : 0, p.settled ? 1 : 0, Math.round(p.urbanPop), Math.round(p.pop)]) {
        h ^= v;
        h = Math.imul(h, 16777619);
    }
} return (h >>> 0).toString(16); }
function chooseInstitution(p, sim, rng) {
    // Economic specializations describe a place AFTER settlement. Institutions are sampled,
    // not entailed by terrain, ancestry or a required list of named kingdoms.
    const weights = [1, .45, .20, .65, .5, .22, .75, .55];
    weights[0] += p.fertility * 1.8;
    weights[1] += Math.max(...p.faith) * .8;
    weights[2] += Math.max(0, p.mana - .47) * 6 * clamp(p.urbanPop / 23000);
    weights[3] += p.forest * .8;
    weights[4] += p.harbor * 2.5 + p.siteLake * 1.8 + p.networkAccess * .14;
    weights[5] += p.ore * Math.max(0, p.altitude / 1500 - .5);
    weights[6] += p.fertility;
    weights[7] += p.networkAccess * .23;
    let value = rng() * weights.reduce((a, b) => a + b, 0), gov = 0;
    for (let k = 0; k < weights.length; k++) {
        value -= weights[k];
        if (value <= 0) {
            gov = k;
            break;
        }
    }
    const type = p.harbor > .35 ? 'maritime' : p.siteLake > .30 ? 'lake' : p.wet > .35 ? 'wetland' : p.ore > .50 && p.altitude > 1300 ? 'forge' : p.forest > .50 ? 'forest' : p.fertility > .33 ? 'granary' : p.mana > .58 ? 'arcane' : 'frontier';
    return { gov, type };
}
// Administrative access is NOT the trade graph. Every edge below is a traversable
// land connection between existing districts, computed from the unchanged raster.
// Sea lanes and lake shipping remain commercial/diplomatic links, not annexation shortcuts.
function buildAdministrationGraph(sim, w) {
    const grid = w.provinceId, dist = new Float64Array(GN).fill(Infinity), heap = new MinHeap();
    // A frontier should be a thing you can point at. Mountain walls and major rivers are
    // what actually stop an administration, and at the old weights they barely registered:
    // a 3,000 m range added .56 to a base of .82, so a border fell wherever two capitals
    // happened to meet rather than along anything on the map. They now cost what they are
    // worth. A river valley is still the cheap way THROUGH a range; crossing one is not.
    const step = (i, j) => {
        const altitude = (w.height[i] + w.height[j]) * .5, delta = Math.abs(w.height[i] - w.height[j]);
        const wet = ((w.wetness?.[i] || 0) + (w.wetness?.[j] || 0)) * .5;
        const dry = Math.max(0, .30 - (w.human.fresh[i] + w.human.fresh[j]) * .5);
        const valley = w.human.river[i] > .30 && w.human.river[j] > .30 ? .85 : 1;
        const wall = Math.max(0, altitude - 850) / 1100 + Math.max(0, delta - 150) / 210;
        const channel = w.channelThreshold?.[j] || w.riverThreshold;
        const ford = w.lake[j] < 0 && w.flow[j] > channel ? 1.8 + Math.min(10, w.flow[j] / channel) * .85 : 0;
        return (.82 + wall + wet * .55 + dry * 2.5) * valley + ford;
    };
    for (const p of sim.provinces) {
        dist[p.i] = 0;
        heap.push(p.i, 0);
    }
    while (heap.length) {
        const [i, d] = heap.pop();
        if (d > dist[i] + 1e-8)
            continue;
        const x = i % GW, y = i / GW | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                continue;
            const j = yy * GW + xx;
            if (grid[j] !== grid[i])
                continue;
            const v = d + step(i, j);
            if (v < dist[j]) {
                dist[j] = v;
                heap.push(j, v);
            }
        }
    }
    const best = new Map();
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = y * GW + x, a = grid[i];
            if (a < 0)
                continue;
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                if (x + dx >= GW || y + dy >= GH)
                    continue;
                const j = i + dx + dy * GW, b = grid[j];
                if (b < 0 || a === b)
                    continue;
                const key = cPair(a, b), value = dist[i] + step(i, j) + dist[j];
                if (!Number.isFinite(value))
                    continue;
                if (!best.has(key) || value < best.get(key).cost)
                    best.set(key, { a, b, cost: value, crossing: [i, j] });
            }
        }
    const graph = sim.provinces.map(() => []);
    for (const e of best.values()) {
        graph[e.a].push({ to: e.b, cost: e.cost, kind: 'land', crossing: e.crossing });
        graph[e.b].push({ to: e.a, cost: e.cost, kind: 'land', crossing: [e.crossing[1], e.crossing[0]] });
    }
    sim.administrationGraph = graph;
    return graph;
}
function administrationDistances(sim, start, limit = Infinity) {
    const dist = new Float64Array(sim.provinces.length).fill(Infinity), heap = new MinHeap();
    dist[start] = 0;
    heap.push(start, 0);
    while (heap.length) {
        const [i, d] = heap.pop();
        if (d > dist[i] + 1e-8 || d > limit)
            continue;
        for (const e of sim.administrationGraph[i]) {
            const v = d + e.cost;
            if (v < dist[e.to] && v <= limit) {
                dist[e.to] = v;
                heap.push(e.to, v);
            }
        }
    }
    return dist;
}
/* Namebases and formal titles are independent of the institutions above. */
function nameRealms(sim) {
    RealmNames.generate(sim);
}
function localPoliticalDifference(a, b) {
    // Small institutional-coordination term; no species gets an inherent state/war bonus.
    return a.faith.reduce((s, v, k) => s + Math.abs(v - b.faith[k]), 0) * .5;
}
function formPolities(sim, w) {
    const before = settlementFingerprint(sim), rng = random32(seedHash(sim.seed + ' / politics / ' + (sim.options.politySeed || 'First-councils')));
    const frag = clamp(sim.options.realms || 18, 8, 30), consolidation = 64 * Math.pow(18 / frag, .75);
    buildAdministrationGraph(sim, w);
    const candidates = sim.provinces.filter(p => p.city).map(p => {
        p.localAutonomy = clamp(.40 + rng() * .38 + p.harbor * .12 + p.siteLake * .10, .35, .93);
        return { p, score: p.urbanPop * (.8 + Math.min(3, p.networkAccess) * .10) * (.9 + rng() * .2) };
    }).sort((a, b) => b.score - a.score), centers = [];
    // Larger neighbors can consolidate nearby minor towns, but there is no blanket
    // exclusion radius, continent quota, required archetype list, or fixed country count.
    for (const { p } of candidates) {
        let dominant = null, best = 0;
        for (const q of centers) {
            const d = q.dist[p.id];
            if (!Number.isFinite(d))
                continue;
            const affinity = 1 - .22 * localPoliticalDifference(p, q.p);
            const influence = Math.pow(q.p.urbanPop / Math.max(1, p.urbanPop), .28) * Math.exp(-d / consolidation) * affinity;
            if (influence > best) {
                best = influence;
                dominant = q;
            }
        }
        const resistance = .58 + p.localAutonomy * .27;
        if (dominant && best > resistance) {
            p.foundingDependency = dominant.p.id;
            continue;
        }
        // Drawn here rather than at founding: a council's reach caps the search itself, so
        // rolling it later left even the most ambitious able to see only as far as the least.
        const ambition = Math.exp(-1.45 + 4.1 * Math.pow(rng(), 2.6));
        centers.push({ p, ambition, dist: administrationDistances(sim, p.id, consolidation * 3.5 * Math.min(4.5, Math.max(1, ambition))) });
        p.foundingDependency = -1;
    }
    sim.foundingModel = { name: 'Local councils and bounded administration', consolidation, autonomousTowns: centers.length, candidateTowns: candidates.length, usesContinentQuotas: false, usesSeaTradeForSovereignty: false, settlementsBefore: before };
    for (const { p, ambition } of centers) {
        const id = sim.realms.length, { gov, type } = chooseInstitution(p, sim, rng), name = p.name;
        const titles = [`Kingdom of ${name}`, `Sanctuary of ${name}`, `${name} Collegium`, `${name} Confederacy`, `${name} Merchant League`, `${name} Holds`, `Republic of ${name}`, `${name} City League`];
        const policy = gov === 2 ? 'Scholarship' : gov === 4 ? 'Prosperity' : rng() < .20 ? 'Expansion' : rng() < .4 ? 'Concord' : 'Prosperity';
        // Realms are not one size. Reach used to span .90-1.2 whatever the council, so thirty
        // near-identical duchies tiled the map and the largest held 7% of it. The ambition a
        // founding council can sustain is drawn from a long tail instead: most keep a town and
        // its valley, a few run to a quarter of a continent. Terrain still decides where that
        // ambition stops, so a large draw on a broken coast stays small anyway.
        const commandRange = 35 * Math.pow(18 / frag, .28) * (.90 + .15 * Math.sqrt(p.urbanPop / 45000)) * ambition;
        const adminBudget = (9 + 3.6 * Math.sqrt(p.urbanPop / 1000)) * Math.pow(18 / frag, .3) * ambition;
        sim.realms.push({ id, name, title: titles[gov], color: REALM_COLORS[id % REALM_COLORS.length], capital: p.id, gov, faith: cDominant(p.faith), originPeople: cDominant(p.people), archetype: type,
            identity: `The existing ${p.settlementType.toLowerCase()} of ${p.name} retained its own political center. It draws on ${type === 'granary' ? 'farms and local markets' : type === 'lake' ? 'freshwater shores and lake commerce' : type === 'maritime' ? 'ports and coastal commerce' : type === 'forge' ? 'highland workshops and mineral resources' : type === 'forest' ? 'forest livelihoods and farms' : type === 'wetland' ? 'wetland livelihoods and navigable valleys' : 'its local production and exchange network'}. Neighboring towns can remain independent; trade does not confer sovereignty. Its ${GOVERNMENTS[gov].toLowerCase()} is a sampled institutional history, not a geographical destiny.`,
            reach: .88 + rng() * .30, tolerance: .45 + rng() * .50, ambition: .25 + rng() * .55, policy, tech: .8 + p.dev * .22 + p.ore * .15, arcana: .55 + p.mana * .90 + (gov === 2 ? .40 : 0), wealthSeed: 1, treasury: 10, army: 1, navy: 0, stability: 70 + rng() * 17, warWeariness: 0, alive: true, founded: 400, provinces: [], population: 0, power: 0, imports: 0, commandRange, adminBudget, adminUsed: 0, localAutonomy: p.localAutonomy });
    }
    // A claim must grow from a held neighbor. Rival capital cells are locked at founding.
    // Separate (realm, district) travel states avoid invalid source-dependent Dijkstra pruning.
    const n = sim.provinces.length, dist = new Float64Array(n * sim.realms.length).fill(Infinity), parentOf = new Int32Array(n * sim.realms.length).fill(-1), heap = new MinHeap();
    for (const p of sim.provinces) {
        p.owner = -1;
        p.adminDistance = null;
        p.adminParent = -1;
        p.adminUpkeep = 0;
    }
    for (const c of sim.realms) {
        const p = sim.provinces[c.capital];
        p.owner = c.id;
        p.adminDistance = 0;
        dist[c.id * n + p.id] = 0;
    }
    const extend = (c, p, d) => {
        for (const e of sim.administrationGraph[p.id]) {
            const q = sim.provinces[e.to];
            if (q.owner >= 0)
                continue;
            const dissimilarity = localPoliticalDifference(sim.provinces[c.capital], q), v = d + e.cost * (1 + .18 * dissimilarity) / c.reach, key = c.id * n + q.id;
            if (v < c.commandRange && v < dist[key]) {
                dist[key] = v;
                parentOf[key] = p.id;
                heap.push(key, v);
            }
        }
    };
    for (const c of sim.realms)
        extend(c, sim.provinces[c.capital], 0);
    while (heap.length) {
        const [key, d] = heap.pop(), cid = Math.floor(key / n), pid = key % n, c = sim.realms[cid], p = sim.provinces[pid];
        if (d > dist[key] + 1e-8 || p.owner >= 0)
            continue;
        // Find an already-owned supporting edge. No jumping across another country's land.
        const parent = parentOf[key];
        if (parent < 0 || sim.provinces[parent].owner !== cid)
            continue;
        const upkeep = (.58 + p.altitude / 3500 + p.wet * .50 + Math.max(0, .30 - p.fresh) * 2) * (1 + d / 34);
        if (c.adminUsed + upkeep > c.adminBudget)
            continue;
        p.owner = cid;
        p.adminDistance = d;
        p.adminUpkeep = upkeep;
        p.adminParent = parent;
        c.adminUsed += upkeep;
        extend(c, p, d);
    }
    for (const c of sim.realms)
        c.foundingProvinces = sim.provinces.filter(p => p.owner === c.id).length;
    nameRealms(sim);
    assignPoliticalColors(sim);
    if (settlementFingerprint(sim) !== before)
        throw Error('State formation moved or created a settlement.');
    aggregateRealms(sim);
    for (const c of sim.realms) {
        c.army = c.population / 1000 * (.009 + c.ambition * .008);
        c.navy = c.coastProvinces ? 1.8 + c.coastProvinces * .65 : 0;
        c.treasury = c.income * 2.6;
    }
    const connections = realmConnections(sim);
    for (let a = 0; a < sim.realms.length; a++)
        for (let b = a + 1; b < sim.realms.length; b++) {
            const A = sim.realms[a], B = sim.realms[b], link = connections.get(cPair(a, b)), score = 18 + (rng() - .5) * 60 + (A.faith === B.faith ? 8 : 0) + (link?.sea ? 12 : 0);
            sim.relations[cPair(a, b)] = { a, b, score: clamp(score, -100, 100), alliance: false, trade: !!link && score > 5, truceUntil: 0, grievance: 0, since: 400 };
        }
    for (const r of Object.values(sim.relations))
        if (r.score > 48 && connections.has(cPair(r.a, r.b)) && rng() < .6) {
            r.alliance = true;
            r.trade = true;
        }
    for (const c of sim.realms)
        logEvent(sim, 'founding', `${c.title} forms around ${sim.provinces[c.capital].name}, holding ${c.foundingProvinces} connected districts. Other local centers remain sovereign.`, [c.id]);
    sim.initialRealmCount = sim.realms.length;
    sim.foundingPolitics = politicalDiagnostics(sim, w);
    aggregateRealms(sim);
    recordHistory(sim);
    return sim;
}
function assignPoliticalColors(sim) {
    // Saturation/adjacency-aware coloring, not one color per continent. Reuse is allowed
    // for distant states, but immediate neighbors always get contrasting colors.
    const palette = ['#d1aa64', '#73a6b8', '#ac89b1', '#7fa777', '#c58c74', '#999ec6', '#74b4a0', '#b6bb72', '#ca91a4', '#80abb0', '#bb9a70', '#83a386', '#b48f9a', '#b09e5b', '#8d9ab1', '#caab8e'];
    const links = sim.realms.map(() => new Set());
    for (const p of sim.provinces)
        for (const j of p.neighbors) {
            const q = sim.provinces[j];
            if (p.owner >= 0 && q.owner >= 0 && p.owner !== q.owner) {
                links[p.owner].add(q.owner);
                links[q.owner].add(p.owner);
            }
        }
    const assigned = new Map(), use = palette.map(() => 0), rgbHex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
    while (assigned.size < sim.realms.length) {
        let next = -1, sat = -1, degree = -1;
        for (const c of sim.realms) {
            if (assigned.has(c.id))
                continue;
            const n = new Set([...links[c.id]].filter(x => assigned.has(x)).map(x => assigned.get(x))).size;
            if (n > sat || n === sat && links[c.id].size > degree) {
                next = c.id;
                sat = n;
                degree = links[c.id].size;
            }
        }
        let choice = 0, best = -Infinity;
        for (let k = 0; k < palette.length; k++) {
            let separation = 90;
            const x = rgbHex(palette[k]);
            for (const id of links[next])
                if (assigned.has(id)) {
                    const y = rgbHex(palette[assigned.get(id)]);
                    separation = Math.min(separation, Math.hypot(...x.map((v, j) => v - y[j])));
                }
            const score = separation - use[k] * 3;
            if (score > best) {
                best = score;
                choice = k;
            }
        }
        assigned.set(next, choice);
        use[choice]++;
        sim.realms[next].color = palette[choice];
    }
}
function politicalFingerprint(sim) { let h = 2166136261; for (const p of sim.provinces) {
    h ^= p.owner + 1;
    h = Math.imul(h, 16777619);
} return (h >>> 0).toString(16); }
function politicalDiagnostics(sim, w) {
    const continents = w.continents.map(l => {
        const ps = sim.provinces.filter(p => p.landmass === l.id), areas = new Map();
        let total = 0, unclaimed = 0;
        for (const p of ps) {
            const area = p.cells.reduce((s, i) => s + w.area[i], 0);
            total += area;
            if (p.owner < 0)
                unclaimed += area;
            else
                areas.set(p.owner, (areas.get(p.owner) || 0) + area);
        }
        const ids = [...areas.keys()], internalPairs = new Set();
        let borderEdges = 0;
        for (const p of ps)
            for (const j of p.neighbors) {
                const q = sim.provinces[j];
                if (p.id < j && q.landmass === l.id && p.owner >= 0 && q.owner >= 0 && p.owner !== q.owner) {
                    borderEdges++;
                    internalPairs.add(cPair(p.owner, q.owner));
                }
            }
        return { id: l.id, name: l.name, cell: l.i, towns: ps.filter(p => p.city).length, polities: ids.length, realmIds: ids, capitalCount: sim.realms.filter(c => c.alive && sim.provinces[c.capital].landmass === l.id).length, largestShare: total ? Math.max(0, ...areas.values()) / total : 0, unclaimedShare: total ? unclaimed / total : 0, internalFrontiers: internalPairs.size, borderEdges };
    });
    let disconnected = 0;
    const disconnectedRealms = [];
    for (const c of sim.realms) {
        const owned = sim.provinces.filter(p => p.owner === c.id);
        if (!owned.length)
            continue;
        const seen = new Set([c.capital]), q = [c.capital];
        while (q.length) {
            const p = sim.provinces[q.pop()];
            for (const j of p.neighbors)
                if (sim.provinces[j].owner === c.id && !seen.has(j)) {
                    seen.add(j);
                    q.push(j);
                }
        }
        if (owned.some(p => !seen.has(p.id))) {
            disconnected++;
            disconnectedRealms.push(c.id);
        }
    }
    return { year: sim.year, realms: sim.realms.filter(c => c.alive).length, continents, disconnected, disconnectedRealms, physicalHash: physicalFingerprint(w), settlementHash: settlementFingerprint(sim), politicalHash: politicalFingerprint(sim) };
}
function createCivilization(w, options = {}) { const sim = initializeSettlements(w, options); for (const p of sim.provinces) {
    p.detailSupport = p.urbanSupport;
    p.detailMana = p.mana;
} formPolities(sim, w); if (physicalFingerprint(w) !== sim.physicalHash)
    throw Error('Civilization changed the natural world.'); return sim; }
function settlementDistribution(sim, w) {
    const groups = { freshwater: { label: 'Freshwater shores & rivers', test: i => w.human.fresh[i] > .60 && w.human.rainwater[i] < w.human.fresh[i] - .05 }, coast: { label: 'Ice-accessible coasts', test: i => w.dist[i] <= 2 && w.seaIce[w.nearest[i]] < .65 }, dry: { label: 'Dryland without reliable water', test: i => w.arid[i] < .55 && w.human.fresh[i] < .30 }, interior: { label: 'All habitable land', test: () => true } };
    const out = {};
    for (const [key, group] of Object.entries(groups)) {
        let area = 0, population = 0, urban = 0, settlements = 0, cities = 0;
        for (let i = 0; i < GN; i++)
            if (habitable(w, i) && group.test(i)) {
                area += w.area[i];
                const p = sim.provinces[w.provinceId[i]];
                if (p)
                    population += p.ruralPop * (w.human.capacity[i] / Math.max(1, p.ruralCapacity));
            }
        for (const p of sim.provinces)
            if (group.test(p.i)) {
                if (p.settled)
                    settlements++;
                if (p.city)
                    cities++;
                urban += p.urbanPop;
                population += p.urbanPop;
            }
        out[key] = { label: group.label, area, settlements, cities, population, urban, citiesPer100Cells: area ? cities / area * 100 : 0, density: area ? population / area : 0 };
    }
    return out;
}
function makeSeaRoutes(w, sim) {
    const ports = sim.provinces.filter(p => p.harbor > .12 && p.fresh > .30 && p.pop > 2000).sort((a, b) => b.pop - a.pop), chosen = [];
    for (const p of ports) {
        if (chosen.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 15))
            continue;
        chosen.push(p);
        if (chosen.length >= 48)
            break;
    }
    const firstSea = p => { for (const i of p.cells) {
        const x = i % GW, y = i / GW | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                continue;
            const j = yy * GW + xx;
            if (w.height[j] <= 0)
                return j;
        }
    } return -1; };
    const portSea = chosen.map(firstSea), pairs = new Set();
    for (let a = 0; a < chosen.length; a++) {
        if (portSea[a] < 0)
            continue;
        const prev = new Int32Array(GN).fill(-2), distance = new Int16Array(GN).fill(-1), queue = new Int32Array(GN);
        let head = 0, tail = 1;
        queue[0] = portSea[a];
        prev[portSea[a]] = -1;
        distance[portSea[a]] = 0;
        while (head < tail) {
            const i = queue[head++], x = i % GW, y = i / GW | 0;
            if (distance[i] > 195)
                continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                    continue;
                const j = yy * GW + xx;
                if (prev[j] === -2 && w.height[j] <= 0 && w.seaIce[j] < .88) {
                    prev[j] = i;
                    distance[j] = distance[i] + 1;
                    queue[tail++] = j;
                }
            }
        }
        const dests = [];
        for (let b = 0; b < chosen.length; b++)
            if (a !== b && portSea[b] >= 0 && distance[portSea[b]] > 0)
                dests.push({ b, d: distance[portSea[b]] });
        dests.sort((a, b) => a.d - b.d);
        let got = 0, seenOwners = new Set();
        for (const { b, d } of dests) {
            const key = cPair(chosen[a].id, chosen[b].id);
            if (pairs.has(key))
                continue;
            pairs.add(key);
            let i = portSea[b], path = [];
            while (i >= 0 && path.length <= GN) {
                path.push(i);
                i = prev[i];
            }
            path.reverse();
            sim.routes.push({ a: chosen[a].id, b: chosen[b].id, distance: d, path: cStraightenSea(w, path), kind: 'sea' });
            if (++got >= 3)
                break;
        }
    }
}
function realmConnections(sim) {
    const edges = new Map(), add = (a, b, sea, pa, pb) => { if (a < 0 || b < 0 || a === b)
        return; const key = cPair(a, b); let e = edges.get(key); if (!e) {
        e = { a: Math.min(a, b), b: Math.max(a, b), land: false, sea: false, fronts: [], routes: [] };
        edges.set(key, e);
    } if (sea) {
        e.sea = true;
        e.routes.push([pa, pb]);
    }
    else {
        e.land = true;
        e.fronts.push([pa, pb]);
    } };
    for (const p of sim.provinces)
        for (const j of p.neighbors)
            if (j > p.id)
                add(p.owner, sim.provinces[j].owner, false, p.id, j);
    for (const r of sim.routes)
        add(sim.provinces[r.a].owner, sim.provinces[r.b].owner, true, r.a, r.b);
    return edges;
}
function aggregateRealms(sim) {
    for (const c of sim.realms) {
        c.provinces = [];
        c.population = 0;
        c.capacity = 0;
        c.food = 0;
        c.income = 0;
        c.ore = 0;
        c.mana = 0;
        c.coastProvinces = 0;
        c.unrest = 0;
        c.people = Array(PEOPLES.length).fill(0);
        c.faithMix = Array(FAITHS.length).fill(0);
        c.tradeIncome = 0;
        c.imports = 0;
    }
    for (const p of sim.provinces) {
        const c = sim.realms[p.owner];
        if (!c)
            continue;
        c.provinces.push(p.id);
        c.population += p.pop;
        c.capacity += p.capacity;
        c.food += (p.foodCapacity ?? p.capacity) * (.72 + .18 * p.dev) * (p.harvest ?? 1);
        c.income += p.pop / 100000 * (.75 + p.dev * .44 + c.tech * .22 + p.ore * .2) * (1 - p.unrest * .004);
        c.ore += p.ore * p.pop;
        c.mana += p.mana * p.pop;
        c.coastProvinces += p.coast > .15 ? 1 : 0;
        c.unrest += p.unrest * p.pop;
        for (let k = 0; k < PEOPLES.length; k++)
            c.people[k] += p.people[k] * p.pop;
        for (let k = 0; k < FAITHS.length; k++)
            c.faithMix[k] += p.faith[k] * p.pop;
    }
    for (const c of sim.realms) {
        c.alive = c.provinces.length > 0;
        if (!c.alive) {
            c.population = 0;
            c.power = 0;
            c.army = 0;
            c.navy = 0;
            continue;
        }
        c.ore /= Math.max(1, c.population);
        c.mana /= Math.max(1, c.population);
        c.unrest /= Math.max(1, c.population);
        c.people = cNormalize(c.people);
        c.faithMix = cNormalize(c.faithMix);
        if (!c.provinces.includes(c.capital))
            c.capital = c.provinces.slice().sort((a, b) => sim.provinces[b].pop - sim.provinces[a].pop)[0];
    }
    const connections = realmConnections(sim);
    for (const [key, edge] of connections) {
        const r = sim.relations[key], A = sim.realms[edge.a], B = sim.realms[edge.b];
        if (!r || !r.trade || warBetween(sim, A.id, B.id))
            continue;
        const value = Math.sqrt(Math.max(0, A.income * B.income)) * (edge.sea ? .045 : .035);
        A.tradeIncome += value;
        B.tradeIncome += value;
        const move = (src, dst) => { const surplus = Math.max(0, src.food - src.population), lack = Math.max(0, dst.population * 1.08 - dst.food), q = Math.min(surplus * .07, lack * .35); src.food -= q; dst.food += q; dst.imports += q; };
        move(A, B);
        move(B, A);
    }
    for (const c of sim.realms) {
        if (!c.alive)
            continue;
        c.income += c.tradeIncome;
        c.foodRatio = c.food / Math.max(1, c.population);
        c.power = c.army * (.70 + c.tech * .24 + c.arcana * .16) * (.50 + c.stability / 180) * (1 + Math.min(c.treasury / Math.max(1, c.income), 5) * .025) + c.navy * .8;
        c.economy = c.income * (.8 + c.tech * .15);
        c.magicPower = c.arcana * (.5 + c.mana) * Math.sqrt(c.population / 100000);
        c.military = c.power;
        c.strength = .55 * c.power + .7 * c.income + 2 * c.magicPower;
    }
}
function warBetween(sim, a, b) { return sim.wars.find(w => !w.ended && ((w.a === a && w.b === b) || (w.a === b && w.b === a))); }
function logEvent(sim, type, text, actors = [], details = null) { sim.events.push({ year: sim.year, type, text, actors, details }); if (sim.events.length > 1800)
    sim.events.shift(); }
function cRelation(sim, a, b) { const key = cPair(a, b); if (!sim.relations[key])
    sim.relations[key] = { a: Math.min(a, b), b: Math.max(a, b), score: 10, alliance: false, trade: false, truceUntil: 0, grievance: 0, since: sim.year }; return sim.relations[key]; }
function startWar(sim, a, b, reason = 'a disputed frontier', forced = false) {
    const A = sim.realms[a], B = sim.realms[b];
    if (!A?.alive || !B?.alive || a === b || warBetween(sim, a, b))
        return { ok: false, message: 'No valid opposing realms.' };
    const edge = realmConnections(sim).get(cPair(a, b));
    if (!edge)
        return { ok: false, message: 'No shared land frontier or navigable sea route. Armies cannot teleport.' };
    if (!edge.land && A.navy < 3)
        return { ok: false, message: 'An overseas campaign requires a navy of at least 3 flotillas.' };
    const r = cRelation(sim, a, b);
    if (!forced && r.truceUntil > sim.year)
        return { ok: false, message: 'A truce is still in force.' };
    r.alliance = false;
    r.trade = false;
    r.score = -75;
    r.grievance += 15;
    const war = { id: sim.nextWar++, a, b, start: sim.year, score: 0, battles: 0, ended: false, reason, naval: !edge.land };
    sim.wars.push(war);
    logEvent(sim, 'war', `${A.name} declares war on ${B.name} over ${reason}.`, [a, b]);
    return { ok: true, message: 'War declared. Supply, terrain and allied support will affect each campaign.' };
}
function endWar(sim, war, reason) { war.ended = true; war.end = sim.year; const r = cRelation(sim, war.a, war.b); r.score = -22; r.truceUntil = sim.year + 9; r.grievance += Math.abs(war.score) * 4; logEvent(sim, 'peace', `${sim.realms[war.a].name} and ${sim.realms[war.b].name} agree to ${reason}; current frontiers remain.`, [war.a, war.b]); }
function takeProvince(sim, p, winner, loser, reason) {
    const old = sim.realms[loser], newc = sim.realms[winner];
    p.owner = winner;
    p.unrest = clamp(p.unrest + 29, 0, 100);
    p.occupation = 9;
    p.dev = Math.max(.22, p.dev * .89);
    p.pop *= .987;
    sim.totalConquests++;
    logEvent(sim, 'conquest', `${newc.name} takes ${p.name} from ${old.name}. Local peoples and faiths remain; occupation raises unrest.`, [winner, loser], { province: p.id, reason });
    const remains = sim.provinces.filter(q => q.owner === loser);
    if (!remains.length) {
        old.alive = false;
        old.army = 0;
        old.navy = 0;
        logEvent(sim, 'fall', `${old.title} loses its last province. Its population remains on the map under new rule.`, [loser, winner]);
    }
    else if (old.capital === p.id) {
        old.capital = remains.sort((a, b) => b.pop - a.pop)[0].id;
        logEvent(sim, 'capital', `${old.name} moves its court to ${sim.provinces[old.capital].name}.`, [loser]);
    }
}
function stepCivilization(sim, w) {
    sim.year++;
    const rng = random32((sim.seed + Math.imul(sim.year, 977) + 7163) >>> 0);
    aggregateRealms(sim);
    // Local demographic growth is resource-bounded. Imports affect food access; migration conserves people.
    let births = 0, starvation = 0;
    for (const p of sim.provinces) {
        const c = sim.realms[p.owner], policy = c?.policy || 'Concord';
        p.harvest = 1;
        const upper = p.capacity * (.84 + (c?.tech || 1) * .12 + p.dev * .17), food = c ? clamp(c.foodRatio, .4, 1.5) : 1, occ = p.occupation > 0;
        const growth = p.pop * .017 * (1 - p.pop / Math.max(1, upper)) * clamp(food, .2, 1.15), deaths = p.pop * Math.max(0, .87 - food) * .033;
        p.pop = Math.max(0, p.pop + growth - deaths);
        births += growth;
        starvation += deaths;
        p.dev = clamp(p.dev + (.0025 + (policy === 'Prosperity' ? .006 : .001)) * (1 - p.unrest / 130) - (occ ? .015 : 0), .2, 2.5);
        const target = (occ ? 42 : 8) + (c ? (1 - c.stability / 100) * 18 + c.warWeariness * .30 + (1 - c.tolerance) * (1 - p.faith[c.faith]) * 13 : 8) + Math.max(0, 1 - food) * 35;
        p.unrest = clamp(p.unrest + (target - p.unrest) * .13 + (rng() - .5) * 2, 0, 100);
        p.occupation = Math.max(0, p.occupation - 1);
    }
    for (const p of sim.provinces) {
        const prev = p.city;
        const target = HighCitadels.cap(p, Math.min(p.pop * .58, p.urbanSupport * (.70 + .22 * p.dev)));
        p.urbanPop = HighCitadels.cap(p, Math.min(p.pop, Math.max(0, p.urbanPop + (target - p.urbanPop) * .08)));
        p.ruralPop = p.pop - p.urbanPop;
        p.city = p.urbanPop >= 9000;
        p.settled = p.urbanPop >= 650;
        p.settlementType = p.highCitadel && p.settled ? HighCitadels.type(p) : p.city ? (p.urbanPop > 30000 ? 'City' : 'Town') : p.settled ? 'Village' : p.pop > 1000 ? 'Dispersed households' : 'Sparse / uninhabited';
        if (prev !== p.city)
            logEvent(sim, 'prosperity', `${p.name} ${p.city ? 'grows into a town' : 'contracts below town size'} as its population changes.`, p.owner >= 0 ? [p.owner] : []);
    }
    // Faith diffuses through contacts; occupying an area does not instantly convert it.
    const updated = sim.provinces.map(p => p.faith.slice());
    for (const p of sim.provinces) {
        let sum = Array(FAITHS.length).fill(0);
        for (const j of p.neighbors)
            for (let k = 0; k < sum.length; k++)
                sum[k] += sim.provinces[j].faith[k];
        const c = sim.realms[p.owner];
        for (let k = 0; k < sum.length; k++) {
            const neighbors = p.neighbors.length ? sum[k] / p.neighbors.length : p.faith[k];
            updated[p.id][k] = p.faith[k] * .988 + neighbors * .010 + (c ? (k === c.faith ? .002 : 0) : p.faith[k] * .002);
        }
    }
    for (const p of sim.provinces)
        p.faith = cNormalize(updated[p.id]);
    for (const p of sim.provinces) {
        if (p.pop <= 0 || !p.neighbors.length || rng() > .16)
            continue;
        const q = sim.provinces[p.neighbors[Math.floor(rng() * p.neighbors.length)]], dest = sim.realms[q.owner];
        if (!dest || q.capacity <= q.pop || q.dev <= p.dev + .08 || warBetween(sim, p.owner, q.owner))
            continue;
        const m = Math.min(p.pop * .002 * dest.tolerance, Math.max(0, q.capacity - q.pop) * .02), old = q.pop;
        if (m <= 0)
            continue;
        q.people = q.people.map((v, k) => (v * old + p.people[k] * m) / (old + m));
        q.faith = q.faith.map((v, k) => (v * old + p.faith[k] * m) / (old + m));
        q.pop += m;
        p.pop -= m;
    }
    for (const c of sim.realms) {
        if (!c.alive)
            continue;
        const atWar = sim.wars.some(w => !w.ended && (w.a === c.id || w.b === c.id)), policy = c.policy;
        const militaryShare = policy === 'Expansion' ? .31 : policy === 'Scholarship' ? .16 : .21, research = policy === 'Scholarship' ? .24 : .09, upkeep = c.army * .11 + c.navy * .19 + c.arcana * .35;
        const maintenance = c.income * (.34 + research), delta = c.income - upkeep - maintenance;
        c.treasury = clamp(c.treasury + delta, 0, c.income * 18 + 40);
        const desired = c.population / 1000 * (policy === 'Expansion' ? .024 : .014) * (.6 + c.stability / 160), afford = clamp((c.income - upkeep * .65) / Math.max(1, c.income), .1, 1);
        c.army = Math.max(.2, c.army + (desired - c.army) * .07 * afford - (delta < 0 ? c.army * .055 : 0));
        c.navy = clamp(c.navy + (c.coastProvinces ? militaryShare * c.income * .014 : 0) - c.navy * .008, 0, 40);
        const diffusion = .001 * Math.max(0, 1.5 - c.tech);
        c.tech = clamp(c.tech + research * .07 * (.65 + c.ore) + diffusion, .4, 5);
        c.arcana = clamp(c.arcana + research * .075 * (.2 + c.mana) * (c.treasury > 1 ? 1 : .2), .2, 5);
        c.warWeariness = clamp(c.warWeariness + (atWar ? 2.5 : -3), 0, 100);
        const st = 82 - c.unrest * .23 - c.warWeariness * .38 + Math.min(6, c.treasury / Math.max(1, c.income)) + (policy === 'Concord' ? 5 : 0) - (c.foodRatio < .9 ? (1 - c.foodRatio) * 25 : 0);
        c.stability = clamp(c.stability + (st - c.stability) * .15, 12, 98);
    }
    aggregateRealms(sim);
    const connections = realmConnections(sim);
    // Diplomacy depends on interests, past injuries and domestic choices. Faith is only a small term.
    for (const [key, edge] of connections) {
        const A = sim.realms[edge.a], B = sim.realms[edge.b], r = cRelation(sim, A.id, B.id);
        if (!A.alive || !B.alive || warBetween(sim, A.id, B.id))
            continue;
        const sharedEnemy = sim.wars.some(x => !x.ended && [x.a, x.b].includes(A.id) && sim.wars.some(y => !y.ended && [y.a, y.b].includes(B.id) && [x.a, x.b].some(z => z !== A.id && [y.a, y.b].includes(z))));
        const target = 18 + (r.trade ? 17 : 0) + (r.alliance ? 20 : 0) + (A.faith === B.faith ? 5 : 0) + (A.policy === 'Concord' || B.policy === 'Concord' ? 8 : 0) + (sharedEnemy ? 22 : 0) - r.grievance * .7 - (edge.land ? (A.ambition + B.ambition) * 9 : 0);
        r.score = clamp(r.score + (target - r.score) * .045 + (rng() - .5) * 4, -100, 100);
        r.grievance *= .985;
        if (!r.trade && r.score > 22 && rng() < .14) {
            r.trade = true;
            logEvent(sim, 'trade', `${A.name} and ${B.name} open ${edge.sea ? 'a protected sea lane' : 'a land trade corridor'}. Surplus food and revenue can now cross their frontier.`, [A.id, B.id]);
        }
        if (!r.alliance && r.score > 45 && rng() < .085) {
            r.alliance = true;
            r.trade = true;
            r.since = sim.year;
            logEvent(sim, 'alliance', `${A.name} and ${B.name} sign a defensive pact.`, [A.id, B.id]);
        }
        if (r.alliance && r.score < 8) {
            r.alliance = false;
            logEvent(sim, 'diplomacy', `${A.name} and ${B.name} dissolve their defensive pact.`, [A.id, B.id]);
        }
    }
    // Autonomous war proposals are restricted to actual land or sea contacts.
    for (const A of sim.realms) {
        if (!A.alive || A.stability < 43 || A.warWeariness > 38 || sim.wars.some(x => !x.ended && x.a === A.id))
            continue;
        if (rng() > sim.options.conflict * (.008 + A.ambition * .035 + (A.policy === 'Expansion' ? .026 : 0)))
            continue;
        let best = null, value = -Infinity;
        for (const [key, edge] of connections) {
            if (edge.a !== A.id && edge.b !== A.id)
                continue;
            const b = edge.a === A.id ? edge.b : edge.a, B = sim.realms[b], r = cRelation(sim, A.id, b);
            if (r.alliance || r.truceUntil > sim.year || warBetween(sim, A.id, b) || !B.alive || (!edge.land && A.navy < 3))
                continue;
            const ratio = A.power / Math.max(1, B.power), v = ratio + (r.grievance * .016) - r.score * .006 + (edge.land ? .3 : -.5);
            if (ratio > .8 && v > value) {
                value = v;
                best = B;
            }
        }
        if (best && value > .9)
            startWar(sim, A.id, best.id, A.foodRatio < 1 ? 'access to food and trade routes' : A.policy === 'Expansion' ? 'a dynastic territorial claim' : 'competing frontier claims');
    }
    // One local campaign per active war-year. Allies lend bounded defensive support.
    for (const war of sim.wars) {
        if (war.ended)
            continue;
        const A = sim.realms[war.a], B = sim.realms[war.b];
        if (!A.alive || !B.alive) {
            endWar(sim, war, 'a settlement after the fall of a court');
            continue;
        }
        const edge = realmConnections(sim).get(cPair(A.id, B.id));
        if (!edge) {
            endWar(sim, war, 'a disengagement agreement');
            continue;
        }
        if (rng() < .25)
            continue;
        const reverse = rng() < .28, attacker = reverse ? B : A, defender = reverse ? A : B;
        let fronts = [];
        for (const pair of edge.fronts) {
            const p = sim.provinces[pair[0]], q = sim.provinces[pair[1]];
            fronts.push(p.owner === attacker.id ? [p, q] : [q, p]);
        }
        if (!fronts.length && attacker.navy >= 3)
            for (const pair of edge.routes) {
                const p = sim.provinces[pair[0]], q = sim.provinces[pair[1]];
                fronts.push(p.owner === attacker.id ? [p, q] : [q, p]);
            }
        if (!fronts.length)
            continue;
        const [source, target] = fronts[Math.floor(rng() * fronts.length)], cap = sim.provinces[attacker.capital], distance = Math.hypot(cap.x - source.x, cap.y - source.y);
        const supply = clamp(1 - distance / 250, .45, 1) * (edge.land ? 1 : .62), fort = 1 + target.altitude / 5800 + target.forest * .14 + target.wet * .27 + (defender.capital === target.id ? .2 : 0);
        let support = 0;
        const supporters = [];
        for (const r of Object.values(sim.relations)) {
            if (!r.alliance || (r.a !== defender.id && r.b !== defender.id))
                continue;
            const ally = sim.realms[r.a === defender.id ? r.b : r.a];
            if (!ally?.alive || warBetween(sim, ally.id, defender.id))
                continue;
            if (realmConnections(sim).has(cPair(ally.id, defender.id))) {
                support += ally.power * .10;
                supporters.push(ally.id);
            }
        }
        support = Math.min(support, defender.power * .45);
        const atk = attacker.power * supply * (.7 + rng() * .65), def = (defender.power + support) * fort * (.7 + rng() * .65);
        const attackerLoss = attacker.army * (.025 + rng() * .035), defenderLoss = defender.army * (.02 + rng() * .04);
        attacker.army = Math.max(.15, attacker.army - attackerLoss);
        defender.army = Math.max(.15, defender.army - defenderLoss);
        source.pop = Math.max(0, source.pop - attackerLoss * 160);
        target.pop = Math.max(0, target.pop - defenderLoss * 170);
        attacker.treasury = Math.max(0, attacker.treasury - attacker.income * .12);
        defender.treasury = Math.max(0, defender.treasury - defender.income * .09);
        war.battles++;
        sim.totalBattles++;
        if (atk > def * 1.06 && rng() < .64) {
            takeProvince(sim, target, attacker.id, defender.id, war.reason);
            war.score += attacker.id === war.a ? 1 : -1;
        }
        else if (war.battles % 2 === 1)
            logEvent(sim, 'battle', `${defender.name} holds the approaches to ${target.name}${supporters.length ? ' with allied support' : ''}. Both armies suffer losses.`, [attacker.id, defender.id], { province: target.id, supply, fort, supporters });
        if (sim.year - war.start > 5 && (rng() < .24 || A.warWeariness > 40 || B.warWeariness > 40) || Math.abs(war.score) > 4)
            endWar(sim, war, 'a negotiated ceasefire');
    }
    // Historical accidents modify persistent state, rather than just generating flavor text.
    const alive = sim.realms.filter(c => c.alive);
    if (alive.length && rng() < .42) {
        const c = alive[Math.floor(rng() * alive.length)], p = sim.provinces[c.provinces[Math.floor(rng() * c.provinces.length)]], roll = rng();
        if (roll < .22) {
            p.harvest = .62;
            p.unrest = clamp(p.unrest + 9, 0, 100);
            c.treasury = Math.max(0, c.treasury - c.income * .23);
            logEvent(sim, 'drought', `A poor harvest in ${p.name} draws on ${c.name}'s reserves and raises local unrest.`, [c.id], { province: p.id });
        }
        else if (roll < .43) {
            c.tech = Math.min(5, c.tech + .07);
            c.treasury += c.income * .13;
            logEvent(sim, 'discovery', `${p.name}'s workshops improve irrigation and craft methods. ${c.name} gains knowledge and revenue.`, [c.id]);
        }
        else if (roll < .64) {
            c.arcana = Math.min(5, c.arcana + .10);
            c.treasury = Math.max(0, c.treasury - c.income * .12);
            logEvent(sim, 'magic', `Scholars in ${p.name} stabilize a new magical technique. The research strengthens ${c.name}'s arcane institutions at a financial cost.`, [c.id]);
        }
        else if (roll < .80) {
            c.stability = Math.max(20, c.stability - 11);
            c.ambition = clamp(c.ambition + (rng() - .5) * .22, .1, .95);
            logEvent(sim, 'succession', `A leadership succession unsettles ${c.name}. The new court revises its ambitions.`, [c.id]);
        }
        else {
            c.treasury += c.income * .38;
            p.dev = Math.min(2.5, p.dev + .05);
            logEvent(sim, 'prosperity', `A market fair in ${p.name} boosts trade and local development.`, [c.id]);
        }
    }
    // Secession creates a real polity only under sustained local strain.
    if (sim.realms.length < 128) {
        for (const p of sim.provinces) {
            const old = sim.realms[p.owner];
            if (!old?.alive || old.provinces.length < 4 || p.occupation > 0 || p.unrest < 62 || rng() > .022)
                continue;
            const id = sim.realms.length, c = { ...old, id, name: p.name, title: 'Free State of ' + p.name, color: REALM_COLORS[id % REALM_COLORS.length], capital: p.id, gov: 6, faith: cDominant(p.faith), originPeople: cDominant(p.people), policy: 'Concord', ambition: .35, identity: 'A secession born from local unrest. The new government inherits the resident population, beliefs and economic constraints.', army: Math.max(1, old.army * .08), navy: 0, treasury: old.treasury * .06, stability: 57, warWeariness: 0, alive: true, founded: sim.year, provinces: [] };
            RealmNames.assign(sim, c, { baseId: old.nameOrigin?.baseId });
            old.army *= .92;
            old.treasury *= .94;
            p.owner = id;
            p.unrest = 30;
            sim.realms.push(c);
            sim.totalSplits++;
            logEvent(sim, 'secession', `${p.name} breaks from ${old.name} and establishes ${c.title}.`, [old.id, id]);
            break;
        }
    }
    aggregateRealms(sim);
    // Inaccessible or eliminated wars cannot stay open forever.
    for (const war of sim.wars)
        if (!war.ended && sim.year - war.start > 17)
            endWar(sim, war, 'an exhaustion peace');
    sim.lastDemography = { growth: births, shortageLoss: starvation };
    recordHistory(sim);
    return sim;
}
function recordHistory(sim) { for (const p of sim.provinces) {
    p.urbanPop = Math.min(p.urbanPop, p.pop);
    p.ruralPop = p.pop - p.urbanPop;
} const alive = sim.realms.filter(c => c.alive); sim.history.push({ year: sim.year, population: sim.provinces.reduce((a, p) => a + p.pop, 0), realms: alive.length, wars: sim.wars.filter(w => !w.ended).length, alliances: Object.values(sim.relations).filter(r => r.alliance && sim.realms[r.a]?.alive && sim.realms[r.b]?.alive).length, leaders: alive.slice().sort((a, b) => b.strength - a.strength).slice(0, 3).map(c => c.id), borderChanges: sim.totalConquests }); if (sim.history.length > 1200)
    sim.history.shift(); }
function civilizationAction(sim, action, a, b, value) {
    const A = sim.realms[a];
    if (!A?.alive)
        return { ok: false, message: 'Select a living realm.' };
    if (action === 'policy') {
        A.policy = value;
        logEvent(sim, 'policy', `${A.name} adopts a ${value.toLowerCase()} policy.`, [a]);
        return { ok: true, message: 'Policy changed. Its budget and diplomatic effects apply over subsequent years.' };
    }
    if (action === 'faith') {
        A.faith = +value;
        logEvent(sim, 'reform', `${A.name} recognizes ${FAITHS[A.faith].name} as its state tradition. The population is not instantly converted.`, [a]);
        return { ok: true, message: 'State tradition changed; local beliefs remain and evolve through contact.' };
    }
    if (action === 'rename') {
        const v = String(value).trim().slice(0, 65);
        if (!v)
            return { ok: false, message: 'A realm needs a name.' };
        A.name = v;
        A.title = v;
        A.namedFor = 'custom';
        A.nameOrigin = null;
        return { ok: true, message: 'Realm renamed.' };
    }
    if (action === 'war')
        return startWar(sim, a, b, 'a player-directed claim', true);
    if (action === 'alliance') {
        if (!sim.realms[b]?.alive || a === b)
            return { ok: false, message: 'Choose another living realm.' };
        const r = cRelation(sim, a, b);
        if (warBetween(sim, a, b))
            return { ok: false, message: 'Negotiate peace before proposing an alliance.' };
        if (r.score < 15)
            return { ok: false, message: 'The offer is declined: relations are too poor. Use rapprochement or wait for shared interests.' };
        r.alliance = true;
        r.trade = true;
        r.score = Math.max(58, r.score);
        r.since = sim.year;
        logEvent(sim, 'alliance', `${A.name} and ${sim.realms[b].name} sign a player-brokered defensive alliance.`, [a, b]);
        return { ok: true, message: 'Alliance signed; connected allies can provide limited defensive support.' };
    }
    if (action === 'rapprochement') {
        if (!sim.realms[b]?.alive || a === b)
            return { ok: false, message: 'Choose another living realm.' };
        const price = Math.max(3, A.income * .3);
        if (A.treasury < price)
            return { ok: false, message: 'The treasury cannot fund this delegation.' };
        A.treasury -= price;
        const r = cRelation(sim, a, b);
        r.score = clamp(r.score + 18, -100, 100);
        r.grievance = Math.max(0, r.grievance - 8);
        logEvent(sim, 'diplomacy', `${A.name} funds a diplomatic delegation to ${sim.realms[b].name}.`, [a, b]);
        return { ok: true, message: 'Relations improve at a treasury cost.' };
    }
    if (action === 'peace') {
        const war = warBetween(sim, a, b);
        if (!war)
            return { ok: false, message: 'These realms are not at war.' };
        endWar(sim, war, 'a player-brokered peace');
        return { ok: true, message: 'Peace signed with a nine-year truce.' };
    }
    return { ok: false, message: 'Unknown action.' };
}
function auditCivilization(sim, w) {
    let invalidOwners = 0, badShares = 0, badPop = 0, badCapitals = 0, waterClaims = 0, routeErrors = 0;
    for (const p of sim.provinces) {
        if (p.owner >= sim.realms.length || p.owner < -1)
            invalidOwners++;
        if (!Number.isFinite(p.pop) || p.pop < 0)
            badPop++;
        for (const a of [p.people, p.faith])
            if (a.some(v => !Number.isFinite(v) || v < 0) || Math.abs(a.reduce((s, v) => s + v, 0) - 1) > 1e-5)
                badShares++;
    }
    for (const c of sim.realms)
        if (c.alive && sim.provinces[c.capital]?.owner !== c.id)
            badCapitals++;
    for (let i = 0; i < GN; i++)
        if (w.provinceId[i] >= 0 && (w.height[i] <= 0 || w.lake[i] > 0))
            waterClaims++;
    for (const r of sim.routes)
        for (const i of r.path)
            if (w.height[i] > 0)
                routeErrors++;
    return { invalidOwners, badShares, badPop, badCapitals, waterClaims, routeErrors, finiteRealms: sim.realms.every(c => Number.isFinite(c.power + c.treasury + c.population + c.tech + c.arcana)), year: sim.year };
}
