/**
 * City detail is a deterministic refinement of an EXISTING settlement.
 * Parent geography is read-only. This is a cartographic diorama, not cadastral GIS:
 * streets/buildings are newly synthesized below the resolution of the planet grid.
 * @typedef {{x:number,z:number}} CityPoint
 * @typedef {{id:string,type:string,name:string,x:number,z:number,w:number,d:number,h:number,
 *   y:number,angle:number,district:number,landmark:boolean,condition:number}} CityBuilding
 */
const CITY_TYPES = {
    home: { label: 'Residential courts', color: '#c49c79', description: 'Shared courtyards, homes and small neighborhood trades.' },
    market: { label: 'Market & exchange', color: '#d2b06f', description: 'The existing hinterland supports a central exchange; it does not create unlimited food.' },
    workshop: { label: 'Artisan quarter', color: '#a18472', description: 'Workshops draw on local labor, ore, timber and established market access.' },
    temple: { label: 'Sacred precinct', color: '#c9c9ba', description: 'A public sanctuary; the local population still retains its mixture of faiths.' },
    academy: { label: 'Collegium gardens', color: '#9a91b0', description: 'A study precinct supported by local arcane resources and public investment.' },
    harbor: { label: 'Waterfront exchange', color: '#81a8ad', description: 'A waterfront following actual parent-world water. Coastal access is not drinking water.' },
    civic: { label: 'Council hill', color: '#b8b58a', description: 'Government halls overlook the town; political ownership may change without moving the streets.' },
    garden: { label: 'Orchards & commons', color: '#99af84', description: 'Unbuilt land, managed gardens and paths around the settled core.' }
};
const cityClamp = (v, a, b) => Math.max(a, Math.min(b, v));
function cityBilinear(field, x, y) {
    x = cityClamp(x, 0, GW - 1);
    y = cityClamp(y, 0, GH - 1);
    const a = Math.floor(x), b = Math.floor(y), u = x - a, v = y - b;
    const at = (xx, yy) => field[Math.min(GH - 1, yy) * GW + Math.min(GW - 1, xx)];
    return lerp(lerp(at(a, b), at(a + 1, b), u), lerp(at(a, b + 1), at(a + 1, b + 1), u), v);
}
function cityHash(value) { let h = 2166136261; for (const c of value) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
} return (h >>> 0).toString(16); }
/** A uniform bucket grid. Footprint collision and street-socket search are otherwise
 * quadratic in the block count, which a several-hundred-compound town cannot afford.
 * Items are filed under every cell their box covers, so an overlapping query box always
 * shares a cell with them; `near` may repeat an item, which callers only re-test. */
