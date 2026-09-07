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
function generateCity(w, sim, provinceId, design = {}) {
    const p = sim.provinces[provinceId];
    if (!p || !p.settled || p.urbanPop < 650)
        throw Error('City detail requires an existing village or town.');
    const recipe = TownCatalog.resolve(w, sim, p, design), profile = TownCatalog.styles.find(t => t.id === recipe.style);
    const seed = seedHash(`${w.params.seed}/city/${p.i}/v9/${TownCatalog.signature(recipe)}`), rng = random32(seed);
    const n = 81, width = 152, depth = 124, span = 7.8, nn = n * n;
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
            for (let dy = -8; dy <= 8; dy++)
                for (let dx = -8; dx <= 8; dx++) {
                    const xx = x + dx, yy = y + dy;
                    if (xx >= 0 && xx < n && yy >= 0 && yy < n)
                        distanceRoad[yy * n + xx] = Math.min(distanceRoad[yy * n + xx], Math.hypot(dx * width / (n - 1), dy * depth / (n - 1)));
                }
        }
    const lots = [];
    for (let y = 4; y < n - 4; y++)
        for (let x = 4; x < n - 4; x++) {
            const k = y * n + x, q = city.xy(k);
            if (city.water[k] || city.road[k] || city.slope[k] > .8 || distanceRoad[k] < 1.4 || distanceRoad[k] > 11)
                continue;
            const d = Math.hypot(q.x - city.market.x, q.z - city.market.z);
            if (d > 57)
                continue;
            lots.push({ k, rank: rng() * .9 + d / 100 + city.wet[k] * .2 });
        }
    lots.sort((a, b) => a.rank - b.rank);
    const target = cityClamp(Math.round(80 + Math.sqrt(Math.max(0, p.detailSupport ?? p.urbanSupport)) * .55), 80, 280);
    const used = [];
    let infill=false;
    function buildingAt(k, type, landmark = false, precinctSize = 3) {
        const q = city.xy(k), ww = landmark ? precinctSize : infill ? 2.4+rng()*.9 : (4.0 + rng() * (1.8 + recipe.variety)) * profile.scale, dd = landmark ? precinctSize : infill ? 2.6+rng()*.8 : (4.2 + rng() * (1.9 + recipe.variety)) * profile.scale;
        // A precinct must fit wholly on dry road-free ground, not merely at its corners.
        if (ww > 3 || dd > 3) {
            for (let dx = -ww / 2; dx <= ww / 2; dx += 1) for (let dz = -dd / 2; dz <= dd / 2; dz += 1) {
                const j = city.index(q.x + dx, q.z + dz);
                if (city.water[j] || city.environment.ice[j]>25 || city.environment.snow[j]>.5 || city.road[j] || city.slope[j] > .9) return null;
            }
        }
        const a = 0; // Footprints remain aligned to local surveyed blocks; organic roads cut across them.
        for (const dx of [-ww / 2, 0, ww / 2])
            for (const dz of [-dd / 2, 0, dd / 2]) {
                const j = city.index(q.x + dx, q.z + dz);
                if (city.water[j] || city.environment.ice[j]>25 || city.environment.snow[j]>.5 || city.road[j] || city.slope[j] > .9)
                    return null;
            }
        if (used.some(b => Math.abs(b.x - q.x) < (b.w + ww) / 2 + .28 * profile.spacing && Math.abs(b.z - q.z) < (b.d + dd) / 2 + .28 * profile.spacing))
            return null;
        const district = city.districts.reduce((best, d) => { const dis = Math.hypot(d.x - q.x, d.z - q.z); return dis < best.dist ? { d, dist: dis } : best; }, { d: city.districts[0], dist: Infinity }).d;
        const actual = type || (['garden', 'market', 'civic', 'temple', 'academy', 'harbor'].includes(district.type) ? 'home' : district.type);
        const h = landmark ? (actual === 'academy' ? 10 : actual === 'temple' ? 7 : actual === 'civic' ? 7 : 3.2) : 1.5 + rng() * 2.3;
        const b = { id: `b${city.buildings.length}`, name: landmark ? ({ civic: 'The Council Keep', temple: 'Sanctuary of Many Lamps', academy: 'The Meridian Collegium', market: 'The Covered Exchange', granary: 'The Public Granary', workshop: 'The Guildhall', harbor: 'Harbormaster House' }[actual] || 'Landmark') : `${district.name} · Court ${district.buildings + 1}`, type: actual, ...q, w: ww, d: dd, h, y: city.height[k], angle: a, district: district.id, landmark, condition: 1, infill };
        used.push(b);
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
    for (const lot of lots) {
        if (city.buildings.length >= target)
            break;
        buildingAt(lot.k, null, false);
    }
    // Fine-grained frontage fills gaps left between civic compounds. Every new
    // footprint passes the same land, road and collision tests; no new population.
    infill=true;
    for(const lot of lots){if(city.buildings.length>=Math.min(300,target*2.1))break;buildingAt(lot.k,'home',false);}
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
    for (let k = 0; k < 1700; k++) {
        const x = (rng() - .5) * width * .95, z = (rng() - .5) * depth * .95, i = city.index(x, z);
        if (city.water[i] || city.road[i] || distanceRoad[i] < 1.2 || used.some(b => Math.abs(b.x - x) < b.w / 2 + 1.3 && Math.abs(b.z - z) < b.d / 2 + 1.3))
            continue;
        const d = Math.hypot(x - city.market.x, z - city.market.z);
        if (d < (profile.id === 'forest' ? 6 : 16) || city.environment.ice[i]>5 || city.environment.snow[i]>.2 || rng()>city.environment.treeDensity[i])
            continue;
        city.trees.push({ x, z, y: city.height[i], h: 2 + rng() * 2.1, kind: CityEnvironment.treeKind(city.environment,i) });
    }
    for (let k = 0; k < 100; k++) {
        const x = (rng() - .5) * width * .85, z = (rng() - .5) * depth * .85, i = city.index(x, z), d = Math.hypot(x - city.market.x, z - city.market.z);
        if (d < 42 || d > 68 || city.water[i] || city.slope[i] > .18 || city.road[i] || city.environment.farm[i]<.2 || city.environment.ice[i]>1 || city.environment.snow[i]>.1 || city.environment.temperature[i]<3)
            continue;
        if (used.some(b => Math.hypot(b.x - x, b.z - z) < 7))
            continue;
        const fw = 4 + rng() * 5, fd = 3 + rng() * 4;
        if ([[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([a, b]) => city.water[city.index(x + a * fw / 2, z + b * fd / 2)]))
            continue;
        city.farms.push({ x, z, y: city.height[i], w: fw, d: fd });
    }
    // Historical precinct walls protect the old core; gaps are gates or open waterfronts.
    const wallRadius = 20;
    for (let k = 0; k < (profile.wall ? 76 : 0); k++) {
        const a = k / 76 * Math.PI * 2, b = (k + 1) / 76 * Math.PI * 2, A = { x: city.market.x + Math.cos(a) * wallRadius, z: city.market.z + Math.sin(a) * wallRadius * .85 }, B = { x: city.market.x + Math.cos(b) * wallRadius, z: city.market.z + Math.sin(b) * wallRadius * .85 }, i = city.index(A.x, A.z), j = city.index(B.x, B.z);
        if (city.water[i] || city.water[j] || distanceRoad[i] < 2.5 || distanceRoad[j] < 2.5 || city.buildings.some(v => cityPointSegment(v, A, B) < Math.max(v.w, v.d) * .7))
            continue;
        city.walls.push({ a: A, b: B, y: Math.max(city.height[i], city.height[j]) });
    }
    city.connectors = [];
    const roadSites = [];
    for (let k=0;k<nn;k++) if (city.road[k]) roadSites.push({i:k,...city.xy(k)});
    for(const b of city.buildings) {
        let best=null;
        for(const q of roadSites) {
            const dx=q.x-b.x,dz=q.z-b.z;
            const px=b.x+cityClamp(dx,-b.w/2-.08,b.w/2+.08), pz=b.z+cityClamp(dz,-b.d/2-.08,b.d/2+.08);
            const dist=Math.hypot(q.x-px,q.z-pz);
            if(best&&dist>=best.dist)continue;
            let valid=true;
            for(let t=0;t<=1;t+=.1){const x=lerp(px,q.x,t),z=lerp(pz,q.z,t);if(city.water[city.index(x,z)]||city.buildings.some(v=>v!==b&&Math.abs(v.x-x)<v.w/2+.08&&Math.abs(v.z-z)<v.d/2+.08)){valid=false;break}}
            if(valid)best={dist,a:{x:px,z:pz},b:q};
        }
        if(best&&best.dist<12){b.streetSocket=best.b.i;b.angle=Math.round(Math.atan2(-(best.b.x-b.x),best.b.z-b.z)/(Math.PI/2))*(Math.PI/2);city.connectors.push({blockId:b.id,...best});}
    }
    city.buildings = city.buildings.filter(b=>b.streetSocket!=null);
    city.landmarks = city.buildings.filter(b=>b.landmark).map(b=>b.id);
    for(const d of city.districts)d.buildings=city.buildings.filter(b=>b.district===d.id).length;
    // Masonry foundations support each footprint; they do not flatten its terrain.
    for(const b of city.buildings){let lo=Infinity,hi=-Infinity;for(const x of[-b.w/2,0,b.w/2])for(const z of[-b.d/2,0,b.d/2]){const h=city.height[city.index(b.x+x,b.z+z)];lo=Math.min(lo,h);hi=Math.max(hi,h)}b.foundationBed=lo;b.y=Math.max(b.y,hi+.07);}
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