function cityGrid(cell) {
    const map = new Map();
    const span = (x0, z0, x1, z1, fn) => { for (let z = Math.floor(z0 / cell); z <= Math.floor(z1 / cell); z++) for (let x = Math.floor(x0 / cell); x <= Math.floor(x1 / cell); x++) fn(x + ',' + z); };
    return {
        add(item, x0, z0, x1, z1) { span(x0, z0, x1, z1, k => { let a = map.get(k); if (!a) map.set(k, a = []); a.push(item); }); },
        near(x0, z0, x1, z1) { const out = []; span(x0, z0, x1, z1, k => { const a = map.get(k); if (a) for (const v of a) out.push(v); }); return out; }
    };
}
/** Distance, in parent cells, to the nearest other settlement that can also be detailed. */
function cityReach(sim, p) {
    let best = Infinity;
    for (const q of sim.provinces)
        if (q.id !== p.id && q.settled && q.urbanPop >= 650)
            best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    return best;
}
function generateCity(w, sim, provinceId, design = {}) {
    const p = sim.provinces[provinceId];
    if (!p || !p.settled || p.urbanPop < 650)
        throw Error('City detail requires an existing village or town.');
    const recipe = TownCatalog.resolve(w, sim, p, design), profile = TownCatalog.styles.find(t => t.id === recipe.style);
    const seed = seedHash(`${w.params.seed}/city/${p.i}/v13/${TownCatalog.signature(recipe)}`), rng = random32(seed);
    // Footprint is limited by the room the site actually has. The built disc reaches
    // 0.375*span parent cells, so a close neighbour keeps this town from growing into it.
    // width/depth track span, leaving on-atlas building size unchanged; only extent grows.
    // The divisor is what makes two neighbours read as separate places rather than one
    // sprawl: at 1.16 a town's edge keeps a gap of roughly half its own diameter, which is
    // the separation the fixed-7.8 atlas had. Sizing merely to avoid overlap is far too
    // tight — the discs miss each other and the map still looks like a conurbation.
    const span = cityClamp(cityReach(sim, p) / 1.16, 6.4, 10.5), grow = span / 7.8;
    // n stays ODD: the context grid keys its inner hole on (n-1)/2 and the centre sample
    // must land exactly on the parent cell, neither of which survives an even grid.
    const n = 111, width = 152 * grow, depth = 124 * grow, nn = n * n;
    const city = { version: 3, seed, townRecipe: recipe, townProfile: profile, provinceId, name: p.name, n, width, depth, span, center: [p.x, p.y],
        height: new Float32Array(nn), water: new Uint8Array(nn), waterKind: new Uint8Array(nn),
        slope: new Float32Array(nn), wet: new Float32Array(nn), road: new Uint8Array(nn),
        roads: [], buildings: [], districts: [], trees: [], farms: [], piers: [], walls: [], landmarks: [],
        source: { worldSeed: w.params.seed, cell: p.i, biome: w.biome[p.i], fresh: p.fresh, harbor: p.harbor,
            lake: p.siteLake || p.lake, river: p.siteRiver || 0, altitude: w.height[p.i], provinceMeanAltitude: p.altitude, mana: p.mana,
            latitude: w.lat[p.i], temperature: w.temp[p.i], urbanSupport: p.urbanSupport,
            note: 'Parent terrain sampled without modification. Streets and buildings are deterministic invented detail; symbols and distances are not to scale.' } };
    city.xy = k => ({ x: (k % n / (n - 1) - .5) * width, z: (Math.floor(k / n) / (n - 1) - .5) * depth });
    city.index = (x, z) => cityClamp(Math.round((z / depth + .5) * (n - 1)), 0, n - 1) * n + cityClamp(Math.round((x / width + .5) * (n - 1)), 0, n - 1);
    const bedCenter=w.height[p.i],elevate=h=>3+11*Math.asinh((h-bedCenter)/2300);
    city.environment=CityEnvironment.createGrid(n);
    city.siteEnvironment=CityEnvironment.profile(w,p);
    city.source.setting=city.siteEnvironment.label;
    city.source.environmentVersion=CityEnvironment.version;
    city.source.parentWorldCell=p.i;
    // The full local environment crosses the scale boundary, not only height/water.
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const k=y*n+x,gx=p.x+(x/(n-1)-.5)*span,gy=p.y+(y/(n-1)-.5)*span*depth/width;
        const e=CityEnvironment.sample(w,gx,gy);
        CityEnvironment.write(city.environment,k,e);
        city.water[k]=e.water;city.waterKind[k]=e.waterKind;
        city.height[k]=elevate(e.surface);city.wet[k]=e.wetness;
    }
    city.environment.signature=CityEnvironment.hash(city.environment);
    city.source.environmentSignature=city.environment.signature;
    city.context=CityEnvironment.context(w,p,city,elevate);
    CityEnvironment.refineContextRivers(w,p,city);
    city.source.contextSignature=city.context.signature;
    // Rivers at this scale are centerline refinements of parent drainage segments.
    // Do not invent a river merely because a city would look attractive next to one.
    city.rivers = [];
    for (let yy = Math.max(0, p.y - 6); yy <= Math.min(GH - 1, p.y + 6); yy++)
        for (let xx = Math.max(0, p.x - 6); xx <= Math.min(GW - 1, p.x + 6); xx++) {
            const i = yy * GW + xx, j = w.down[i];
            if (j < 0 || w.height[i] <= 0 || w.lake[i] > 0 || w.flow[i] < w.riverThreshold * .6)
                continue;
            const from = { x: (xx - p.x) / span * width, z: (yy - p.y) / span * width }, to = { x: (j % GW - p.x) / span * width, z: (Math.floor(j / GW) - p.y) / span * width };
            if (Math.abs(from.x) > width * .65 || Math.abs(from.z) > depth * .65)
                continue;
            const r = { a: from, b: to, width: cityClamp(Math.log1p(w.flow[i] / w.riverThreshold) * .8, .45, 2) };
            city.rivers.push(r);
            for (let k = 0; k < nn; k++) {
                if (city.water[k])
                    continue;
                const q = city.xy(k);
                if (cityPointSegment(q, r.a, r.b) < r.width) {
                    city.water[k] = 1;
                    city.waterKind[k] = 3;
                    city.height[k] -= .32;
                }
            }
        }
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
            const k = y * n + x;
            city.slope[k] = Math.max(Math.abs(city.height[y * n + Math.min(n - 1, x + 1)] - city.height[y * n + Math.max(0, x - 1)]), Math.abs(city.height[Math.min(n - 1, y + 1) * n + x] - city.height[Math.max(0, y - 1) * n + x]));
        }
    // Short bridges may cross modeled rivers, never entire seas or lakes.
    const passable = k => (!city.water[k] || city.waterKind[k] === 3) && !city.citadelReserve?.[k];
    const candidates = [];
    for (let y = 4; y < n - 4; y++)
        for (let x = 4; x < n - 4; x++) {
            const k = y * n + x;
            if (city.water[k] || city.environment.ice[k]>25 || city.environment.snow[k]>.5 || city.slope[k] > .95)
                continue;
            const q = city.xy(k);
            candidates.push({ k, score: Math.hypot(q.x, q.z) * .16 + city.slope[k] * 15 + city.wet[k] * 4 });
        }
    candidates.sort((a, b) => a.score - b.score);
    if (!candidates.length)
        throw Error('No locally buildable patch at this settlement.');
    const center = candidates[0].k;
    city.marketIndex = center;
    city.market = city.xy(center);
    // Keep this town within the dry/river-bridge-connected local component.
    // Other shores require a real ferry simulation, not an invented road over water.
    const connected = new Uint8Array(nn), queue = new Int32Array(nn);
    let head=0,tail=0;connected[center]=1;queue[tail++]=center;
    while(head<tail){const k=queue[head++],x=k%n,y=Math.floor(k/n);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const xx=x+dx,yy=y+dy;if(xx<2||xx>=n-2||yy<2||yy>=n-2)continue;const j=yy*n+xx;if(connected[j]||!passable(j)||(dx&&dy&&(!passable(y*n+xx)||!passable(yy*n+x))))continue;connected[j]=1;queue[tail++]=j;}}
    for(let i=candidates.length-1;i>=0;i--)if(!connected[candidates[i].k])candidates.splice(i,1);
    if(typeof FortressPlan!=='undefined'){
        FortressPlan.reserve(city,candidates,p);
        if(city.citadelSite)for(let j=candidates.length-1;j>=0;j--)if(city.citadelReserve[candidates[j].k])candidates.splice(j,1);
    }
    function route(start, goal) {
        const dist = new Float64Array(nn).fill(Infinity), parent = new Int32Array(nn).fill(-1), heap = new MinHeap();
        dist[start] = 0;
        heap.push(start, 0);
        while (heap.length) {
            const [k, d] = heap.pop();
            if (d > dist[k] + 1e-7)
                continue;
            if (k === goal)
                break;
            const x = k % n, y = Math.floor(k / n);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 2 || xx >= n - 2 || yy < 2 || yy >= n - 2)
                    continue;
                const j = yy * n + xx;
                if (!passable(j))
                    continue;
                if (dx && dy && (!passable(y * n + xx) || !passable(yy * n + x)))
                    continue;
                const cost = Math.hypot(dx, dy) * (1 + Math.abs(city.height[j] - city.height[k]) * 6 + city.wet[j] * 1.2 + (city.water[j] ? 14 : 0)) * (city.road[j] ? .66 : 1);
                if (d + cost < dist[j]) {
                    dist[j] = d + cost;
                    parent[j] = k;
                    heap.push(j, d + cost);
                }
            }
        }
        if (!Number.isFinite(dist[goal]))
            return [];
        let nodes = [], i = goal;
        while (i !== start && i >= 0) {
            nodes.push(i);
            i = parent[i];
        }
        nodes.push(start);
        return nodes.reverse();
    }
    const hubs = TownGrammar.plan(city, profile, rng, candidates, route);
    if(city.citadelSite){
        const a=city.citadelSite,goals=[];
        for(const [x,z]of[[a.x,a.z+a.d/2+3],[a.x-a.w/2-3,a.z],[a.x+a.w/2+3,a.z],[a.x,a.z-a.d/2-3]]){
            const i=city.index(x,z);if(passable(i))goals.push(i);
        }
        goals.sort((a,b)=>Math.hypot(city.xy(a).x-city.market.x,city.xy(a).z-city.market.z)-Math.hypot(city.xy(b).x-city.market.x,city.xy(b).z-city.market.z));
        for(const goal of goals){const nodes=route(center,goal);if(nodes.length<2)continue;nodes.forEach(i=>city.road[i]=1);city.roads.push({kind:'arterial',nodes,points:nodes.map(i=>({...city.xy(i),y:city.height[i]+.13,bridge:!!city.water[i]}))});a.gateway=goal;break;}
    }
    // Gate roads. FortressPlan grows its wall approaches outward from the street network,
    // and a fully built-out town leaves no gap to do that after the fact. Four radials to
    // the rim of the buildable disc keep those corridors open, and read as highways besides.
    // Their outer shoulders are withheld from lots: a street alone is not a corridor, since
    // blocks pack right up against it and seal the perimeter again.
    city.gateReserve = new Uint8Array(nn);
    for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2 + .4, tx = city.market.x + Math.cos(a) * width * .36, tz = city.market.z + Math.sin(a) * depth * .36;
        const goal = candidates.reduce((best, c0) => { const q = city.xy(c0.k), v = Math.hypot(q.x - tx, q.z - tz) + city.slope[c0.k] * 9; return v < best.v ? { k: c0.k, v } : best; }, { k: -1, v: Infinity });
        if (goal.k < 0) continue;
        const nodes = route(center, goal.k);
        if (nodes.length < 2) continue;
        nodes.forEach(i => city.road[i] = 1);
        city.roads.push({ kind: 'arterial', nodes, points: nodes.map(i => ({ ...city.xy(i), y: city.height[i] + .13, bridge: !!city.water[i] })), role: 'gate-road' });
        for (const i of nodes) {
            const q = city.xy(i);
            if (Math.hypot(q.x - city.market.x, q.z - city.market.z) < width * .17)
                continue;
            for (let dz = -3.6; dz <= 3.6; dz += 1.2) for (let dx = -3.6; dx <= 3.6; dx += 1.2) {
                const j = city.index(q.x + dx, q.z + dz);
                if (dx * dx + dz * dz <= 12.96 && !city.citadelReserve?.[j])
                    city.gateReserve[j] = 1;
            }
        }
    }
    const shore = [];
    for (const c of candidates) {
        const k = c.k;
        if ([k - 1, k + 1, k - n, k + n].some(j => city.water[j] && (city.waterKind[j] === 1 || city.waterKind[j] === 2)))
            shore.push(k);
    }
    const distinct = ['market', 'civic', 'temple', profile.id === 'arcane' || p.mana > .52 ? 'academy' : 'workshop', 'home', 'garden'];
    const districtSeeds = [center, ...hubs.slice(1)];
    for (let k = 0; k < distinct.length; k++) {
        const i = city.planSockets.roles[distinct[k]] ?? districtSeeds[Math.min(districtSeeds.length - 1, k * 2)], q = city.xy(i);
        city.districts.push({ id: k, type: distinct[k], name: profile.districts[k] || CITY_TYPES[distinct[k]].label, ...q, buildings: 0 });
    }
    if (shore.length) {
        const i = shore.reduce((a, b) => { const q = city.xy(a), r = city.xy(b); return Math.hypot(q.x - city.market.x, q.z - city.market.z) < Math.hypot(r.x - city.market.x, r.z - city.market.z) ? a : b; });
        const q = city.xy(i);
        city.districts.push({ id: city.districts.length, type: 'harbor', name: city.waterKind[[i - 1, i + 1, i - n, i + n].find(j => city.water[j])] === 2 ? 'Lakefront quarter' : 'Harbor quarter', ...q, buildings: 0 });
    }
    const distanceRoad = new Float32Array(nn).fill(999);
    for (let k = 0; k < nn; k++)
        if (city.road[k]) {
            const x = k % n, y = Math.floor(k / n);
            for (let dy = -10; dy <= 10; dy++)
                for (let dx = -10; dx <= 10; dx++) {
                    const xx = x + dx, yy = y + dy;
                    if (xx >= 0 && xx < n && yy >= 0 && yy < n)
                        distanceRoad[yy * n + xx] = Math.min(distanceRoad[yy * n + xx], Math.hypot(dx * width / (n - 1), dy * depth / (n - 1)));
                }
        }
    const lots = [];
    for (let y = 4; y < n - 4; y++)
        for (let x = 4; x < n - 4; x++) {
            const k = y * n + x, q = city.xy(k);
            if (city.water[k] || city.road[k] || city.gateReserve[k] || city.slope[k] > .8 || distanceRoad[k] < 1.4 || distanceRoad[k] > 11)
                continue;
            const d = Math.hypot(q.x - city.market.x, q.z - city.market.z);
            if (d > width * .375)
                continue;
            // Concentric, not random: sequential placement in random order saturates near 45%
            // occupancy, which is what kept these towns thin. The hash only breaks ties.
            lots.push({ k, rank: d / 100 + city.wet[k] * .2 + ((Math.imul(k, 2654435761) >>> 0) % 997) / 1e6 });
        }
    lots.sort((a, b) => a.rank - b.rank);
    const target = cityClamp(Math.round(120 + Math.sqrt(Math.max(0, p.detailSupport ?? p.urbanSupport)) * 1.05), 120, 620);
    const used = [], usedGrid = cityGrid(8);
    let infill=false;
    const blocked = j => city.water[j] || city.environment.ice[j] > 25 || city.environment.snow[j] > .5 || city.road[j] || city.gateReserve[j] || city.slope[j] > .9;
    // `plot` is an explicitly surveyed parcel: position and both dimensions decided by the
    // caller. Without it the old behaviour stands, a near-square footprint on a lot cell.
    function buildingAt(k, type, landmark = false, precinctSize = 3, shrink = 1, plot = null) {
        const q = plot ? { x: plot.x, z: plot.z } : city.xy(k), seat = plot ? city.index(q.x, q.z) : k;
        // The interior passes take whatever the frontage ranks left behind, so their
        // footprints are drawn small and unevenly: a near-square 4-6 block only ever fitted
        // in open ground, which is exactly the ground the frontage has already taken.
        const ww = plot ? plot.w : landmark ? precinctSize : (infill ? 2.2+rng()*1.1 : (2.4 + rng() * (3.6 + recipe.variety * 2.2)) * profile.scale) * shrink,
            dd = plot ? plot.d : landmark ? precinctSize : (infill ? 2.4+rng()*1.0 : (2.8 + rng() * (4.8 + recipe.variety * 2.6)) * profile.scale) * shrink;
        // A precinct must fit wholly on dry road-free ground, not merely at its corners.
        if (ww > 3 || dd > 3) {
            for (let dx = -ww / 2; dx <= ww / 2; dx += 1) for (let dz = -dd / 2; dz <= dd / 2; dz += 1)
                if (blocked(city.index(q.x + dx, q.z + dz))) return null;
        }
        const a = 0; // Footprints remain aligned to local surveyed blocks; organic roads cut across them.
        for (const dx of [-ww / 2, 0, ww / 2])
            for (const dz of [-dd / 2, 0, dd / 2])
                if (blocked(city.index(q.x + dx, q.z + dz)))
                    return null;
        // Party walls, not garden walls. The old .28 clearance around every block is most of
        // why half the buildable ground stayed empty; the style's spacing still separates an
        // airy woodland town from a tight courtyard one, just at a fraction of the width.
        const gap = .05 + .30 * (profile.spacing - .8);
        if (usedGrid.near(q.x - ww / 2 - gap, q.z - dd / 2 - gap, q.x + ww / 2 + gap, q.z + dd / 2 + gap).some(b => Math.abs(b.x - q.x) < (b.w + ww) / 2 + gap && Math.abs(b.z - q.z) < (b.d + dd) / 2 + gap))
            return null;
        const district = city.districts.reduce((best, d) => { const dis = Math.hypot(d.x - q.x, d.z - q.z); return dis < best.dist ? { d, dist: dis } : best; }, { d: city.districts[0], dist: Infinity }).d;
        const actual = type || (['garden', 'market', 'civic', 'temple', 'academy', 'harbor'].includes(district.type) ? 'home' : district.type);
        const h = landmark ? (actual === 'academy' ? 10 : actual === 'temple' ? 7 : actual === 'civic' ? 7 : 3.2) : 1.5 + rng() * 2.3;
        const b = { id: `b${city.buildings.length}`, name: landmark ? ({ civic: 'The Council Keep', temple: 'Sanctuary of Many Lamps', academy: 'The Meridian Collegium', market: 'The Covered Exchange', granary: 'The Public Granary', workshop: 'The Guildhall', harbor: 'Harbormaster House' }[actual] || 'Landmark') : `${district.name} · Court ${district.buildings + 1}`, type: actual, ...q, w: ww, d: dd, h, y: city.height[seat], angle: a, district: district.id, landmark, condition: 1, infill };
        used.push(b);
        usedGrid.add(b, b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2);
        TownGrammar.moduleFor(city, b, rng);
        city.buildings.push(b);
        district.buildings++;
        if (landmark)
            city.landmarks.push(b.id);
        return b;
    }
    if(city.citadelSite&&city.citadelSite.gateway!=null){
        const a=city.citadelSite,b=buildingAt(a.k,a.sacred?'temple':'civic',true,a.w);
        if(b){b.y=a.deck;b.foundationBed=a.bed;b.precinct=true;b.sacred=!!a.sacred;b.name=a.sacred?p.name+' · Grand Sanctuary':'The High Citadel';b.h=a.sacred?44:13;city.primaryMonumentId=b.id;}
    }
    for (const d of city.districts.filter(d => d.type !== 'home' && d.type !== 'garden' && !city.buildings.some(b=>b.precinct&&b.type===d.type))) {
        const sorted = lots.slice().sort((a, b) => Math.hypot(city.xy(a.k).x - d.x, city.xy(a.k).z - d.z) - Math.hypot(city.xy(b.k).x - d.x, city.xy(b.k).z - d.z));
        // Reserve a real civic precinct before allocating household plots.
        // The natural terrain and existing road network remain untouched.
        const major = profile.id === 'basilica' ? 'temple' : profile.id === 'arcane' ? 'academy' : 'civic';
        const sizes = ['civic', 'temple', 'academy'].includes(d.type) ? (d.type === major ? [18, 16, 14, 12, 10, 8, 6] : [12, 10, 8, 6]) : d.type === 'harbor' ? [10, 8, 6, 4] : [8, 6, 4];
        let placed = false;
        for (const size of sizes) {
            for (const lot of sorted) {
                if (buildingAt(lot.k, d.type, true, size)) { placed = true; break; }
            }
            if (placed) break;
        }
    }
    // STREET FRONTAGE. A dense town is a subdivision of the ground along its streets: a
    // narrow face on the road, a deep plot running back from it, party walls with the
    // neighbours. Scattering free-standing near-squares over a lot band is what left half
    // the buildable ground empty and gave every block the same shape. Walking each street
    // side in order is what makes a terrace form, because the collision test then seats
    // each plot immediately after the one before it.
    const frontages = [];
    for (let k = 0; k < nn; k++) {
        if (!city.road[k]) continue;
        const x = k % n, y = Math.floor(k / n), q = city.xy(k);
        if (Math.hypot(q.x - city.market.x, q.z - city.market.z) > width * .375) continue;
        let ex = 0, ez = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dz;
            if (xx >= 0 && xx < n && yy >= 0 && yy < n && city.road[yy * n + xx]) { ex += Math.abs(dx); ez += Math.abs(dz); }
        }
        for (const side of [-1, 1]) frontages.push({ k, x, y, alongX: ex >= ez, side });
    }
    // One row per street side, nearest row first so the core fills before the outskirts.
    const rows = new Map();
    for (const f of frontages) {
        const key = (f.alongX ? 'x' : 'z') + f.side + ':' + (f.alongX ? f.y : f.x), q = city.xy(f.k);
        let row = rows.get(key);
        if (!row) rows.set(key, row = { key, items: [], near: Infinity });
        row.near = Math.min(row.near, Math.hypot(q.x - city.market.x, q.z - city.market.z));
        row.items.push(f);
    }
    const streetRows = [...rows.values()].sort((a, b) => a.near - b.near || (a.key < b.key ? -1 : 1));
    for (const row of streetRows) row.items.sort((a, b) => a.alongX ? a.x - b.x : a.y - b.y);
    const SETBACK = 1.0;
    // Two ranks. The first is the street frontage itself. The second is the rear tenements
    // behind it: same street, but the plot probes outward until it clears the row in front,
    // which is what turns a lined street into a solid quarter instead of a hollow block.
    for (const rank of [
        { front: [1.9, 4.0], deep: [4.2, 8.0], probe: [0], taper: [1, .8, .62, .46, .34] },
        { front: [1.8, 3.4], deep: [2.6, 4.6], probe: [0, 1.7, 3.4, 5.1, 6.8, 8.5, 10.2], taper: [1, .74, .52] }
    ]) {
        for (const row of streetRows) {
            if (city.buildings.length >= target) break;
            for (const f of row.items) {
                if (city.buildings.length >= target) break;
                const q = city.xy(f.k);
                // Frontage and depth are drawn independently, so plots range from a narrow
                // burgage strip to a broad hall instead of clustering on one square shape.
                const front = (rank.front[0] + rng() * (rank.front[1] + recipe.variety * 2.6)) * profile.scale;
                // Bounded against the frontage: a plot far longer than it is wide has no sane
                // building to put on it, and the block kit cannot fill that shape either.
                const deep = cityClamp((rank.deep[0] + rng() * (rank.deep[1] + recipe.variety * 3.2)) * profile.scale, front * .55, front * 4.4);
                const nx = f.alongX ? 0 : f.side, nz = f.alongX ? f.side : 0;
                let seated = false;
                for (const back of rank.probe) {
                    // A shallower plot still fits where the block behind is thin.
                    for (const t of rank.taper) {
                        const dd = deep * t, off = SETBACK + back + dd / 2;
                        const cx = q.x + nx * off, cz = q.z + nz * off;
                        if (Math.hypot(cx - city.market.x, cz - city.market.z) > width * .375) continue;
                        if (buildingAt(f.k, null, false, 3, 1, { x: cx, z: cz, w: f.alongX ? front : dd, d: f.alongX ? dd : front })) { seated = true; break; }
                    }
                    if (seated) break;
                }
            }
        }
    }
    for (const lot of lots) {
        if (city.buildings.length >= target)
            break;
        // The landmark size ladder above, applied to ordinary blocks: a corner plot that
        // cannot take a full compound still takes a smaller one.
        for (const size of [1, .82, .66])
            if (buildingAt(lot.k, null, false, 3, size))
                break;
    }
    // Fine-grained frontage fills gaps left between civic compounds. Every new
    // footprint passes the same land, road and collision tests; no new population.
    infill=true;
    for(const lot of lots){if(city.buildings.length>=Math.min(760,target*2.1))break;buildingAt(lot.k,'home',false);}
    infill=false;
    // A granary and public well are selected from dry, road-served existing lots.
    const ordinary = city.buildings.filter(b => !b.landmark).sort((a, b) => Math.hypot(a.x - city.market.x, a.z - city.market.z) - Math.hypot(b.x - city.market.x, b.z - city.market.z));
    if (ordinary[0]) {
        Object.assign(ordinary[0], { type: 'granary', name: 'Public Grain House', landmark: true, h: 3.6 });
        city.landmarks.push(ordinary[0].id);
    }
    if (ordinary[6] && p.fresh > .3) {
        Object.assign(ordinary[6], { type: 'well', name: 'The Common Cistern', landmark: true, h: .9 });
        city.landmarks.push(ordinary[6].id);
    }
    for (const k of shore.filter((_, j) => j % 16 === 0).slice(0, 7)) {
        const q = city.xy(k), j = [k - 1, k + 1, k - n, k + n].find(j => city.water[j] && city.waterKind[j] !== 3);
        if (j == null)
            continue;
        const a = city.xy(j), dx = a.x - q.x, dz = a.z - q.z, end = { x: q.x + dx * 3, z: q.z + dz * 3 };
        if (city.water[city.index(end.x, end.z)])
            city.piers.push({ a: q, b: end, y: Math.max(city.height[k], city.height[j]) + .35 });
    }
    for (let k = 0, trees = Math.round(1700 * grow * grow); k < trees; k++) {
        const x = (rng() - .5) * width * .95, z = (rng() - .5) * depth * .95, i = city.index(x, z);
        if (city.water[i] || city.road[i] || distanceRoad[i] < 1.2 || used.some(b => Math.abs(b.x - x) < b.w / 2 + 1.3 && Math.abs(b.z - z) < b.d / 2 + 1.3))
            continue;
        const d = Math.hypot(x - city.market.x, z - city.market.z);
        if (d < (profile.id === 'forest' ? 6 : 16) * grow || city.environment.ice[i]>5 || city.environment.snow[i]>.2 || rng()>city.environment.treeDensity[i])
            continue;
        city.trees.push({ x, z, y: city.height[i], h: 2 + rng() * 2.1, kind: CityEnvironment.treeKind(city.environment,i) });
    }
    for (let k = 0, plots = Math.round(100 * grow * grow); k < plots; k++) {
        const x = (rng() - .5) * width * .85, z = (rng() - .5) * depth * .85, i = city.index(x, z), d = Math.hypot(x - city.market.x, z - city.market.z);
        if (d < 42 * grow || d > 68 * grow || city.water[i] || city.slope[i] > .18 || city.road[i] || city.environment.farm[i]<.2 || city.environment.ice[i]>1 || city.environment.snow[i]>.1 || city.environment.temperature[i]<3)
            continue;
        if (used.some(b => Math.hypot(b.x - x, b.z - z) < 7))
            continue;
        const fw = 4 + rng() * 5, fd = 3 + rng() * 4;
        if ([[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([a, b]) => city.water[city.index(x + a * fw / 2, z + b * fd / 2)]))
            continue;
        city.farms.push({ x, z, y: city.height[i], w: fw, d: fd });
    }
    // Historical precinct walls protect the old core; gaps are gates or open waterfronts.
    const wallRadius = 20 * grow;
    for (let k = 0; k < (profile.wall ? 76 : 0); k++) {
        const a = k / 76 * Math.PI * 2, b = (k + 1) / 76 * Math.PI * 2, A = { x: city.market.x + Math.cos(a) * wallRadius, z: city.market.z + Math.sin(a) * wallRadius * .85 }, B = { x: city.market.x + Math.cos(b) * wallRadius, z: city.market.z + Math.sin(b) * wallRadius * .85 }, i = city.index(A.x, A.z), j = city.index(B.x, B.z);
        if (city.water[i] || city.water[j] || distanceRoad[i] < 2.5 || distanceRoad[j] < 2.5 || city.buildings.some(v => cityPointSegment(v, A, B) < Math.max(v.w, v.d) * .7))
            continue;
        city.walls.push({ a: A, b: B, y: Math.max(city.height[i], city.height[j]) });
    }
    city.connectors = [];
    const roadGrid = cityGrid(12), blockGrid = cityGrid(8);
    for (let k=0;k<nn;k++) if (city.road[k]) { const q = {i:k,...city.xy(k)}; roadGrid.add(q, q.x, q.z, q.x, q.z); }
    for (const b of city.buildings) blockGrid.add(b, b.x-b.w/2-.09, b.z-b.d/2-.09, b.x+b.w/2+.09, b.z+b.d/2+.09);
    for(const b of city.buildings) {
        let best=null;
        // A socket beyond 12 is rejected below anyway, so only that neighbourhood is searched.
        for(const q of roadGrid.near(b.x-b.w/2-12,b.z-b.d/2-12,b.x+b.w/2+12,b.z+b.d/2+12)) {
            const dx=q.x-b.x,dz=q.z-b.z;
            const px=b.x+cityClamp(dx,-b.w/2-.08,b.w/2+.08), pz=b.z+cityClamp(dz,-b.d/2-.08,b.d/2+.08);
            const dist=Math.hypot(q.x-px,q.z-pz);
            if(best&&dist>=best.dist)continue;
            let valid=true;
            for(let t=0;t<=1;t+=.1){const x=lerp(px,q.x,t),z=lerp(pz,q.z,t);if(city.water[city.index(x,z)]||blockGrid.near(x,z,x,z).some(v=>v!==b&&Math.abs(v.x-x)<v.w/2+.08&&Math.abs(v.z-z)<v.d/2+.08)){valid=false;break}}
            if(valid)best={dist,a:{x:px,z:pz},b:q};
        }
        if(best&&best.dist<12){b.streetSocket=best.b.i;b.angle=Math.round(Math.atan2(-(best.b.x-b.x),best.b.z-b.z)/(Math.PI/2))*(Math.PI/2);city.connectors.push({blockId:b.id,...best});}
    }
    city.buildings = city.buildings.filter(b=>b.streetSocket!=null);
    city.landmarks = city.buildings.filter(b=>b.landmark).map(b=>b.id);
    for(const d of city.districts)d.buildings=city.buildings.filter(b=>b.district===d.id).length;
    // Masonry foundations support each footprint; they do not flatten its terrain.
    for(const b of city.buildings){let lo=Infinity,hi=-Infinity;for(const x of[-b.w/2,0,b.w/2])for(const z of[-b.d/2,0,b.d/2]){const h=city.height[city.index(b.x+x,b.z+z)];lo=Math.min(lo,h);hi=Math.max(hi,h)}b.foundationBed=lo;b.y=Math.max(b.y,hi+.07);}
    // Fidelity is bought against a triangle budget rather than granted to every block.
    // The core keeps full joinery, the outskirts fall back to massed volumes, and a
    // larger town simply gets a smaller detailed core instead of a larger download.
    // A citadel or grand sanctuary is a large fixed cost, so the blocks make room for it.
    const monument = city.buildings.find(b => b.precinct);
    const LOD_COST = [1600, 3200, 7600], LOD_BUDGET = 950000 - (monument?.sacred ? 340000 : monument ? 140000 : 0);
    const graded = city.buildings.filter(b => !b.landmark).sort((a, b) => Math.hypot(a.x - city.market.x, a.z - city.market.z) - Math.hypot(b.x - city.market.x, b.z - city.market.z));
    const spare = Math.max(0, LOD_BUDGET - LOD_COST[0] * graded.length);
    const full = Math.min(graded.length, Math.floor(spare * .62 / (LOD_COST[2] - LOD_COST[0])));
    const mid = Math.min(graded.length - full, Math.floor(spare * .38 / (LOD_COST[1] - LOD_COST[0])));
    graded.forEach((b, k) => { b.lod = k < full ? 2 : k < full + mid ? 1 : 0; });
    for (const b of city.buildings)
        if (b.landmark)
            b.lod = 2;
    city.lod = { full, mid, plain: graded.length - full - mid, estimate: graded.reduce((n, b) => n + LOD_COST[b.lod], 0) };
    if(typeof FortressPlan!=='undefined')FortressPlan.build(city);
    city.blocks = city.buildings.filter(b=>!b.landmark).map(b=>({id:b.id,template:b.module,district:b.district,components:b.components,streetSocket:b.streetSocket??null,x:b.x,z:b.z,width:b.w,depth:b.d}));
    const weights = { home: 0, workshop: 0, market: 0, temple: 0, academy: 0, harbor: 0, civic: 0, garden: 0 };
    for (const d of city.districts)
        weights[d.type] += d.buildings;
    city.stats = { modules: city.buildings.filter(b=>!b.landmark).length, structures: city.buildings.reduce((n,b)=>n+(b.components||1),0), grammar: profile.plan, buildings: city.buildings.length, landmarks: city.landmarks.length, streets: city.roads.length, districts: city.districts.length, waterPercent: city.water.reduce((a, b) => a + b, 0) / nn * 100, bridges: city.roads.reduce((a, r) => a + r.points.filter(p => p.bridge).length, 0), piers: city.piers.length, weights };
    city.fingerprint = cityHash(JSON.stringify({ recipe: TownCatalog.signature(city.townRecipe), center: city.center, roads: city.roads.map(r => r.nodes), buildings: city.buildings.map(b => [b.id, b.x, b.z, b.w, b.d, b.type]) }));
    return city;
}
function cityPointSegment(p, a, b) { const dx = b.x - a.x, dz = b.z - a.z, t = cityClamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz); }
function auditCity(city) {
    let iceBuildings=0,wetBuildings = 0, roadBuildings = 0, overlaps = 0, nonfinite = 0, seaRoads = 0;
    for (const b of city.buildings) {
        if (![b.x, b.z, b.w, b.d, b.h, b.y].every(Number.isFinite))
            nonfinite++;
        for (const x of [-b.w / 2, 0, b.w / 2])
            for (const z of [-b.d / 2, 0, b.d / 2]) {
                const i = city.index(b.x + x, b.z + z);
                if(city.environment?.ice[i]>25||city.environment?.snow[i]>.5)iceBuildings++;
                if (city.water[i])
                    wetBuildings++;
                if (city.road[i])
                    roadBuildings++;
            }
    }
    for (let i = 0; i < city.buildings.length; i++)
        for (let j = i + 1; j < city.buildings.length; j++) {
            const a = city.buildings[i], b = city.buildings[j];
            if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2)
                overlaps++;
        }
    for (const r of city.roads)
        for (const i of r.nodes)
            if (city.waterKind[i] === 1 || city.waterKind[i] === 2)
                seaRoads++;
    return { iceBuildings,wetBuildings, roadBuildings, overlaps, nonfinite, seaRoads, buildings: city.buildings.length };
}
