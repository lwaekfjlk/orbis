/* TELLURIC / Deterministic, qualitative world generation.
 * A kinematic plate-boundary model, not a time-stepped mantle simulation.
 * Climate outputs are relative indices; the model has not been calibrated.
 */
'use strict';
const GW = 300, GH = 180, GN = GW * GH, MAP_X = 168, MAP_Z = 98;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const wrap = x => (x % GW + GW) % GW, cell = (x, y) => Math.max(0, Math.min(GH - 1, y | 0)) * GW + wrap(x | 0);
function seedHash(s) { let a = 2166136261; for (let i = 0; i < s.length; i++) {
    a ^= s.charCodeAt(i);
    a = Math.imul(a, 16777619);
} return a >>> 0; }
function random32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, y, s) { let a = Math.floor(x), b = Math.floor(y), u = x - a, v = y - b; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); return lerp(lerp(hash2(a, b, s), hash2(a + 1, b, s), u), lerp(hash2(a, b + 1, s), hash2(a + 1, b + 1, s), u), v) * 2 - 1; }
function fbm(x, y, s, n = 4) { let v = 0, a = .57; for (let k = 0; k < n; k++) {
    v += a * noise(x, y, s + k * 239);
    a *= .5;
    x = x * 2.07 + 3.1;
    y = y * 2.03 - 7.7;
} return v; }
// Base ground colours. These are the CATEGORY colour only; CityEnvironment.cellColor
// grades each cell inside its own biome by temperature and aridity. The cold and the
// warm forests are deliberately far apart here: at #6b8c7c and #548668 they differed
// by less than the shading noise, so a boreal and a tropical province read the same.
const BIOME = [
    ['Open ocean', '#a4caca'], ['Persistent snow', '#e8ebe4'], ['Tundra', '#9fa89b'], ['Cold desert', '#c1b79f'],
    ['Sand desert', '#ddab5f'], ['Dry steppe', '#c0b273'], ['Savanna', '#b0b062'], ['Temperate forest', '#6f9a6a'],
    ['Boreal forest', '#4e7f7a'], ['Temperate rainforest', '#4b8a6c'], ['Monsoon woodland', '#8ba354'],
    ['Tropical rainforest', '#3d7f4c'], ['Alpine meadow', '#9a9c86'], ['Rock desert', '#b79e81'], ['Salt basin', '#e4d2b0'], ['Lake', '#7cbbbb'], ['Glacier / ice sheet', '#d9eff0'], ['Sea ice', '#c8e7e9'], ['Freshwater marsh', '#679a8d'], ['Mangrove wetland', '#3f7c60'], ['Floodplain meadow', '#93ac75'],
    // 21-22 close the gap between "Temperate forest" and "Tropical rainforest". Every
    // humid cell from 7 to 21 C was called temperate, so a laurel forest at 19 C and a
    // beech wood at 11 C carried the same two words and grew the same tree. Appended,
    // never inserted: the indices above are written into saves and into every biome
    // test in this repo.
    ['Subtropical laurel forest', '#57906a'], ['Subtropical dry woodland', '#9aa863']
];
const BOUNDARY = { 1: 'Continental collision', 2: 'Subduction margin', 3: 'Oceanic island arc', 4: 'Divergent boundary', 5: 'Transform boundary' };
const PLATE_NAMES = ['Aurelian', 'Vesper', 'Boreal', 'Nacre', 'Cinder', 'Thalassic', 'Orison', 'Sable', 'Pelagic', 'Veyran', 'Crown', 'Morrow', 'Istrian', 'Eldwyn', 'Lacuna', 'Umbra', 'Nival', 'Caldera', 'Serene', 'Brass', 'Halcyon', 'Mistral', 'Tamar', 'Astral', 'Coralline', 'Meridian', 'Fallow', 'Caelian', 'Ember', 'Obsidian'];
const nextFrame = () => new Promise(r => setTimeout(r, 0));
// Normal to the same warped, weighted distance field that assigns plate cells.
// Its positive direction is from A's side (distance A < B) towards B's side.
function plateNormalV3(A, B, x, y, seed, ox, oy) {
    const difference = (x, y) => {
        const xx = x + noise(x * .032 + ox, y * .032 + oy, seed + 80) * 4.1;
        const yy = y + noise(x * .032 - oy, y * .032 + ox, seed + 180) * 4.1;
        return ((xx - A.x) ** 2 + (yy - A.y) ** 2) / A.scale ** 2 - ((xx - B.x) ** 2 + (yy - B.y) ** 2) / B.scale ** 2;
    };
    const dx = difference(x + .05, y) - difference(x - .05, y), dy = difference(x, y + .05) - difference(x, y - .05);
    const length = Math.hypot(dx, dy);
    if (length > 1e-12) return { nx: dx / length, ny: dy / length };
    const fallback = Math.hypot(B.x - A.x, B.y - A.y);
    return { nx: (B.x - A.x) / fallback, ny: (B.y - A.y) / fallback };
}
function plateCrustV3(w, id, x, y, nx, ny, sign, fallback) {
    // Near a curved margin or triple junction, a long normal can cross a third
    // plate. Only inspect crust that actually belongs to the requested side.
    for (const distance of [6, 4, 2, 1]) {
        const i = cell(Math.round(x + nx * distance * sign), Math.round(y + ny * distance * sign));
        if (w.plate[i] === id) return w.crust[i];
    }
    return w.crust[fallback];
}
function compressionFieldV3(collision) {
    const field = new Float32Array(GN);
    // Crustal thickening spans neighbouring cells instead of copying the narrow
    // suture. A normalized spatial average supplies one shared regional support.
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        let total = 0, weight = 0;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
            const xx = x + dx, yy = y + dy;if (xx < 0 || xx >= GW || yy < 0 || yy >= GH) continue;
            const a = 1 / (1 + (dx * dx + dy * dy) / 8);
            total += collision[yy * GW + xx] * a;weight += a;
        }
        field[y * GW + x] = total / weight;
    }
    return field;
}
function compressionRiseV3(w, i, amplitude) {
    return amplitude * Math.max(0, w.params.uplift) / 1.2 * Math.sqrt(Math.max(0, w.compressionSupport[i]));
}
function compressionAxisV3(w, x, y, fallback) {
    let xx = 0, xy = 0, weight = 0;
    for (const b of w.boundaries) {
        if (b.type !== 1) continue;
        const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;if (d2 > 196) continue;
        const a = b.closing * Math.exp(-d2 / 64);
        xx += a * (b.nx * b.nx - b.ny * b.ny);xy += a * 2 * b.nx * b.ny;weight += a;
    }
    return weight ? .5 * Math.atan2(xy, xx) + Math.PI / 2 : fallback;
}
async function generateWorld(p, progress = async () => { }) {
    p = { continents: 6, islands: 1.2, temperature: 0, glaciation: 1.2, ...p };
    const s = seedHash(p.seed), arr = () => new Float32Array(GN);
    let rnd = random32(s);
    let w = { params: JSON.parse(JSON.stringify(p)), seed: s, height: arr(), base: arr(), crust: arr(), collision: arr(), arc: arr(), rift: arr(), fault: arr(), trench: arr(), stress: arr(), lat: arr(), area: arr(), plate: new Uint8Array(GN), boundaryType: new Uint8Array(GN), boundaryId: new Int32Array(GN).fill(-1), plates: [], boundaries: [], volcanoes: [], hotspots: [], features: [], totalArea: 0 };
    await progress('01 / Reading the lithosphere');
    // Continental separation is an explicit world-design prior, not the number of plates.
    // Named provinces may cross plates. Ocean corridors keep adjacent nuclei apart.
    const ox = rnd() * 200, oy = rnd() * 200;
    const layouts = {
        global: [[.19, .30, .177, .245, -.24], [.255, .655, .19, .24, .30], [.705, .235, .205, .20, -.25], [.805, .565, .155, .19, .18], [.56, .70, .15, .22, -.30], [.34, .92, .265, .090, .04], [.51, .075, .115, .061, 0]],
        crown: [[.18, .30, .17, .23, -.2], [.26, .68, .18, .24, .35], [.68, .27, .19, .22, -.25], [.80, .64, .14, .20, .25], [.54, .73, .12, .18, -.4], [.38, .925, .24, .075, 0], [.48, .085, .105, .062, 0]],
        rift: [[.22, .38, .215, .34, -.20], [.72, .48, .235, .32, .16], [.38, .83, .14, .105, .1], [.60, .075, .15, .06, 0]],
        isles: [[.15, .28, .13, .16, -.2], [.30, .64, .125, .20, .25], [.61, .24, .15, .19, -.4], [.81, .55, .12, .145, 0], [.59, .71, .12, .17, .25], [.27, .91, .22, .065, 0], [.78, .085, .11, .06, 0]],
        pangaea: [[.38, .38, .24, .27, -.25], [.57, .60, .26, .30, .5], [.65, .27, .17, .13, .1], [.23, .70, .12, .18, -.3], [.44, .91, .22, .07, 0]]
    };
    let chosen = (layouts[p.form] || layouts.global).map(a => a.slice());
    if (p.form === 'global') {
        if (p.continents < 6)
            chosen = chosen.filter((a, k) => k < p.continents - 1 || k === 5 || k === 6);
        if (p.continents > 6)
            chosen.push([.92, .82, .060, .10, .4]);
    }
    const lobes = chosen.map((a, k) => a.map((v, j) => j < 2 ? v + (rnd() - .5) * (k >= 5 ? .012 : .018) : j < 4 ? v * (.93 + rnd() * .13) : v + (rnd() - .5) * .25));
    w.provinces = lobes.map((l, k) => ({ id: k, center: l.slice(0, 2), shape: l.slice(2) }));
    w.continentalProvinceId = new Int16Array(GN);
    w.separation = new Float32Array(GN);
    w.islandOrigin = new Uint8Array(GN);
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = y * GW + x, u = x / (GW - 1), v = y / (GH - 1), wx = u + .032 * fbm(u * 8 + ox, v * 8 + oy, s + 7), wy = v + .036 * fbm(u * 8 - oy, v * 8 + ox, s + 19);
            let best = -10, second = -10, pid = 0;
            for (let k = 0; k < lobes.length; k++) {
                const [cx, cy, rx, ry, a] = lobes[k], dx = wx - cx, dy = wy - cy, c = Math.cos(a), sn = Math.sin(a), xx = (dx * c - dy * sn) / rx, yy = (dx * sn + dy * c) / ry;
                // Two overlapping lobes within a province create shoulders and peninsulas.
                const theta = Math.atan2(yy, xx), scallop = 1 + .20 * Math.sin(theta * 3 + k * 1.73) + .10 * Math.cos(theta * 5 + k * .91), bayAngle = k * 2.13 + .7;
                const f = Math.max(Math.exp(-(xx * xx + yy * yy) * 1.15 * scallop), .84 * Math.exp(-((xx - .26) ** 2 * 1.6 + (yy + .32) ** 2 * .9) * 1.65)) - .29 * Math.exp(-((xx - Math.cos(bayAngle) * .70) ** 2 / .055 + (yy - Math.sin(bayAngle) * .66) ** 2 / .14));
                if (f > best) {
                    second = best;
                    best = f;
                    pid = k;
                }
                else
                    second = Math.max(second, f);
            }
            let f = best - .46 + fbm(u * 17 + ox, v * 17 + oy, s + 300) * .14 + fbm(u * 47, v * 47, s + 97) * .066 - p.sea * .006;
            const gap = p.form === 'pangaea' ? 0 : clamp((.16 - (best - second)) / .16) * clamp((second - .12) / .20);
            f -= gap * .43;
            const edge = Math.min(u, 1 - u);
            f -= Math.max(0, .025 - edge) * 6;
            w.separation[i] = gap;
            w.continentalProvinceId[i] = pid;
            w.crust[i] = f;
            w.base[i] = f > 0 ? 80 + 1450 * Math.pow(clamp(f / .50), 1.7) + 100 * fbm(x * .047, y * .047, s + 8) : -85 - 4550 * Math.pow(clamp(-f / .5), .78);
            w.height[i] = w.base[i];
            w.lat[i] = 86 - 172 * y / (GH - 1);
            w.area[i] = Math.cos(w.lat[i] * Math.PI / 180);
            w.totalArea += w.area[i];
        }
    // Disconnected continental shelf fragments originate near eroded/drowned margins.
    // They are not volcanoes. Their positions are sampled only from the shelf field.
    const shelfCandidates = [];
    for (let y = 5; y < GH - 5; y += 2)
        for (let x = 5; x < GW - 5; x += 2) {
            const i = cell(x, y);
            if (w.crust[i] > -.22 && w.crust[i] < -.085 && w.separation[i] < .25 && rnd() < .13 * p.islands)
                shelfCandidates.push({ x, y, i });
        }
    shelfCandidates.sort((a, b) => hash2(a.x, a.y, s + 129) - hash2(b.x, b.y, s + 129));
    const fragments = [];
    for (const c of shelfCandidates) {
        if (fragments.some(a => Math.hypot(a.x - c.x, a.y - c.y) < 5.5))
            continue;
        fragments.push(c);
        if (fragments.length > 52 * p.islands)
            break;
        const rad = 1.15 + rnd() * .85, top = 150 + rnd() * 500, baseAtCenter = w.base[c.i];
        for (let y = Math.max(1, c.y - 5); y <= Math.min(GH - 2, c.y + 5); y++)
            for (let x = Math.max(1, c.x - 5); x <= Math.min(GW - 2, c.x + 5); x++) {
                const i = cell(x, y), d2 = (x - c.x) ** 2 + (y - c.y) ** 2, h = w.base[i] + (top - baseAtCenter) * Math.exp(-d2 / (rad * rad));
                if (h > w.base[i]) {
                    w.base[i] = h;
                    w.height[i] = h;
                    if (h > 0)
                        w.islandOrigin[i] = 1;
                }
            }
    }
    rnd = random32(s + 711); // Independent plate stream: island-count edits do not move plates.
    // Best-candidate seed placement produces irregular plates of comparable size.
    for (let k = 0; k < p.plates; k++) {
        let best = null, bestD = -1;
        for (let t = 0; t < (k < p.plates * .78 ? 36 : 7); t++) {
            const x = 8 + rnd() * (GW - 16), y = 8 + rnd() * (GH - 16);
            let d = Infinity;
            for (const a of w.plates)
                d = Math.min(d, Math.hypot(x - a.x, y - a.y));
            if (d > bestD) {
                bestD = d;
                best = { x, y };
            }
        }
        let angle = rnd() * Math.PI * 2, speed = .45 + rnd() * .8;
        if (p.motion && p.motion[k] != null)
            angle += p.motion[k];
        w.plates.push({ ...best, id: k, name: PLATE_NAMES[(k + (s % 7)) % PLATE_NAMES.length], vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 20 + rnd() * 150, angle, speed, scale: k < p.plates * .78 ? .90 + rnd() * .22 : .56 + rnd() * .14, land: 0, cells: 0 });
    }
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = y * GW + x, xx = x + noise(x * .032 + ox, y * .032 + oy, s + 80) * 4.1, yy = y + noise(x * .032 - oy, y * .032 + ox, s + 180) * 4.1;
            let d = Infinity, k = 0;
            for (const a of w.plates) {
                const z = ((xx - a.x) ** 2 + (yy - a.y) ** 2) / (a.scale * a.scale);
                if (z < d) {
                    d = z;
                    k = a.id;
                }
            }
            w.plate[i] = k;
            w.plates[k].cells++;
            if (w.crust[i] > -.02)
                w.plates[k].land++;
        }
    // Boundary-relative velocity, local crust buoyancy and slab age determine type.
    for (let y = 2; y < GH - 2; y++)
        for (let x = 2; x < GW - 2; x++) {
            const i = y * GW + x;
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                const j = i + dx + dy * GW;
                if (w.plate[i] === w.plate[j])
                    continue;
                const A = w.plates[w.plate[i]], B = w.plates[w.plate[j]], dn = Math.hypot(B.x - A.x, B.y - A.y);
                const normal = p.landformVersion >= 3 ? plateNormalV3(A, B, x + dx * .5, y + dy * .5, s, ox, oy) : { nx: (B.x - A.x) / dn, ny: (B.y - A.y) / dn };
                const { nx, ny } = normal;
                const closing = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny, shear = Math.abs(-(A.vx - B.vx) * ny + (A.vy - B.vy) * nx);
                const aLand = (p.landformVersion >= 3 ? plateCrustV3(w, A.id, x + dx * .5, y + dy * .5, nx, ny, -1, i) : w.crust[cell(Math.round(x - nx * 6), Math.round(y - ny * 6))]) > -.02;
                const bLand = (p.landformVersion >= 3 ? plateCrustV3(w, B.id, x + dx * .5, y + dy * .5, nx, ny, 1, j) : w.crust[cell(Math.round(x + nx * 6), Math.round(y + ny * 6))]) > -.02;
                let type = 5, override = -1;
                if (closing > .18) {
                    if (aLand && bLand)
                        type = 1;
                    else {
                        type = aLand || bLand ? 2 : 3;
                        override = aLand ? A.id : bLand ? B.id : A.age < B.age ? A.id : B.id;
                    }
                }
                else if (closing < -.20)
                    type = 4;
                w.boundaries.push({ x: x + dx * .5, y: y + dy * .5, a: A.id, b: B.id, nx, ny, closing, shear, type, override, continental: aLand || bLand });
            }
        }
    await progress('02 / Raising ranges, opening rifts');
    const nearest = arr().fill(1e9);
    for (let k = 0; k < w.boundaries.length; k++) {
        const b = w.boundaries[k], strength = clamp(Math.abs(b.closing) / 1.2, .12, 1.65), R = b.type === 1 ? 14 : 11;
        for (let y = Math.max(0, Math.floor(b.y - R)); y <= Math.min(GH - 1, Math.ceil(b.y + R)); y++)
            for (let x = Math.max(0, Math.floor(b.x - R)); x <= Math.min(GW - 1, Math.ceil(b.x + R)); x++) {
                const i = y * GW + x, dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy;
                if (d2 < nearest[i]) {
                    nearest[i] = d2;
                    w.boundaryType[i] = b.type;
                    w.boundaryId[i] = k;
                    w.stress[i] = strength;
                }
                const along = -dx * b.ny + dy * b.nx, cross = dx * b.nx + dy * b.ny, alongF = Math.exp(-along * along / 8);
                if (b.type === 1) {
                    w.collision[i] = Math.max(w.collision[i], Math.exp(-d2 / 28) * strength);
                }
                else if (b.type === 2 || b.type === 3) {
                    const side = cross * (b.override === b.a ? -1 : 1);
                    if (p.landformVersion < 3 || p.landformVersion == null || w.plate[i] === b.override)
                        w.arc[i] = Math.max(w.arc[i], Math.exp(-((side - 3.8) ** 2) / 8) * alongF * strength);
                    if (p.landformVersion < 3 || p.landformVersion == null || (w.plate[i] === b.a || w.plate[i] === b.b) && w.plate[i] !== b.override)
                        w.trench[i] = Math.max(w.trench[i], Math.exp(-((side + 1.7) ** 2) / 2.5) * alongF * strength);
                }
                else if (b.type === 4) {
                    w.rift[i] = Math.max(w.rift[i], Math.exp(-d2 / 9) * strength);
                }
                else
                    w.fault[i] = Math.max(w.fault[i], Math.exp(-d2 / 1.7) * clamp(b.shear / 1.6));
            }
    }
    if (p.landformVersion >= 3) w.compressionSupport = compressionFieldV3(w.collision);
    // Narrow ridged uplift + broader crustal thickening, rather than white-noise peaks.
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = y * GW + x, r = 1 - Math.abs(fbm(x * .32 + ox, y * .32 + oy, s + 789, 3)), tooth = .20 + .80 * Math.pow(r, 5), h = w.base[i];
            let lift = 0;
            if (h > -260)
                lift += p.uplift * (4200 * w.collision[i] * tooth + 1300 * Math.sqrt(w.collision[i]));
            lift += p.uplift * (h > 0 ? 1900 : 3500) * w.arc[i] * (.5 + .5 * tooth);
            const divergence = h > 0 ? -1250 * w.rift[i] + 440 * Math.sqrt(w.rift[i]) : 2000 * w.rift[i];
            w.height[i] = h + lift + divergence - 220 * w.fault[i] - (h < 500 ? 2200 * w.trench[i] : 0);
        }
    // Spatially separated vents emerge on the overriding side, not at arbitrary peaks.
    rnd = random32(s + 823);
    const candidates = [];
    for (let y = 6; y < GH - 6; y++)
        for (let x = 6; x < GW - 6; x++) {
            const i = y * GW + x;
            let type = null, score = 0;
            if (w.arc[i] > .3 && (w.boundaryId[i] < 0 || w.boundaries[w.boundaryId[i]].override === w.plate[i])) {
                type = w.base[i] < 0 ? 'Island-arc volcano' : 'Subduction volcano';
                score = w.arc[i];
            }
            else if (w.rift[i] > .48 && w.base[i] > -250) {
                type = 'Rift volcano';
                score = w.rift[i] * .64;
            }
            if (type && rnd() < .38)
                candidates.push({ i, x, y, type, score: score * (.75 + rnd() * .4) });
        }
    candidates.sort((a, b) => b.score - a.score);
    const spacing = 14.5 / Math.sqrt(Math.max(.1, p.volcanism));
    for (const c of candidates) {
        if (w.volcanoes.some(v => (v.x - c.x) ** 2 + (v.y - c.y) ** 2 < spacing * spacing))
            continue;
        if (w.volcanoes.length >= Math.round(22 * p.volcanism))
            break;
        const extra = c.type === 'Island-arc volcano' ? Math.max(0, -w.height[c.i] + 250) : 0;
        const magnitude = extra + (900 + rnd() * 1200) * Math.sqrt(p.volcanism), active = rnd() < .065, rad = 1.4 + rnd() * .8;
        w.volcanoes.push({ ...c, active, radius: rad, magnitude, plate: w.plate[c.i], age: active ? 'Young center' : 'Older center' });
        for (let yy = Math.max(0, c.y - 7); yy <= Math.min(GH - 1, c.y + 7); yy++)
            for (let xx = Math.max(0, c.x - 7); xx <= Math.min(GW - 1, c.x + 7); xx++)
                w.height[cell(xx, yy)] += magnitude * Math.exp(-((xx - c.x) ** 2 + (yy - c.y) ** 2) / (rad * rad));
    }
    for (const v of w.volcanoes)
        if (w.height[v.i] > 0)
            w.islandOrigin[v.i] = v.type === 'Island-arc volcano' ? 2 : v.type === 'Rift volcano' ? 4 : 0;
    // Fixed mantle sources leave older centers displaced in the direction of plate motion.
    rnd = random32(s + 1279);
    for (let chain = 0; chain < Math.round(1 + 1.3 * p.islands); chain++) {
        let i = 0, x = 0, y = 0;
        for (let a = 0; a < 250; a++) {
            x = 18 + rnd() * (GW - 36);
            y = 18 + rnd() * (GH - 36);
            i = cell(x, y);
            if (w.crust[i] < -.20 && w.arc[i] < .05 && w.rift[i] < .05)
                break;
        }
        const pl = w.plates[w.plate[i]], len = Math.hypot(pl.vx, pl.vy), vx = pl.vx / len, vy = pl.vy / len;
        const turn = (rnd() - .5) * .28;
        w.hotspots.push({ x, y, plate: pl.id, turnPerStep: turn });
        let trackX = x, trackY = y;
        for (let age = 0; age < 7; age++) {
            if (age > 0) {
                const a = turn * (age - .5);
                trackX += 4.1 * (vx * Math.cos(a) - vy * Math.sin(a));
                trackY += 4.1 * (vx * Math.sin(a) + vy * Math.cos(a));
            }
            const xx = trackX, yy = trackY;
            if (xx < 5 || yy < 5 || xx > GW - 6 || yy > GH - 6)
                continue;
            const ii = cell(xx, yy);
            if (w.crust[ii] > -.15 || w.separation[ii] > .5)
                continue;
            const crest = (1550 - age * 200) * p.volcanism, rad = 2.2 - age * .09;
            for (let gy = Math.max(0, Math.floor(yy - 8)); gy <= Math.min(GH - 1, Math.ceil(yy + 8)); gy++)
                for (let gx = Math.max(0, Math.floor(xx - 8)); gx <= Math.min(GW - 1, Math.ceil(xx + 8)); gx++) {
                    const j = cell(gx, gy), d2 = (gx - xx) ** 2 + (gy - yy) ** 2, bump = (crest + 4800) * Math.exp(-d2 / (rad * rad));
                    w.height[j] = Math.max(w.height[j], w.base[j] + bump);
                }
            w.islandOrigin[ii] = 3;
            if (age < 2)
                w.volcanoes.push({ i: ii, x: xx, y: yy, type: 'Hotspot chain', score: 1, active: age === 0, radius: rad, magnitude: crest, plate: pl.id, age: age === 0 ? 'Active source' : `Age step ${age}`, chain, ageStep: age });
        }
    }
    // Conservative thermal relaxation transfers excess slope to neighbors.
    for (let pass = 0; pass < 4; pass++) {
        const delta = arr();
        for (let y = 1; y < GH - 1; y++)
            for (let x = 1; x < GW - 1; x++) {
                const i = cell(x, y);
                if (w.height[i] < 0)
                    continue;
                let j = i;
                for (const q of [i - 1, i + 1, i - GW, i + GW])
                    if (w.height[q] < w.height[j])
                        j = q;
                const d = w.height[i] - w.height[j] - 600;
                if (d > 0) {
                    const f = d * .14 * p.erosion;
                    delta[i] -= f;
                    delta[j] += f;
                }
            }
        for (let i = 0; i < GN; i++)
            w.height[i] += delta[i];
    }
    // Preserve the designer's narrow ocean corridors after crustal uplift. This is
    // an explicit layout constraint, not a claim that tectonic evolution guarantees separation.
    for (let i = 0; i < GN; i++)
        if (w.separation[i] > .43 && w.crust[i] < -.075 && p.form !== 'pangaea')
            w.height[i] = Math.min(w.height[i], -160 - 900 * w.separation[i]);
    w.volcanoes = w.volcanoes.filter(v => w.height[v.i] > 70);
    w.volcanoes.forEach((v, k) => v.name = ['Ashen', 'Vermilion', 'Cinder', 'Ember', 'Sable', 'Vesper', 'Obsidian'][k % 7] + ' ' + ['Peak', 'Caldera', 'Crown', 'Spire', 'Vent'][Math.floor(k / 7) % 5] + (k >= 35 ? ' ' + (Math.floor(k / 35) + 1) : ''));
    await progress('03 / Cutting glacial inlets and subsidence basins');
    drainage(w);
    sculptHydrology(w);
    if (p.landformVersion >= 1)
        sculptLandforms(w);
    drainage(w);
    await progress('04 / Transporting ocean heat');
    ocean(w);
    await progress('05 / Carrying moisture over the ranges');
    await climate(w, progress);
    await progress('06 / Accumulating snow and flowing glacier ice');
    await cryosphere(w, progress);
    await progress('07 / Balancing basin water and mapping wetlands');
    basinHydrology(w);
    describeWorld(w);
    measureLandmasses(w);
    describeHydrology(w);
    if (p.landformVersion >= 1)
        describeLandforms(w);
    nameLegends(w);
    return w;
}
class MinHeap {
    constructor() { this.a = []; }
    push(i, h) { const a = this.a; let k = a.length; a.push([i, h]); while (k) {
        const p = (k - 1) >> 1;
        if (a[p][1] <= h)
            break;
        a[k] = a[p];
        k = p;
    } a[k] = [i, h]; }
    pop() { const a = this.a, root = a[0], last = a.pop(); if (a.length) {
        let k = 0;
        while (k * 2 + 1 < a.length) {
            let c = k * 2 + 1;
            if (c + 1 < a.length && a[c + 1][1] < a[c][1])
                c++;
            if (a[c][1] >= last[1])
                break;
            a[k] = a[c];
            k = c;
        }
        a[k] = last;
    } return root; }
    get length() { return this.a.length; }
}
function drainage(w) {
    const h = w.height, seen = new Uint8Array(GN), down = new Int32Array(GN).fill(-1), order = [], heap = new MinHeap(), filled = new Float32Array(h);
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = cell(x, y);
            if (h[i] <= 0) {
                seen[i] = 1;
                let coast = false;
                for (const j of [cell(x - 1, y), cell(x + 1, y), cell(x, y - 1), cell(x, y + 1)])
                    if (h[j] > 0)
                        coast = true;
                if (coast)
                    heap.push(i, 0);
            }
        }
    while (heap.length) {
        const [i, hi] = heap.pop();
        if (h[i] > 0)
            order.push(i);
        const x = i % GW, y = i / GW | 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            if (y + dy < 0 || y + dy >= GH)
                continue;
            const j = cell(x + dx, y + dy);
            if (seen[j])
                continue;
            seen[j] = 1;
            down[j] = i;
            filled[j] = Math.max(h[j], hi + .02);
            heap.push(j, filled[j]);
        }
    }
    const dist = new Int16Array(GN).fill(30000), nearest = new Int32Array(GN).fill(-1), q = new Int32Array(GN);
    let a = 0, b = 0;
    for (let i = 0; i < GN; i++)
        if (h[i] <= 0) {
            dist[i] = 0;
            nearest[i] = i;
            q[b++] = i;
        }
    while (a < b) {
        const i = q[a++], x = i % GW, y = i / GW | 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (y + dy < 0 || y + dy >= GH)
                continue;
            const j = cell(x + dx, y + dy);
            if (dist[j] > dist[i] + 1) {
                dist[j] = dist[i] + 1;
                nearest[j] = nearest[i];
                q[b++] = j;
            }
        }
    }
    Object.assign(w, { down, order, filled, dist, nearest });
}
function windAt(lat, season) { const rel = lat - season * 6, a = Math.abs(rel), s = Math.sign(rel) || 1, g30 = (1 + Math.tanh((a - 30) / 4)) / 2, g60 = (1 + Math.tanh((a - 60) / 4)) / 2; return [-.84 + 1.9 * g30 - 1.6 * g60, s * (.28 * (1 - g30) - .23 * (g30 - g60) + .14 * g60)]; }
// Version 3 keeps a qualitative, boundary-constrained surface circulation. Its
// forcing now comes from the same seasonal wind stress as atmospheric transport.
// Grid y points south, so minus d(tau_x)/dy drives the streamfunction convention.
function oceanWindStress(w) {
    const stress = new Float32Array(GH + 1), force = new Float32Array(GH + 1);
    let maximum = 1e-9;
    for (let y = 0; y <= GH; y++) {
        const lat = 86 - y * 172 / GH;
        for (const season of [-1, 1]) {
            const wind = windAt(lat, season);
            stress[y] += .5 * wind[0] * Math.hypot(wind[0], wind[1]);
        }
    }
    for (let y = 1; y < GH; y++) {
        force[y] = -(stress[y + 1] - stress[y - 1]) * .5;
        maximum = Math.max(maximum, Math.abs(force[y]));
    }
    for (let y = 1; y < GH; y++) force[y] *= .030 / maximum;
    return {stress, force};
}
// Thermal memory follows a small upwind sector, with a weaker local coast term.
// Long overland paths and intervening high barriers attenuate that memory; this
// does not claim to resolve three-dimensional flow around a mountain.
function maritimeSources(w, season) {
    const temperature = new Float32Array(GN), anomaly = new Float32Array(GN), influence = new Float32Array(GN), source = new Int32Array(GN).fill(-1), fetch = new Float32Array(GN).fill(40);
    const angles = [-.30, 0, .30];
    for (let i = 0; i < GN; i++) {
        if (w.height[i] <= 0) { temperature[i] = w.sst[i]; anomaly[i] = w.seaAnomaly[i]; influence[i] = 1; source[i] = i; fetch[i] = 0; continue; }
        const x = i % GW, y = i / GW | 0, near = w.nearest[i], wind = windAt(w.lat[i], season), length = Math.hypot(wind[0], wind[1]);
        const local = near >= 0 ? .22 * Math.exp(-w.dist[i] / 9) : 0;
        let weight = local, heat = local * (near >= 0 ? w.sst[near] : 0), seaA = local * (near >= 0 ? w.seaAnomaly[near] : 0), best = 0;
        for (const angle of angles) {
            const c = Math.cos(angle), s = Math.sin(angle), dx = -(wind[0] * c - wind[1] * s) / length, dy = -(wind[0] * s + wind[1] * c) / length;
            let barrier = 0;
            for (let step = 1; step <= 36; step++) {
                const yy = Math.round(y + dy * step);
                if (yy < 0 || yy >= GH) break;
                const j = cell(Math.round(x + dx * step), yy);
                if (w.height[j] <= 0) {
                    const value = .26 * Math.exp(-step / 16 - barrier / 6000);
                    weight += value; heat += value * w.sst[j]; seaA += value * w.seaAnomaly[j];
                    if (value > best) { best = value; source[i] = j; fetch[i] = step; }
                    break;
                }
                barrier = Math.max(barrier, w.height[j] - w.height[i]);
            }
        }
        influence[i] = weight;
        temperature[i] = weight ? heat / weight : 29 - 47 * Math.sin(w.lat[i] * Math.PI / 180) ** 2 + w.params.temperature;
        anomaly[i] = weight ? seaA / weight : 0;
    }
    return {temperature, anomaly, influence, source, fetch};
}
function ocean(w) {
    const coupled = w.params.landformVersion >= 3;
    const h = w.height, at = (x, y) => y * GW + wrap(x), V = GW * (GH + 1), psi = new Float32Array(V), free = new Uint8Array(V), force = new Float32Array(GH + 1);
    for (let y = 1; y < GH; y++) {
        force[y] = .030 * Math.sin((86 - y * 172 / GH) * Math.PI / 60);
        for (let x = 0; x < GW; x++)
            if (h[cell(x - 1, y - 1)] <= 0 && h[cell(x, y - 1)] <= 0 && h[cell(x - 1, y)] <= 0 && h[cell(x, y)] <= 0)
                free[at(x, y)] = 1;
    }
    if (coupled) {
        const forcing = oceanWindStress(w);
        force.set(forcing.force);
        w.oceanWindStress = forcing.stress;
        w.oceanForcing = forcing.force;
    }
    for (let k = 0; k < 150; k++)
        for (let y = 1; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const i = at(x, y);
                if (free[i]) {
                    const t = (psi[at(x - 1, y)] + psi[at(x + 1, y)] + psi[i - GW] + psi[i + GW] + force[y]) / 4.004;
                    psi[i] += (t - psi[i]) * 1.65;
                }
            }
    const ur = new Float32Array(GN), vd = new Float32Array(GN), u = new Float32Array(GN), v = new Float32Array(GN), eq = new Float32Array(GN), cold = new Float32Array(GN);
    let max = 1e-6;
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = cell(x, y);
            if (h[i] > 0)
                continue;
            ur[i] = psi[at(x + 1, y + 1)] - psi[at(x + 1, y)];
            vd[i] = -(psi[at(x + 1, y + 1)] - psi[at(x, y + 1)]);
            max = Math.max(max, Math.abs(ur[i]), Math.abs(vd[i]));
        }
    const scale = .25 * w.params.current / max;
    for (let i = 0; i < GN; i++) {
        ur[i] *= scale;
        vd[i] *= scale;
    }
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = cell(x, y), base = 28 - 31 * Math.sin(w.lat[i] * Math.PI / 180) ** 2 + w.params.temperature;
            eq[i] = base;
            u[i] = (ur[i] + ur[cell(x - 1, y)]) * .5;
            v[i] = (vd[i] + (y ? vd[i - GW] : 0)) * .5;
            const wind = windAt(w.lat[i], 0), hem = Math.sign(w.lat[i]), ex = -hem * wind[1], ey = hem * wind[0];
            let up = 0;
            if (h[cell(x + 1, y)] > 0)
                up += Math.max(0, -ex);
            if (h[cell(x - 1, y)] > 0)
                up += Math.max(0, ex);
            if (y < GH - 1 && h[i + GW] > 0)
                up += Math.max(0, -ey);
            if (y > 0 && h[i - GW] > 0)
                up += Math.max(0, ey);
            if (coupled) {
                up = 0;
                for (const season of [-1, 1]) {
                    const seasonalWind = windAt(w.lat[i], season), sx = -hem * seasonalWind[1], sy = hem * seasonalWind[0];
                    let seasonalUp = 0;
                    if (h[cell(x + 1, y)] > 0) seasonalUp += Math.max(0, -sx);
                    if (h[cell(x - 1, y)] > 0) seasonalUp += Math.max(0, sx);
                    if (y < GH - 1 && h[i + GW] > 0) seasonalUp += Math.max(0, -sy);
                    if (y > 0 && h[i - GW] > 0) seasonalUp += Math.max(0, sy);
                    up += seasonalUp * .5;
                }
            }
            cold[i] = Math.min(4, up * 4) * w.params.current;
        }
    let t = new Float32Array(eq), next = new Float32Array(GN);
    const freezing = coupled ? new Float32Array(GN) : null;
    if (coupled) for (let i = 0; i < GN; i++) if (h[i] <= 0 && t[i] < -1.8) {
        freezing[i] = -1.8 - t[i];
        t[i] = -1.8;
    }
    for (let step = 0; step < 165; step++) {
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const i = cell(x, y);
                if (h[i] > 0) {
                    next[i] = eq[i];
                    continue;
                }
                const l = cell(x - 1, y), r = cell(x + 1, y), n = y ? i - GW : i, s = y < GH - 1 ? i + GW : i, T = t[i];
                const adv = -ur[i] * (ur[i] > 0 ? T : t[r]) + ur[l] * (ur[l] > 0 ? t[l] : T) - vd[i] * (vd[i] > 0 ? T : t[s]) + (y ? vd[n] : 0) * (vd[n] > 0 ? t[n] : T);
                let diff = 0;
                for (const j of [l, r, n, s])
                    if (h[j] <= 0)
                        diff += t[j] - T;
                next[i] = T + .60 * (adv + .035 * w.params.current * diff + .018 * (eq[i] - cold[i] - T));
                if (coupled) {
                    // Cold energy forms sea ice instead of supercooling a liquid
                    // surface. Later positive heat first melts that stored ice.
                    const energy = next[i] + 1.8 - freezing[i];
                    freezing[i] = Math.max(0, -energy);
                    next[i] = Math.max(-1.8, energy - 1.8);
                }
            }
        const old = t;
        t = next;
        next = old;
    }
    const anomaly = new Float32Array(GN);
    for (let i = 0; i < GN; i++)
        anomaly[i] = h[i] <= 0 ? t[i] - eq[i] : 0;
    Object.assign(w, { sst: t, seaAnomaly: anomaly, ou: u, ov: v });
    if (coupled) w.oceanIcePotential = Float32Array.from(freezing, energy => clamp(energy / 3));
}
async function climate(w, progress) {
    const coupled = w.params.landformVersion >= 3;
    const h = w.height, temps = [], rains = [], runoffs = [], seasonalWinds = [], marineSeasons = [], waterBudgets = [];
    let mainU, mainV;
    for (const season of [-1, 1]) {
        const temp = new Float32Array(GN), u = new Float32Array(GN), v = new Float32Array(GN), cap = new Float32Array(GN), cond = new Float32Array(GN), pet = new Float32Array(GN), soil = new Float32Array(GN).fill(.5), rain = new Float32Array(GN), runoff = new Float32Array(GN);
        let q = new Float32Array(GN), next = new Float32Array(GN);
        const marine = coupled ? maritimeSources(w, season) : null, descent = coupled ? new Float32Array(GN) : null;
        let cloud = coupled ? new Float32Array(GN) : null, nextCloud = coupled ? new Float32Array(GN) : null;
        let initialWater = 0, evaporatedWater = 0, precipitatedWater = 0;
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const i = cell(x, y), lat = w.lat[i], sn = Math.sin(lat * Math.PI / 180), mar = coupled ? marine.influence[i] : Math.exp(-w.dist[i] / 9), near = w.nearest[i], seaA = coupled ? marine.anomaly[i] : near >= 0 ? w.seaAnomaly[near] : 0;
                temp[i] = h[i] > 0 ? (29 - 47 * sn * sn + w.params.temperature) * (1 - .36 * mar) + .36 * mar * (coupled ? marine.temperature[i] : near >= 0 ? w.sst[near] : 29 - 47 * sn * sn + w.params.temperature) - .0058 * h[i] + season * sn * (3 + 12 * (1 - mar)) : w.sst[i] + season * sn * 2;
                const wind = windAt(lat, season);
                u[i] = wind[0];
                v[i] = wind[1];
                if (y === 0 && v[i] < 0 || y === GH - 1 && v[i] > 0)
                    v[i] = 0;
                cap[i] = Math.max(.12, 2.3 * Math.exp(.035 * (temp[i] - 20)));
                pet[i] = .010 * clamp((temp[i] + 15) / 35, .1, 1.7) * w.params.aridity;
                q[i] = h[i] <= 0 ? cap[i] : .4;
                const rel = lat - season * 6, base = .003 + .049 * Math.exp(-((rel / 11) ** 2)) + .020 * Math.exp(-(((Math.abs(rel) - 53) / 11) ** 2)), dzx = (Math.max(0, h[cell(x + 1, y)]) - Math.max(0, h[cell(x - 1, y)])) * .5, dzy = (Math.max(0, h[cell(x, y + 1)]) - Math.max(0, h[cell(x, y - 1)])) * .5, vertical = (u[i] * dzx + v[i] * dzy) / 1000, lift = Math.max(0, vertical);
                cond[i] = (base + lift * .24) * clamp(1 + seaA * .085 * mar, .4, 1.2);
                if (coupled) { descent[i] = Math.max(0, -vertical); initialWater += q[i]; }
            }
        for (let step = 0; step < 220; step++) {
            for (let y = 0; y < GH; y++)
                for (let x = 0; x < GW; x++) {
                    const i = cell(x, y), l = cell(x - 1, y), r = cell(x + 1, y), n = y ? i - GW : i, s = y < GH - 1 ? i + GW : i, ur = (u[i] + u[r]) * .5, ul = (u[l] + u[i]) * .5, vd = y < GH - 1 ? (v[i] + v[s]) * .5 : 0, vn = y ? (v[n] + v[i]) * .5 : 0;
                    let vapor = Math.max(0, q[i] - .46 * (ur * (ur > 0 ? q[i] : q[r]) - ul * (ul > 0 ? q[l] : q[i]) + vd * (vd > 0 ? q[i] : q[s]) - vn * (vn > 0 ? q[n] : q[i])));
                    const evap = h[i] <= 0 ? .12 * Math.max(0, cap[i] - vapor) : Math.min(soil[i], pet[i] * clamp(soil[i]));
                    vapor += evap;
                    const condensed = Math.min(vapor * .85, vapor * cond[i] + Math.max(0, vapor - cap[i]) * .43);
                    let p = condensed;
                    if (coupled) {
                        let carried = Math.max(0, cloud[i] - .46 * (ur * (ur > 0 ? cloud[i] : cloud[r]) - ul * (ul > 0 ? cloud[l] : cloud[i]) + vd * (vd > 0 ? cloud[i] : cloud[s]) - vn * (vn > 0 ? cloud[n] : cloud[i])));
                        carried += condensed;
                        vapor -= condensed;
                        // Condensation is not instantaneous rainfall. Cloud water
                        // travels with the same wind, partly evaporates into dry
                        // descending air, and then falls out over a finite time.
                        const recycled = Math.min(carried, Math.max(0, cap[i] - vapor) * descent[i] * .10);
                        vapor += recycled; carried -= recycled;
                        p = carried * .36;
                        nextCloud[i] = carried - p;
                        next[i] = vapor;
                        evaporatedWater += evap;
                        precipitatedWater += p;
                    }
                    else next[i] = vapor - p;
                    let out = 0;
                    if (h[i] > 0) {
                        soil[i] = Math.max(0, soil[i] + p - evap);
                        out = Math.max(0, soil[i] - 1) * .14;
                        soil[i] -= out;
                    }
                    if (step >= 130) {
                        rain[i] += p / 90 * 40;
                        runoff[i] += out / 90 * 40;
                    }
                }
            const old = q;
            q = next;
            next = old;
            if (coupled) { const oldCloud = cloud; cloud = nextCloud; nextCloud = oldCloud; }
            if (step === 110)
                await nextFrame();
        }
        temps.push(temp);
        rains.push(rain);
        runoffs.push(runoff);
        mainU = u;
        mainV = v;
        if (coupled) {
            let finalWater = 0;
            for (let i = 0; i < GN; i++) finalWater += q[i] + cloud[i];
            const residual = finalWater - initialWater - evaporatedWater + precipitatedWater;
            waterBudgets.push({season, initialWater, finalWater, evaporatedWater, precipitatedWater, residual,
                relativeError: Math.abs(residual) / Math.max(1, initialWater + evaporatedWater)});
            seasonalWinds.push({u, v});
            marineSeasons.push(marine);
        }
    }
    const temp = new Float32Array(GN), rain = new Float32Array(GN), arid = new Float32Array(GN), flow = new Float64Array(GN), biome = new Uint8Array(GN), shadow = new Float32Array(GN), cause = new Uint8Array(GN), lake = new Float32Array(GN).fill(-1);
    let totalYield = 0;
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = cell(x, y);
            temp[i] = (temps[0][i] + temps[1][i]) * .5;
            rain[i] = (rains[0][i] + rains[1][i]) * .5;
            arid[i] = rain[i] / ((.33 + Math.max(0, temp[i] + 5) * .032) * w.params.aridity);
            flow[i] = h[i] > 0 ? (runoffs[0][i] + runoffs[1][i]) * .5 * w.area[i] : 0;
            totalYield += flow[i];
            let barrier = 0;
            if (coupled) {
                for (const winds of seasonalWinds) {
                    const wu = winds.u[i], wv = winds.v[i], len = Math.hypot(wu, wv);
                    let seasonalBarrier = 0;
                    if (h[i] > 0 && len > 1e-8) for (let k = 2; k <= 26; k++) {
                        const j = cell(Math.round(x - wu / len * k), Math.round(y - wv / len * k));
                        seasonalBarrier = Math.max(seasonalBarrier, (h[j] - h[i]) * Math.exp(-k / 24));
                    }
                    barrier += seasonalBarrier * .5;
                }
            }
            else {
                const wu = (windAt(w.lat[i], 0))[0], wv = (windAt(w.lat[i], 0))[1], len = Math.hypot(wu, wv);
                if (h[i] > 0) for (let k = 2; k <= 26; k++) {
                    const j = cell(Math.round(x - wu / len * k), Math.round(y - wv / len * k));
                    barrier = Math.max(barrier, (h[j] - h[i]) * Math.exp(-k / 24));
                }
            }
            shadow[i] = clamp(barrier / 2800);
            if (h[i] > 0) {
                const t = temp[i], a = arid[i], seasonality = Math.abs(rains[0][i] - rains[1][i]) / (rain[i] + .1);
                let b;
                if (t < -9)
                    b = 1;
                else if (t < -1)
                    b = a < .22 ? 3 : 2;
                else if (h[i] > 2800 && t < 9)
                    b = 12;
                else if (a < .28)
                    b = t > 12 ? (h[i] > 1500 || w.arc[i] > .22 || w.fault[i] > .35 ? 13 : 4) : 3;
                else if (a < .7)
                    b = 5;
                else if (t > 21)
                    b = a < 1.2 ? 6 : seasonality > 1.2 ? 10 : 11;
                // The subtropics: warm enough that the canopy holds its leaves through
                // the winter, not warm enough for the tropical classes above. Dry ones
                // are a hard-leaved woodland, wet ones a laurel forest.
                else if (t >= 16.5)
                    b = a < 1.05 ? 22 : 21;
                else if (t < 7)
                    b = 8;
                else
                    b = a > 1.9 ? 9 : 7;
                const depth = w.filled[i] - h[i];
                if (depth > 90 && depth < 900 && h[i] < 2200 && w.dist[i] > 2) {
                    if (a < .35 && depth > 130)
                        b = 14;
                    else if (a > 1.0 && depth > 180) {
                        b = 15;
                        lake[i] = w.filled[i];
                    }
                }
                biome[i] = b;
                const near = w.nearest[i], cold = coupled ? marineSeasons.reduce((sum, m) => sum + Math.max(0, -m.anomaly[i]) * m.influence[i] / 6, 0) : near >= 0 ? Math.max(0, -w.seaAnomaly[near]) * Math.exp(-w.dist[i] / 5) / 3 : 0, sub = Math.exp(-(((Math.abs(w.lat[i]) - 29) / 11) ** 2)) * .58, inland = clamp(w.dist[i] / 30) * .55, sh = shadow[i] * 1.4;
                cause[i] = sh > Math.max(sub, cold, inland) ? 1 : cold > Math.max(sub, inland) ? 3 : inland > sub ? 4 : 2;
            }
        }
    w.localRunoff = new Float64Array(flow);
    for (let k = w.order.length - 1; k >= 0; k--) {
        const i = w.order[k], d = w.down[i];
        if (d >= 0)
            flow[d] += flow[i];
    }
    Object.assign(w, { temp, rain, arid, flow, biome, shadow, cause, lake, windU: mainU, windV: mainV, riverThreshold: Math.max(6, totalYield / 560), totalYield, seasonTemp: temps, seasonRain: rains });
    if (coupled) {
        w.seasonWindU = seasonalWinds.map(winds => winds.u);
        w.seasonWindV = seasonalWinds.map(winds => winds.v);
        w.windU = Float32Array.from(mainU, (value, i) => (value + seasonalWinds[0].u[i]) * .5);
        w.windV = Float32Array.from(mainV, (value, i) => (value + seasonalWinds[0].v[i]) * .5);
        w.maritimeSource = marineSeasons.map(m => m.source);
        w.maritimeInfluence = marineSeasons.map(m => m.influence);
        w.maritimeAnomaly = marineSeasons.map(m => m.anomaly);
        w.climateWaterBudgets = waterBudgets;
    }
}
// Ice is stored mass, not a white low-temperature biome. Each uncalibrated model
// step adds snow, removes potential melt, and conservatively sends ice downhill.
async function cryosphere(w, progress) {
    const h = w.height, ice = new Float32Array(GN), accum = new Float32Array(GN), ablation = new Float32Array(GN), balance = new Float32Array(GN), seaIce = new Float32Array(GN), fu = new Float32Array(GN), fv = new Float32Array(GN);
    const steps = Math.max(0, Math.round(80 * w.params.glaciation));
    let totalAdded = 0, totalMelt = 0, totalCalved = 0;
    for (let i = 0; i < GN; i++) {
        if (h[i] <= 0) {
            seaIce[i] = .5 * (clamp((-w.sst[i] - 2 - 1.8) / 3) + clamp((-w.sst[i] + 2 - 1.8) / 3));
            if (w.params.landformVersion >= 3) seaIce[i] = Math.max(seaIce[i], w.oceanIcePotential?.[i] || 0);
            continue;
        }
        let snow = 0, melt = 0;
        for (let k = 0; k < 2; k++) {
            const t = w.seasonTemp[k][i];
            snow += w.seasonRain[k][i] * clamp((2 - t) / 6) * .5;
            melt += Math.max(0, t) * .5;
        }
        accum[i] = snow * 20;
        ablation[i] = melt * 6 + .7;
        balance[i] = accum[i] - ablation[i];
    }
    const surface = new Float32Array(GN), delta = new Float32Array(GN);
    for (let step = 0; step < steps; step++) {
        for (let i = 0; i < GN; i++) {
            if (h[i] <= 0)
                continue;
            const add = accum[i], melt = Math.min(ice[i] + add, ablation[i]);
            ice[i] += add - melt;
            totalAdded += add * w.area[i];
            totalMelt += melt * w.area[i];
            surface[i] = h[i] + ice[i];
        }
        delta.fill(0);
        if (step === steps - 1) {
            fu.fill(0);
            fv.fill(0);
        }
        for (let y = 1; y < GH - 1; y++)
            for (let x = 1; x < GW - 1; x++) {
                const i = cell(x, y);
                if (ice[i] < 1)
                    continue;
                const js = [i - 1, i + 1, i - GW, i + GW];
                let sum = 0, maxDrop = 0;
                const drops = js.map(j => { const drop = Math.max(0, surface[i] - (h[j] > 0 ? surface[j] : 0)); sum += drop; maxDrop = Math.max(maxDrop, drop); return drop; });
                if (sum <= 0)
                    continue;
                const out = ice[i] * .16 * clamp(maxDrop / 800);
                delta[i] -= out;
                for (let k = 0; k < 4; k++) {
                    const f = out * drops[k] / sum, j = js[k];
                    if (h[j] > 0)
                        delta[j] += f * w.area[i] / w.area[j];
                    else
                        totalCalved += f * w.area[i];
                    if (step === steps - 1) {
                        fu[i] += (k === 0 ? -1 : k === 1 ? 1 : 0) * f;
                        fv[i] += (k === 2 ? -1 : k === 3 ? 1 : 0) * f;
                    }
                }
            }
        for (let i = 0; i < GN; i++)
            if (h[i] > 0)
                ice[i] = Math.max(0, ice[i] + delta[i]);
        if (step === 40)
            await nextFrame();
    }
    let covered = 0, alpine = 0, polar = 0, maxIce = 0, stored = 0;
    for (let i = 0; i < GN; i++) {
        stored += ice[i] * w.area[i];
        maxIce = Math.max(maxIce, ice[i]);
        if (h[i] <= 0)
            continue;
        if (ice[i] > 25) {
            w.biome[i] = 16;
            w.lake[i] = -1;
            covered += w.area[i];
            if (Math.abs(w.lat[i]) < 62)
                alpine += w.area[i];
            else
                polar += w.area[i];
        }
        else if (w.biome[i] === 1)
            w.biome[i] = w.rain[i] < .16 ? 3 : 2;
    }
    Object.assign(w, { ice, iceAccum: accum, iceAblation: ablation, iceBalance: balance, iceFlowU: fu, iceFlowV: fv, seaIce, iceStats: { steps, covered, alpine, polar, maxIce, totalAdded, totalMelt, totalCalved, stored, budgetRelativeError: Math.abs(stored - (totalAdded - totalMelt - totalCalved)) / Math.max(1, totalAdded) } });
}
function measureLandmasses(w) {
    // Eight-neighbor connectivity is deliberately strict: a diagonal land bridge
    // joins two continents. No wrap at atlas margins; this is a rectangular atlas.
    const region = new Int32Array(GN).fill(-1), regions = [], dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let i = 0; i < GN; i++) {
        if (w.height[i] <= 0 || region[i] >= 0)
            continue;
        const id = regions.length, q = [i];
        region[i] = id;
        let area = 0, xsum = 0, ysum = 0, glacier = 0;
        for (let a = 0; a < q.length; a++) {
            const j = q[a], x = j % GW, y = j / GW | 0;
            area += w.area[j];
            xsum += x;
            ysum += y;
            if (w.ice[j] > 25)
                glacier += w.area[j];
            for (const [dx, dy] of dirs) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                    continue;
                const k = yy * GW + xx;
                if (region[k] < 0 && w.height[k] > 0) {
                    region[k] = id;
                    q.push(k);
                }
            }
        }
        const cx = xsum / q.length, cy = ysum / q.length;
        let anchor = q[0], distance = Infinity;
        for (const j of q) {
            const d = (j % GW - cx) ** 2 + ((j / GW | 0) - cy) ** 2;
            if (d < distance) {
                distance = d;
                anchor = j;
            }
        }
        regions.push({ id, cells: q.length, area, i: anchor, x: anchor % GW, y: anchor / GW | 0, glacier, kind: q.length >= 450 ? 'Continent' : q.length >= 3 ? 'Island' : 'Unresolved islet' });
    }
    const sorted = regions.slice().sort((a, b) => b.area - a.area), continents = sorted.filter(r => r.kind === 'Continent'), islands = sorted.filter(r => r.kind === 'Island');
    const names = ['Thaloria', 'Vaelthar', 'Soleran', 'Zarush', 'Kethis', 'Talandra', 'Orinth', 'Meridia', 'Nacre'];
    continents.forEach((c, k) => { c.name = Math.abs(w.lat[c.i]) > 64 ? (w.lat[c.i] > 0 ? 'The Frozen Reach' : 'The Shattered South') : names[k % names.length]; c.kind = 'CONTINENT'; c.isContinent = true; });
    let land = 0;
    for (const r of regions)
        land += r.area;
    Object.assign(w, { landmassId: region, landmasses: regions, continents, islands });
    Object.assign(w.stats, { continents: continents.length, islands: islands.length, islets: regions.filter(r => r.cells < 3).length, largestLandmass: sorted[0] ? sorted[0].area / land : 0, iceCover: w.iceStats.covered / land, alpineIce: w.iceStats.alpine / land, polarIce: w.iceStats.polar / land, maxIce: w.iceStats.maxIce });
    w.audit.topology = continents.length >= 3 && w.stats.largestLandmass < .65;
    w.audit.iceBudget = w.iceStats.budgetRelativeError;
    const glacier = findRegion(w, i => w.ice[i] > 25);
    if (glacier)
        w.features.push({ id: 'glacier', name: 'The Pale Icefields', kind: 'FLOWING LAND ICE', i: glacier.i, x: glacier.i % GW, y: glacier.i / GW | 0, text: 'Seasonal snowfall feeds an ice reservoir. Summer melt removes mass; gravity redistributes the remaining ice downslope.' });
    const alpineR = findRegion(w, i => w.ice[i] > 25 && Math.abs(w.lat[i]) < 62);
    if (alpineR)
        w.features.push({ id: 'alpine', name: 'The Glassfall Glaciers', kind: 'ALPINE GLACIERS', i: alpineR.i, x: alpineR.i % GW, y: alpineR.i / GW | 0, text: 'High-elevation snowfall survives summer and flows into adjoining valleys.' });
    const islandsWithVents = w.volcanoes.filter(v => regions[region[v.i]]?.kind === 'Island');
    w.stats.islandVolcanoes = islandsWithVents.length;
}
function findRegion(w, predicate) {
    const seen = new Uint8Array(GN);
    let best = [];
    for (let y = 1; y < GH - 1; y++)
        for (let x = 1; x < GW - 1; x++) {
            const i = cell(x, y);
            if (seen[i] || !predicate(i))
                continue;
            const q = [i];
            seen[i] = 1;
            for (let a = 0; a < q.length; a++) {
                const v = q[a], xx = v % GW, yy = v / GW | 0;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (xx + dx < 1 || xx + dx > GW - 2 || yy + dy < 1 || yy + dy > GH - 2)
                        continue;
                    const j = cell(xx + dx, yy + dy);
                    if (!seen[j] && predicate(j)) {
                        seen[j] = 1;
                        q.push(j);
                    }
                }
            }
            if (q.length > best.length)
                best = q;
        }
    if (!best.length)
        return null;
    let cx = 0, cy = 0;
    for (const i of best) {
        cx += i % GW;
        cy += i / GW | 0;
    }
    cx /= best.length;
    cy /= best.length;
    let i = best[0], d = 1e9;
    for (const j of best) {
        const q = (j % GW - cx) ** 2 + ((j / GW | 0) - cy) ** 2;
        if (q < d) {
            d = q;
            i = j;
        }
    }
    return { i, size: best.length };
}
function describeWorld(w) {
    let land = 0, peak = 0, peakI = 0, desert = 0, riverCells = 0;
    const types = new Set();
    for (let i = 0; i < GN; i++) {
        if (w.height[i] > 0) {
            land += w.area[i];
            types.add(w.biome[i]);
            if ([3, 4, 13, 14].includes(w.biome[i]))
                desert += w.area[i];
            if (w.height[i] > peak) {
                peak = w.height[i];
                peakI = i;
            }
            if (w.flow[i] > (w.channelThreshold?.[i] || w.riverThreshold))
                riverCells++;
        }
    }
    w.stats = { land: land / w.totalArea, peak, biomes: types.size, desert: desert / Math.max(land, 1), volcanoes: w.volcanoes.length, active: w.volcanoes.filter(v => v.active).length, plates: w.plates.length, riverCells, boundaries: {} };
    for (const b of w.boundaries)
        w.stats.boundaries[BOUNDARY[b.type]] = (w.stats.boundaries[BOUNDARY[b.type]] || 0) + 1;
    const add = (id, name, kind, i, text) => w.features.push({ id, name, kind, i, x: i % GW, y: i / GW | 0, text });
    let rangeI = peakI, rangePeak = 0;
    for (let i = 0; i < GN; i++)
        if (w.collision[i] > .18 && w.height[i] > rangePeak) {
            rangePeak = w.height[i];
            rangeI = i;
        }
    if (rangeI)
        add('crown', 'The Crownspine', 'COLLISION RANGE', rangeI, 'Crustal thickening and rough uplift produce connected ridges, rather than isolated random cones.');
    const desertR = findRegion(w, i => [3, 4, 13, 14].includes(w.biome[i]));
    if (desertR)
        add('desert', 'The Ochre Expanse', 'ARID INTERIOR', desertR.i, 'Low precipitation relative to evaporative demand creates this dry province. Inspect the moisture pathway to distinguish its causes.');
    const forest = findRegion(w, i => [7, 8, 9, 10, 11, 21].includes(w.biome[i]));
    if (forest)
        add('forest', 'The Verdant Reach', 'FOREST PROVINCE', forest.i, 'Forests are placed only after temperature and transported moisture have been estimated.');
    const arcs = w.volcanoes.filter(v => v.type.includes('Subduction') || v.type.includes('Island'));
    if (arcs.length) {
        const v = arcs[Math.floor(arcs.length * .3)];
        add('arc', 'The Ember Arc', 'VOLCANIC BELT', v.i, 'Oceanic crust descends at a convergent margin. Vents form on its overriding side; pure continental collisions do not automatically receive volcanoes.');
    }
    const hotspot = w.volcanoes.find(v => v.type === 'Hotspot chain' && v.active);
    if (hotspot)
        add('hotspot', 'The Cinderwake Isles', 'HOTSPOT TRACK', hotspot.i, 'A stationary mantle source leaves an age-progressive chain along a prescribed, gently turning drift history. Older modeled centers subside.');
    let ri = -1, rs = 0;
    for (let i = 0; i < GN; i++)
        if (w.height[i] > 0 && w.base[i] > 0 && w.rift[i] > rs) {
            rs = w.rift[i];
            ri = i;
        }
    if (ri >= 0 && rs > .4)
        add('rift', 'The Veyran Rift', 'DIVERGENT MARGIN', ri, 'Extension lowers a narrow valley between shoulders. Continental rift vents are generated separately from subduction arcs.');
    w.audit = { finite: true, downhillErrors: 0, unsupportedVents: 0 };
    for (let i = 0; i < GN; i++) {
        if (!Number.isFinite(w.height[i] + w.rain[i] + w.temp[i]))
            w.audit.finite = false;
        const d = w.down[i];
        if (w.height[i] > 0 && d >= 0 && w.filled[d] >= w.filled[i])
            w.audit.downhillErrors++;
    }
    for (const v of w.volcanoes)
        if (v.type !== 'Hotspot chain' && w.arc[v.i] < .2 && w.rift[v.i] < .4)
            w.audit.unsupportedVents++;
}
/* IV: Explicit geomorphology priors and closed-basin storage.
 * Fjords represent a prescribed former glacial episode, NOT integrated ice erosion.
 * Heights are bedrock; lakes have a separate water surface. Water volume units
 * are dimensionless grid-volume units and are not calibrated cubic kilometers.
 */
function sculptHydrology(w) {
    const rnd = random32(w.seed + 5917), h = w.height;
    w.fjord = new Uint8Array(GN);
    w.basinPrior = new Uint8Array(GN);
    w.fjords = [];
    w.depressions = [];
    const candidates = [];
    for (let i = 0; i < GN; i++) {
        const lat = Math.abs(w.lat[i]);
        if (h[i] > 550 && h[i] < 3000 && lat > 48 && lat < 75 && w.dist[i] >= 3 && w.dist[i] < 12) {
            let path = [i], j = i;
            for (let z = 0; z < 32 && h[j] > 0; z++) {
                j = w.down[j];
                if (j < 0)
                    break;
                path.push(j);
            }
            if (j >= 0 && h[j] <= 0 && path.length >= 5 && path.length <= 24)
                candidates.push({ i, path, score: h[i] / 2000 + rnd() * .6 });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const c of candidates) {
        const end = c.path[c.path.length - 1], ex = end % GW, ey = end / GW | 0;
        if (w.fjords.some(f => Math.hypot(f.x - ex, f.y - ey) < 16))
            continue;
        const fid = w.fjords.length + 1;
        c.path.forEach((j, k) => {
            const x = j % GW, y = j / GW | 0, rad = 1.25 + .3 * Math.sin(k * .6), depth = -70 - 180 * Math.sin(Math.PI * (k + .5) / c.path.length);
            for (let yy = Math.max(1, y - 3); yy < Math.min(GH - 1, y + 4); yy++)
                for (let xx = Math.max(1, x - 3); xx < Math.min(GW - 1, x + 4); xx++) {
                    const d = Math.hypot(xx - x, yy - y), a = yy * GW + xx;
                    if (d < rad && w.height[a] > -600) {
                        h[a] = Math.min(h[a], depth + 130 * (d / rad) ** 4);
                        if (h[a] < 0)
                            w.fjord[a] = fid;
                    }
                }
        });
        w.fjords.push({ id: fid, i: end, x: ex, y: ey, path: c.path, name: ['Skeld', 'Winterglass', 'Nacre', 'Greywake', 'Frostgate', 'Orison', 'Whitepine', 'Valen'][fid % 8] + ' Fjord' });
        if (w.fjords.length >= 10)
            break;
    }
    // Large interior depressions are explicit tectonic/subsidence design priors.
    // A low floor is carved inside an already inland rim; seawater is never used
    // as a shortcut for forming a lake.
    const pts = [];
    for (let y = 15; y < GH - 15; y += 2)
        for (let x = 15; x < GW - 15; x += 2) {
            const i = y * GW + x;
            if (w.dist[i] < 10 || h[i] < 160 || h[i] > 2600 || Math.abs(w.lat[i]) > 62)
                continue;
            pts.push({ i, x, y, score: w.dist[i] * .5 + w.rift[i] * 5 + noise(x * .08, y * .08, w.seed + 411) * 4 });
        }
    pts.sort((a, b) => b.score - a.score);
    for (const c of pts) {
        if (w.depressions.some(a => Math.hypot(a.x - c.x, a.y - c.y) < 28))
            continue;
        const radius = clamp(w.dist[c.i] * .51, 5.5, 10), rx = radius, ry = radius * (.65 + rnd() * .4), ring = [];
        // An exact ellipse fills to an exact ellipse. Measured over two worlds, every
        // lake sitting in one of these depressions came out at .59-.60 circularity
        // where real lakes run .15-.5 — the shoreline was the contour of a smooth
        // quadratic bowl and nothing else, since the only relief in it was 18 m of
        // noise against a 700 m bowl. The rim now wanders with bearing and the floor
        // carries real relief, so the water finds bays, headlands and islands.
        const bearing = (dx, dy) => {
            const a = Math.atan2(dy, dx);
            return 1 + .37 * noise(Math.cos(a) * 2.3 + c.x * .05, Math.sin(a) * 2.3 + c.y * .05, w.seed + 977)
                + .15 * noise(Math.cos(a) * 5.7, Math.sin(a) * 5.7, w.seed + 978);
        };
        for (let k = 0; k < 40; k++) {
            const a = k / 40 * Math.PI * 2, lobe = bearing(Math.cos(a), Math.sin(a));
            ring.push(h[cell(c.x + Math.cos(a) * rx * lobe, c.y + Math.sin(a) * ry * lobe)]);
        }
        ring.sort((a, b) => a - b);
        if (ring[2] < 130)
            continue;
        const floor = Math.max(40, ring[3] - 700), rim = Math.max(floor + 150, ring[3]), id = w.depressions.length + 1;
        const reach = 1.45;
        for (let yy = Math.floor(c.y - ry * reach); yy <= c.y + ry * reach; yy++)
            for (let xx = Math.floor(c.x - rx * reach); xx <= c.x + rx * reach; xx++) {
                const ex = (xx - c.x) / rx, ey = (yy - c.y) / ry;
                const r = Math.hypot(ex, ey) / bearing(ex, ey), i = cell(xx, yy);
                if (r >= 1 || h[i] <= 0)
                    continue;
                const target = floor + (rim - floor) * r * r
                    + fbm(xx * .17, yy * .17, w.seed + 831, 3) * (rim - floor) * .38
                    + noise(xx * .55, yy * .55, w.seed + 832) * 22;
                h[i] = Math.max(25, lerp(h[i], Math.min(h[i], target), clamp((1 - r) * 5)));
                w.basinPrior[i] = id;
            }
        w.depressions.push({ ...c, rx, ry, floor, rim });
        if (w.depressions.length >= 7)
            break;
    }
    // Continental collision thickens crust across a whole belt, not only along the
    // suture, and the land behind a great range rises into a broad upland: Tibet
    // behind the Himalaya, the Altiplano behind the Andes. Without that prior this
    // model built ranges and nothing else. Measured over two worlds, 1 of 2426 cells
    // above 2000 m had local relief low enough to read as a plateau, so the alpine
    // and cold-desert climates the biome table already knows how to draw had nowhere
    // to sit. This raises the interior of the widest collision belts and leaves the
    // peaks that are already higher alone, so a range keeps its crest and gains a
    // roof behind it. Placed before climate, so the upland casts its own rain shadow
    // rather than having one painted on.
    w.plateaus = [];
    const uplands = [];
    for (let y = 12; y < GH - 12; y += 2)
        for (let x = 12; x < GW - 12; x += 2) {
            const i = y * GW + x;
            if (h[i] < 400 || w.dist[i] < 7)
                continue;
            let broad = 0;
            for (let dy = -5; dy <= 5; dy++)
                for (let dx = -5; dx <= 5; dx++)
                    broad += w.collision[cell(x + dx, y + dy)];
            if (broad < 22)
                continue;
            uplands.push({ i, x, y, broad, score: broad + noise(x * .07, y * .07, w.seed + 523) * 9 });
        }
    uplands.sort((a, b) => b.score - a.score);
    for (const c of uplands) {
        if (w.params.landformVersion >= 3 && w.params.uplift <= 0)
            break;
        if (w.plateaus.some(a => Math.hypot(a.x - c.x, a.y - c.y) < 30))
            continue;
        if (w.depressions.some(a => Math.hypot(a.x - c.x, a.y - c.y) < 18))
            continue;
        const rx = clamp(6 + c.broad * .085, 8, 15), ry = rx * (.62 + rnd() * .45);
        const bearing = (dx, dy) => {
            const a = Math.atan2(dy, dx);
            return 1 + .26 * noise(Math.cos(a) * 2.1 + c.x * .04, Math.sin(a) * 2.1 + c.y * .04, w.seed + 525)
                + .11 * noise(Math.cos(a) * 4.9, Math.sin(a) * 4.9, w.seed + 526);
        };
        const level = w.params.landformVersion >= 3 ? w.base[c.i] + compressionRiseV3(w, c.i, 2400) : clamp(2950 + c.broad * 9, 2950, 4500);
        let raised = 0;
        for (let yy = Math.floor(c.y - ry * 1.5); yy <= c.y + ry * 1.5; yy++)
            for (let xx = Math.floor(c.x - rx * 1.5); xx <= c.x + rx * 1.5; xx++) {
                const ex = (xx - c.x) / rx, ey = (yy - c.y) / ry, i = cell(xx, yy);
                const r = Math.hypot(ex, ey) / bearing(ex, ey);
                if (r >= 1 || h[i] <= 0)
                    continue;
                // Both directions, or it is not a plateau. Filling the valleys to the
                // roof while leaving 6000-9800 m spires standing all over the interior
                // left 5 km of relief inside the ellipse and nothing that reads as flat.
                // A plateau's great peaks stand on its rim; its floor is high and
                // subdued, so the interior keeps only a fraction of whatever rises
                // above the roof.
                const top = level + fbm(xx * .13, yy * .13, w.seed + 524, 3) * 165;
                const inside = clamp((1 - r) * 2.2) * (w.params.landformVersion >= 3 ? clamp(w.compressionSupport[i] / Math.max(.12, w.compressionSupport[c.i])) : 1);
                const roofed = top + Math.max(0, h[i] - top) * .26;
                const planed = lerp(h[i], roofed, inside);
                if (Math.abs(planed - h[i]) > 1) {
                    h[i] = Math.max(25, planed);
                    raised++;
                }
            }
        if (raised < 40)
            continue;
        w.plateaus.push({ ...c, rx, ry, level, cells: raised });
        if (w.plateaus.length >= 3)
            break;
    }
}
/** An irregular mountain belt: overlapping massifs joined by branching ridges.
 * The tectonic direction biases the network, without prescribing parallel rows.
 * All lengths are parent-grid cells; even narrow shoulders span several cells. */
function mountainBeltV2(w, r, original, catchment) {
    const rnd = random32(seedHash(w.params.seed + ' / mountain-belt-v2 / ' + r.center.i));
    const tectonic = w.params.landformVersion >= 3, gain = tectonic ? Math.max(0, w.params.uplift) / 1.2 : 1;
    const at = (u, v) => cell(r.center.x + u * Math.cos(r.axis) - v * Math.sin(r.axis), r.center.y + u * Math.sin(r.axis) + v * Math.cos(r.axis));
    const massifs = [], nodes = [], count = 4 + (rnd() > .55 ? 1 : 0);
    for (let j = 0; j < count; j++) {
        const u = (-.72 + 1.44 * (j + .18 + rnd() * .64) / count) * r.rx;
        const v = noise(u * .07, 2, w.seed + 7291) * r.ry * .45 + (rnd() - .5) * r.ry * .4;
        const massif = { u, v, along: 5.5 + rnd() * 4, across: 3.3 + rnd() * 2.8,
            angle: (rnd() - .5) * 1.1, height: 650 + rnd() * 650 };
        massifs.push(massif);
        for (let k = 0; k < 3; k++) {
            for (let attempt = 0; attempt < 16; attempt++) {
                const a = rnd() * Math.PI * 2, radius = k ? .35 + rnd() * .55 : 0;
                const u = massif.u + Math.cos(a) * massif.along * radius;
                const v = massif.v + Math.sin(a) * massif.across * radius;
                if (Math.hypot(u / (r.rx * .83), v / (r.ry * .8)) > 1 || nodes.some(n => Math.hypot(n.u - u, n.v - v) < 3.8)) continue;
                const height = 3500 + rnd() * 2000, width = 2.1 + rnd() * 1.5, i = at(u, v);
                nodes.push({ u, v, height: tectonic ? w.base[i] + compressionRiseV3(w, i, height - 1000) : height, width });
                break;
            }
        }
    }
    // A minimum spanning tree connects neighbouring peaks and can merge, split
    // and end. Cross-belt links cost slightly more, preserving the regional trend.
    const edges = [], connected = new Set([0]), degree = nodes.map(() => 0);
    while (connected.size < nodes.length) {
        let best = null;
        for (const a of connected) for (let b = 0; b < nodes.length; b++) {
            if (connected.has(b)) continue;
            const du = nodes[b].u - nodes[a].u, dv = nodes[b].v - nodes[a].v, cost = Math.hypot(du, dv * 1.3);
            if (!best || cost < best.cost) best = { a, b, cost };
        }
        connected.add(best.b);degree[best.a]++;degree[best.b]++;
        const a = nodes[best.a], b = nodes[best.b], du = b.u - a.u, dv = b.v - a.v, length = Math.hypot(du, dv);
        const bend = (rnd() - .5) * Math.min(3, length * .35), points = [];
        for (let k = 0; k <= 4; k++) {
            const t = k / 4, offset = 4 * t * (1 - t) * bend;
            points.push({ u: lerp(a.u, b.u, t) - dv / length * offset, v: lerp(a.v, b.v, t) + du / length * offset, t });
        }
        edges.push({ a, b, points, saddle: 450 + rnd() * 950 });
    }
    const channels = [], ca = Math.cos(r.axis), sa = Math.sin(r.axis);
    for (let y = Math.max(1, r.center.y - Math.ceil(r.rx)); y <= Math.min(GH - 2, r.center.y + r.rx); y++)
        for (let x = Math.max(1, r.center.x - Math.ceil(r.rx)); x <= Math.min(GW - 2, r.center.x + r.rx); x++) {
            const i = y * GW + x, dx = x - r.center.x, dy = y - r.center.y;
            if (catchment[i] < 20 || Math.hypot((dx * ca + dy * sa) / r.rx, (-dx * sa + dy * ca) / r.ry) > 1) continue;
            channels.push({ x, y, width: 1.1 + clamp(Math.log(catchment[i] / 20) / 5) * .9,
                depth: 260 + clamp(Math.log(catchment[i] / 20) / 5) * 480 });
        }
    r.mountainStructure = { massifs: massifs.length, summits: nodes.length, branches: degree.filter(n => n >= 3).length,
        minSummit: Math.min(...nodes.map(n => n.height)), maxSummit: Math.max(...nodes.map(n => n.height)), minShoulder: 2.1 };
    if (tectonic) r.mountainStructure.tectonicSupport = nodes.map(n => ({ i: at(n.u, n.v), base: w.base[at(n.u, n.v)], compression: w.compressionSupport[at(n.u, n.v)], summit: n.height }));
    return (i, x, y, u, v) => {
        if (tectonic && gain === 0) return original[i];
        const support = tectonic ? Math.sqrt(Math.max(0, w.compressionSupport[i])) : 1;
        const base = tectonic ? w.base[i] + compressionRiseV3(w, i, 850) : Math.max(260, Math.min(2100, original[i] * .34 + r.level * .38 + noise(x * .065, y * .065, w.seed + 7292) * 260));
        let foothills = 0;
        for (const m of massifs) {
            const du = u - m.u, dv = v - m.v, c = Math.cos(m.angle), s = Math.sin(m.angle);
            const distance = ((du * c + dv * s) / m.along) ** 2 + ((-du * s + dv * c) / m.across) ** 2;
            foothills = Math.max(foothills, m.height * Math.exp(-distance * .8) * gain * support);
        }
        let height = base + foothills, influence = 0;
        for (const edge of edges) for (let k = 1; k < edge.points.length; k++) {
            const a = edge.points[k - 1], b = edge.points[k], du = b.u - a.u, dv = b.v - a.v;
            const t = clamp(((u - a.u) * du + (v - a.v) * dv) / (du * du + dv * dv));
            const along = lerp(a.t, b.t, t), width = lerp(edge.a.width, edge.b.width, along);
            const distance = Math.hypot(u - lerp(a.u, b.u, t), v - lerp(a.v, b.v, t));
            const shoulder = Math.pow(Math.max(0, 1 - distance / (width * 1.6)), 1.5);
            const crest = lerp(edge.a.height, edge.b.height, along) - edge.saddle * 4 * along * (1 - along) * gain * support;
            height = Math.max(height, lerp(base + foothills * .4, crest, shoulder));
            influence = Math.max(influence, shoulder);
        }
        height += fbm(x * .17, y * .17, w.seed + 7293, 3) * 260 * influence * gain * support;
        let incision = 0;
        for (const c of channels) {
            const d2 = ((x - c.x) ** 2 + (y - c.y) ** 2) / (c.width * c.width);
            if (d2 < 9) incision = Math.max(incision, c.depth * Math.exp(-d2));
        }
        const sculpted = Math.max(base, height - incision * gain * support);
        return tectonic ? lerp(original[i], sculpted, clamp(w.compressionSupport[i] / .12)) : sculpted;
    };
}

/** Regional geomorphology, before the final drainage and climate solve. These are
 * prescribed geological histories, like the existing glacial inlets and uplands;
 * they change bedrock, never a rendered-only surface or the continental shoreline. */
function sculptLandforms(w) {
    drainage(w);
    const original = new Float32Array(w.height), catchment = new Float32Array(GN).fill(1);
    for (let k = w.order.length - 1; k >= 0; k--) {
        const i = w.order[k], d = w.down[i];
        if (d >= 0)
            catchment[d] += catchment[i];
    }
    w.landform = new Uint8Array(GN);
    w.landformStrength = new Float32Array(GN);
    w.landformRegion = new Int16Array(GN).fill(-1);
    w.landformRegions = [];
    const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
    const eligible = i => original[i] > 0 && w.dist[i] >= 3 && !w.basinPrior[i] && !w.fjord[i];
    const free = (c, spacing) => w.landformRegions.every(r => Math.hypot(r.x - c.x, r.y - c.y) > spacing + Math.min(r.rx, r.ry) * .55);
    const clearCore = (c, radius) => {
        for (let y = c.y - radius; y <= c.y + radius; y++)
            for (let x = c.x - radius; x <= c.x + radius; x++)
                if ((x - c.x) ** 2 + (y - c.y) ** 2 <= radius * radius && (!eligible(cell(x, y)) || w.landformStrength[cell(x, y)] > .5))
                    return false;
        return true;
    };
    const clearBelt = (c, rx, ry, axis) => {
        const ca = Math.cos(axis), sa = Math.sin(axis);
        for (let u = -rx * .68; u <= rx * .68; u += 1.5) {
            let clear = 0;
            for (const v of [-ry * .55, 0, ry * .55]) {
                const i = cell(c.x + u * ca - v * sa, c.y + u * sa + v * ca);
                if (eligible(i) && w.landformStrength[i] < .5)
                    clear++;
            }
            if (clear < 2)
                return false;
        }
        return true;
    };
    const candidates = (test, score) => {
        const out = [];
        for (let y = 12; y < GH - 12; y += 2)
            for (let x = 12; x < GW - 12; x += 2) {
                const i = y * GW + x;
                if (eligible(i) && test(i))
                    out.push({ i, x, y, score: score(i, x, y) });
            }
        return out.sort((a, b) => b.score - a.score || a.i - b.i);
    };
    const make = (c, type, kind, name, rx, ry, axis, level, detail) => {
        const region = { id: w.landformRegions.length, type, kind, name, i: c.i, x: c.x, y: c.y, center: { i: c.i, x: c.x, y: c.y }, rx, ry, axis, level, detail, area: 0 };
        w.landformRegions.push(region);
        return region;
    };
    const paint = (r, shape) => {
        const reach = Math.ceil(Math.max(r.rx, r.ry) * 1.25), ca = Math.cos(r.axis), sa = Math.sin(r.axis);
        const footprint = new Map();
        for (let y = Math.max(1, r.y - reach); y <= Math.min(GH - 2, r.y + reach); y++)
            for (let x = Math.max(1, r.x - reach); x <= Math.min(GW - 2, r.x + reach); x++) {
                const i = y * GW + x;
                if (!eligible(i))
                    continue;
                const dx = x - r.x, dy = y - r.y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
                const edge = 1 + (r.type === 1 ? .20 : .10) * noise(x * .12, y * .12, w.seed + 7201 + r.id)
                    + (r.type === 1 ? .07 * noise(x * .31, y * .31, w.seed + 7207) : 0);
                const radius = Math.hypot(u / r.rx, v / r.ry) / edge;
                const strength = smooth((1 - radius) * 3.8) * smooth((w.dist[i] - 2) / 3);
                if (strength <= .015)
                    continue;
                footprint.set(i, { i, x, y, u, v, radius, strength });
            }
        // A protected basin or coastal inlet may clip the footprint. Preserve it,
        // and leave separated slivers untouched instead of creating broken ranges.
        const todo = [r.center.i], seen = new Set(todo);
        while (todo.length) {
            const p = footprint.get(todo.pop());
            if (!p)
                continue;
            const { i, x, y, u, v, radius, strength } = p;
            if (strength > w.landformStrength[i]) {
                const target = shape(i, x, y, u, v, radius);
                w.height[i] = Math.max(35, lerp(w.height[i], target, strength));
                w.landform[i] = r.type;
                w.landformStrength[i] = strength;
                w.landformRegion[i] = r.id;
            }
            for (const j of [i - 1, i + 1, i - GW, i + GW])
                if (footprint.has(j) && !seen.has(j)) {
                    seen.add(j);
                    todo.push(j);
                }
        }
    };

    // Uplift a sedimentary roof around inherited drainage. The old trunk and its
    // branches stay near their pre-uplift bed, cutting a connected canyon system
    // through a broad tabletop instead of scattering isolated red bumps.
    const mesas = candidates(i => w.dist[i] >= 9 && original[i] > 200 && original[i] < 2200 && Math.abs(w.lat[i]) < 43,
        (i, x, y) => Math.min(w.dist[i], 22) + Math.log1p(catchment[i]) * 3 - w.collision[i] * 5 + noise(x * .05, y * .05, w.seed + 7211) * 8);
    const mesaContinents = new Set();
    for (const c of mesas) {
        const continent = w.continentalProvinceId[c.i];
        if (mesaContinents.has(continent) || !free(c, 19))
            continue;
        const rx = clamp(w.dist[c.i] * .82, 12, 20), ry = rx * .76, axis = hash2(c.x, c.y, w.seed + 7212) * Math.PI;
        const gain = w.params.landformVersion >= 3 ? Math.max(0, w.params.uplift) / 1.2 : 1;
        const level = w.params.landformVersion >= 3 ? w.base[c.i] + (1000 + hash2(c.x, c.y, w.seed + 7213) * 520) * gain : 1850 + hash2(c.x, c.y, w.seed + 7213) * 520;
        const r = make(c, 1, 'red-plateau', ['The Vermilion Tablelands', 'The Copper Labyrinth', 'The Painted Stair'][mesaContinents.size], rx, ry, axis, level,
            'A broad roof of uplifted red sediment stands above branching river canyons. Resistant beds form the mesas and escarpments; the older drainage cuts through their layered walls.');
        let channels = [];
        let coreArea = 0;
        const ca = Math.cos(axis), sa = Math.sin(axis);
        for (let y = Math.max(1, c.y - Math.ceil(rx * 1.3)); y <= Math.min(GH - 2, c.y + rx * 1.3); y++)
            for (let x = Math.max(1, c.x - Math.ceil(rx * 1.3)); x <= Math.min(GW - 2, c.x + rx * 1.3); x++) {
                const i = y * GW + x;
                if (!eligible(i))
                    continue;
                const dx = x - c.x, dy = y - c.y;
                const core = Math.hypot((dx * ca + dy * sa) / rx, (-dx * sa + dy * ca) / ry) < .75;
                if (core)
                    coreArea++;
                if (catchment[i] >= 12)
                    channels.push({ x, y, i, core, width: .85 + clamp(Math.log(catchment[i] / 12) / 5) * .6 });
            }
        // Incise tributaries without erasing every resistant tabletop in a densely
        // dissected catchment. Denser drainage retains its larger connected branches.
        let channelThreshold = 12;
        while (channels.filter(p => p.core).length > coreArea * .11 && channelThreshold < 100) {
            channelThreshold *= 1.3;
            channels = channels.filter(p => catchment[p.i] >= channelThreshold);
        }
        paint(r, (i, x, y, u) => {
            if (w.params.landformVersion >= 3 && gain === 0) return original[i];
            const roof = level + u * 4 + noise(x * .09, y * .09, w.seed + 7214) * 95;
            let distance = 8;
            for (const p of channels)
                distance = Math.min(distance, Math.hypot(x - p.x, y - p.y) / p.width);
            const cut = Math.exp(-distance * distance * .8);
            // Tributaries must penetrate the roof too, not stop at a single river on
            // its edge. An inherited downhill surface keeps the connected channel
            // floors below the roof without cutting a chain of arbitrary deep pits.
            const floor = Math.max(80, Math.min(level - 800, w.filled[i] + 45));
            const sculpted = lerp(roof, floor, cut);
            return w.params.landformVersion >= 3 ? lerp(original[i], sculpted, Math.min(1, gain)) : sculpted;
        });
        r.channelCells = channels.map(p => p.i);
        mesaContinents.add(continent);
        if (mesaContinents.size >= 3)
            break;
    }

    // Long, gently bending fold axes give a range several parallel crests and
    // intervening valleys. The boundary's tangent determines their common bearing.
    const folds = candidates(i => w.dist[i] >= 7 && original[i] > 550 && original[i] < 3600 && Math.abs(w.lat[i]) < 52 && w.collision[i] > .12,
        (i, x, y) => w.collision[i] * 24 + Math.min(w.dist[i], 18) + noise(x * .05, y * .05, w.seed + 7221) * 7);
    const foldContinents = new Set();
    for (const c of folds) {
        const continent = w.continentalProvinceId[c.i];
        if (foldContinents.has(continent) || !free(c, 16))
            continue;
        const b = w.boundaries[w.boundaryId[c.i]], nearestAxis = b ? Math.atan2(b.ny, b.nx) + Math.PI / 2 : Math.PI / 2;
        const axis = w.params.landformVersion >= 3 ? compressionAxisV3(w, c.x, c.y, nearestAxis) : nearestAxis;
        const rx = 24 + hash2(c.x, c.y, w.seed + 7222) * 7, ry = 10 + hash2(c.x, c.y, w.seed + 7223) * 2.5;
        if (!clearBelt(c, rx, ry, axis))
            continue;
        const level = clamp(original[c.i] * .48, 850, 1500);
        const r = make(c, 3, 'folded-ranges', ['The Thousandfold Ranges', 'The Dragonback Marches', 'The Cloudfold Mountains'][foldContinents.size], rx, ry, axis, level,
            w.params.landformVersion >= 2 ? 'Compressed crust rises in unequal mountain blocks. Branching ridges connect staggered summits above broad valleys, narrow gorges and lower mountain passes; older drainage cuts into the uplifted terrain.' :
            'A long belt of compressed crust rises in parallel, bending ridges. Several high crests run together above deep longitudinal valleys, with lower passes between the folds.');
        if (w.params.landformVersion >= 2) {
            paint(r, mountainBeltV2(w, r, original, catchment));
        } else {
        r.ridgeSpacing = 4.7;
        // Each fold shares the belt's bearing but has its own slow curvature,
        // summit rhythm and uplift. Keep the axes separated, so these remain
        // continuous mountain chains and longitudinal valleys rather than cones.
        const ridges = Array.from({ length: 7 }, (_, j) => {
            const k = j - 3, sample = salt => hash2(c.x + k * 7, c.y, w.seed + salt);
            return { across: k * r.ridgeSpacing + (sample(7251) - .5) * .9,
                bend: sample(7252) * Math.PI * 2, phase: sample(7253) * Math.PI * 2,
                period: 2.8 + sample(7254) * 1.6, width: 1.45 + sample(7255) * .4,
                height: 1350 + sample(7256) * 750 };
        });
        paint(r, (i, x, y, u, v) => {
            const bend = Math.sin(u * .065) * .65 + noise(u * .065, 0, w.seed + 7224 + r.id) * .4;
            let uplift = 0;
            for (const ridge of ridges) {
                const axis = ridge.across + bend + Math.sin(u / (rx * .46) + ridge.bend) * .65;
                const distance = Math.abs(v - axis) / ridge.width;
                if (distance >= 1) continue;
                const crest = Math.pow(Math.cos(distance * Math.PI / 2), 1.6);
                const height = ridge.height * (.78 + .22 * Math.cos(u / ridge.period + ridge.phase));
                uplift = Math.max(uplift, crest * height);
            }
            return level + uplift + noise(u * .1, v * .075, w.seed + 7226) * 140;
        });
        }
        foldContinents.add(continent);
        if (foldContinents.size >= 3)
            break;
    }

    // Broad flood-basalt shields and collapsed summit chambers extend existing
    // volcanic/rift provinces. No extra island or unsupported active vent is added.
    const volcanic = candidates(i => w.dist[i] >= 6 && original[i] > 350 && original[i] < 3400 && Math.abs(w.lat[i]) < 52 && (w.rift[i] > .32 || w.arc[i] > .24),
        (i, x, y) => w.rift[i] * 13 + w.arc[i] * 10 + Math.min(w.dist[i], 15) + noise(x * .07, y * .07, w.seed + 7231) * 5);
    const volcanoContinents = new Set();
    for (const c of volcanic) {
        const continent = w.continentalProvinceId[c.i];
        if (volcanoContinents.has(continent) || !free(c, 13) || !clearCore(c, 5))
            continue;
        const rx = 10 + hash2(c.x, c.y, w.seed + 7232) * 3, ry = rx * .86, axis = hash2(c.x, c.y, w.seed + 7233) * Math.PI;
        const level = clamp(original[c.i] * .6 + 450, 950, 1900);
        const r = make(c, 2, 'volcanic', ['The Obsidian Wastes', 'The Ember Cauldron', 'The Ashen Shield'][volcanoContinents.size], rx, ry, axis, level,
            'Successive lava floods built a dark, terraced volcanic shield. Its summit collapsed into a broad caldera, ringed by broken rims and younger lava ridges.');
        r.calderaRadius = 3.6;
        paint(r, (i, x, y, u, v) => {
            const d = Math.hypot(u, v), a = Math.atan2(v, u);
            const rimRadius = r.calderaRadius * (1 + .08 * Math.sin(a * 3));
            const rim = Math.exp(-(((d - rimRadius) / .9) ** 2)) * (1 - .66 * Math.exp(-(((a - .6) / .33) ** 2)));
            const bowl = 1 - smooth((d - 1.4) / 1.7);
            const flows = noise(u * .11, v * .11, w.seed + 7234) * 160 + Math.sin(d * 1.8 + a * .45) * 50;
            return level + rim * 1050 - bowl * 520 + flows;
        });
        volcanoContinents.add(continent);
        if (volcanoContinents.size >= 2)
            break;
    }

    // A small warm limestone province contrasts with the broad highlands. Dissolution
    // leaves clustered towers on a low floor, not a grid of identical isolated cones.
    const limestone = candidates(i => w.dist[i] >= 5 && w.dist[i] <= 17 && original[i] > 120 && original[i] < 1600 && Math.abs(w.lat[i]) < 30,
        (i, x, y) => 12 - Math.abs(w.dist[i] - 9) + noise(x * .075, y * .075, w.seed + 7241) * 8);
    for (const c of limestone) {
        if (!free(c, 12))
            continue;
        const r = make(c, 4, 'karst', 'The Jade Needles', 9, 7, hash2(c.x, c.y, w.seed + 7242) * Math.PI, 430,
            'Water dissolved a warm limestone upland into clustered stone towers. Low connecting valleys separate the pinnacles and carry runoff toward the surrounding rivers.');
        const towers = [];
        for (let k = 0; k < 17; k++) {
            const a = k * 2.39996, d = 1.4 * Math.sqrt(k);
            towers.push({ u: Math.cos(a) * d, v: Math.sin(a) * d * .8, height: 450 + hash2(k, c.i, w.seed + 7243) * 600 });
        }
        paint(r, (i, x, y, u, v) => {
            let spire = 0;
            for (const t of towers)
                spire = Math.max(spire, t.height * Math.exp(-((u - t.u) ** 2 + (v - t.v) ** 2) / 1.1));
            return r.level + noise(u * .14, v * .14, w.seed + 7244) * 90 + spire;
        });
        break;
    }
}

/** Resolve descriptions against the final water/ice surface, so search and picking
 * point at exposed, genuinely generated terrain rather than a buried center marker. */
function describeLandforms(w) {
    const retained = [], remap = new Int16Array(w.landformRegions.length).fill(-1);
    for (const r of w.landformRegions) {
        let best = -Infinity, low = Infinity, high = -Infinity, sum = 0, weightedArea = 0, exposed = 0, cliffs = 0;
        r.area = 0;
        for (let i = 0; i < GN; i++) {
            if (w.landformRegion[i] !== r.id)
                continue;
            r.area++;
            low = Math.min(low, w.height[i]);
            high = Math.max(high, w.height[i]);
            sum += w.height[i];
            weightedArea += w.area[i];
            const x = i % GW, y = i / GW | 0;
            const relief = Math.max(...[cell(x - 1, y), cell(x + 1, y), cell(x, y - 1), cell(x, y + 1)].map(j => Math.abs(w.height[j] - w.height[i])));
            if (relief > 400)
                cliffs++;
            if (w.lake[i] >= 0 || w.ice[i] >= 80)
                continue;
            exposed++;
            const score = w.landformStrength[i] * 10 - Math.hypot(x - r.center.x, y - r.center.y) * .2 - Math.max(0, w.ice[i]) * .1
                + (r.type === 1 ? Math.min(relief, 850) / 150 : 0);
            if (score > best) {
                best = score;
                r.i = i;
                r.x = x;
                r.y = y;
            }
        }
        if (!r.area)
            continue;
        remap[r.id] = retained.length;
        r.id = retained.length;
        retained.push(r);
        r.weightedArea = weightedArea;
        r.statistics = { minHeight: low, maxHeight: high, meanHeight: sum / Math.max(1, r.area), relief: high - low, exposedCells: exposed, cliffCells: cliffs };
        r.viewpoint = exposed ? { i: r.i, x: r.x, y: r.y } : null;
        if (r.viewpoint)
            w.features.push({ id: 'landform-' + r.id, name: r.name, kind: r.kind.toUpperCase().replaceAll('-', ' '), i: r.i, x: r.x, y: r.y, text: r.detail, landform: r.type, region: r.id });
    }
    w.landformRegions = retained;
    for (let i = 0; i < GN; i++)
        if (w.landformRegion[i] >= 0)
            w.landformRegion[i] = remap[w.landformRegion[i]];
}

function basinHydrology(w) {
    const h = w.height, seen = new Uint8Array(GN), lid = new Int32Array(GN).fill(-1), basins = [];
    // Remove the old single-cell lake heuristic; restore the underlying climate biome.
    for (let i = 0; i < GN; i++)
        if (w.biome[i] === 15 || w.biome[i] === 14) {
            w.biome[i] = w.arid[i] < .28 ? (w.temp[i] > 12 ? 4 : 3) : w.arid[i] < .7 ? 5 : w.temp[i] > 21 ? 11 : w.temp[i] < 7 ? 8 : 7;
        }
    w.lake.fill(-1);
    for (let i = 0; i < GN; i++) {
        if (seen[i] || h[i] <= 0 || w.ice[i] > 25 || w.filled[i] - h[i] < 18)
            continue;
        const q = [i];
        seen[i] = 1;
        for (let a = 0; a < q.length; a++) {
            const j = q[a], x = j % GW, y = j / GW | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 1 || xx >= GW - 1 || yy < 1 || yy >= GH - 1)
                    continue;
                const k = yy * GW + xx;
                if (!seen[k] && h[k] > 0 && w.ice[k] <= 25 && w.filled[k] - h[k] > 18 && Math.abs(w.filled[k] - w.filled[j]) < 5) {
                    seen[k] = 1;
                    q.push(k);
                }
            }
        }
        const maxDepth = Math.max(...q.map(j => w.filled[j] - h[j]));
        if (q.length < 8 || maxDepth < 70)
            continue;
        const id = basins.length;
        for (const j of q)
            lid[j] = id;
        let spill = Infinity, out = -1;
        for (const j of q)
            if (w.filled[j] < spill) {
                spill = w.filled[j];
                out = j;
            }
        const beds = q.map(j => h[j]).sort((a, b) => a - b), prefix = [0];
        for (const b of beds)
            prefix.push(prefix[prefix.length - 1] + b);
        const maxLevel = spill - .06, K = .005, capacity = q.reduce((a, j) => a + Math.max(0, maxLevel - h[j]) * K, 0);
        basins.push({ id, cells: q, beds, prefix, maxLevel, capacity, K, outlet: out, outletTo: w.down[out], incoming: 0, local: 0, upstream: 0, volume: 0, catchment: 0, depth: maxDepth, level: beds[0], area: 0 });
    }
    // Associate each cell with the first significant depression on its spill route.
    const target = new Int32Array(GN).fill(-1);
    for (const i of w.order) {
        const d = w.down[i];
        target[i] = lid[i] >= 0 ? lid[i] : (d >= 0 ? target[d] : -1);
        if (target[i] >= 0) {
            const b = basins[target[i]];
            b.local += w.localRunoff[i];
            b.catchment++;
        }
    }
    for (const b of basins) {
        let j = b.outlet;
        for (let z = 0; z < GN && j >= 0 && lid[j] === b.id; z++)
            j = w.down[j];
        b.outletTo = j;
        b.downstream = j >= 0 ? target[j] : -1;
        if (b.downstream === b.id)
            b.downstream = -1;
        b.avgRain = b.cells.reduce((a, j) => a + w.rain[j], 0) / b.cells.length;
        b.avgEvap = b.cells.reduce((a, j) => a + (.33 + Math.max(0, w.temp[j] + 5) * .032) * w.params.aridity * .63, 0) / b.cells.length;
        b.avgLocal = b.cells.reduce((a, j) => a + w.localRunoff[j], 0) / b.cells.length;
    }
    const levelFromVolume = (b, V) => {
        let lo = 0, hi = b.beds.length;
        while (lo < hi) {
            const m = (lo + hi + 1) >> 1, v = (m * b.beds[m - 1] - b.prefix[m]) * b.K;
            if (v <= V)
                lo = m;
            else
                hi = m - 1;
        }
        const n = Math.max(1, lo);
        return Math.min(b.maxLevel, (V / b.K + b.prefix[n]) / n);
    };
    let totalError = 0;
    for (const b of basins.slice().sort((a, b) => b.maxLevel - a.maxLevel)) {
        b.incoming = b.local + b.upstream;
        let V = 0, added = 0, evaporated = 0, spilled = 0, lastOut = 0;
        const steps = 180, dt = .25;
        for (let t = 0; t < steps; t++) {
            const L = levelFromVolume(b, V), A = b.beds.filter(z => z < L).length;
            const supply = (Math.max(0, b.incoming - b.avgLocal * A) + b.avgRain * A) * dt;
            V += supply;
            added += supply;
            const evap = Math.min(V, b.avgEvap * A * dt);
            V -= evap;
            evaporated += evap;
            const out = Math.max(0, V - b.capacity);
            V -= out;
            spilled += out;
            if (t >= steps - 40)
                lastOut += out / (40 * dt);
        }
        b.volume = V;
        b.level = levelFromVolume(b, V);
        b.waterCells = b.cells.filter(j => h[j] < b.level - .5);
        b.area = b.waterCells.length;
        b.overflow = lastOut;
        b.closed = b.overflow < .025;
        b.saline = b.closed && b.avgEvap > b.avgRain * 1.1;
        b.kind = b.closed ? (b.saline ? 'Terminal salt lake' : 'Closed inland lake') : 'Overflow lake';
        b.budget = { added, evaporated, spilled, stored: V, residual: Math.abs(added - evaporated - spilled - V) / Math.max(1, added) };
        totalError = Math.max(totalError, b.budget.residual);
        for (const i of b.waterCells) {
            w.lake[i] = b.level;
            w.biome[i] = 15;
        }
        if (b.closed)
            for (const i of b.cells)
                if (w.lake[i] < 0 && w.arid[i] < .6)
                    w.biome[i] = 14;
        if (b.downstream >= 0)
            basins[b.downstream].upstream += b.overflow;
    }
    w.basins = basins;
    w.lakeId = lid;
    w.basinTarget = target;
    w.waterBudgetError = totalError;
    w.riverDown = new Int32Array(w.down);
    w.riverSurface = new Float32Array(w.filled);
    w.flow = new Float64Array(GN);
    // Re-route a terminal catchment to its actual lake surface, not to the old
    // ocean spill level. Local minor depressions use a priority-flood surface.
    const handled = new Uint8Array(GN);
    for (const b of basins) {
        const heap = new MinHeap();
        const roots = b.waterCells.length ? b.waterCells : [b.cells.reduce((a, j) => h[j] < h[a] ? j : a, b.cells[0])];
        for (const i of roots) {
            handled[i] = 1;
            w.riverDown[i] = -1;
            w.riverSurface[i] = b.waterCells.length ? b.level : h[i];
            heap.push(i, w.riverSurface[i]);
        }
        while (heap.length) {
            const [i, hi] = heap.pop(), x = i % GW, y = i / GW | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || xx >= GW || yy < 0 || yy >= GH)
                    continue;
                const j = yy * GW + xx;
                if (handled[j] || target[j] !== b.id)
                    continue;
                handled[j] = 1;
                w.riverDown[j] = i;
                w.riverSurface[j] = Math.max(h[j], hi + .025);
                heap.push(j, w.riverSurface[j]);
            }
        }
    }
    for (let i = 0; i < GN; i++)
        if (h[i] > 0 && w.lake[i] < 0)
            w.flow[i] = w.localRunoff[i];
    // Surplus lake discharge is injected outside the lake; it is not duplicated
    // as a second outflow through the lake bed. Terminal basins inject nothing.
    for (const b of basins)
        if (b.outletTo >= 0 && b.overflow > 0)
            w.flow[b.outletTo] += b.overflow;
    const indegree = new Int16Array(GN), queue = new Int32Array(GN);
    let head = 0, tail = 0;
    for (let i = 0; i < GN; i++)
        if (w.riverDown[i] >= 0)
            indegree[w.riverDown[i]]++;
    for (let i = 0; i < GN; i++)
        if (indegree[i] === 0)
            queue[tail++] = i;
    while (head < tail) {
        const i = queue[head++], d = w.riverDown[i];
        if (d >= 0) {
            w.flow[d] += w.flow[i];
            if (--indegree[d] === 0)
                queue[tail++] = d;
        }
    }
    w.riverCycleCells = GN - tail;
    // Small closed catchments need a cartographic stream threshold different
    // from continent-scale trunks. Widths are symbolic, not calibrated discharge.
    w.channelThreshold = new Float32Array(GN).fill(w.riverThreshold);
    let inlandRiverCells = 0;
    for (let i = 0; i < GN; i++)
        if (target[i] >= 0) {
            const b = basins[target[i]];
            w.channelThreshold[i] = Math.min(w.riverThreshold, Math.max(.30, b.incoming * .055));
            if (b.closed && w.lake[i] < 0 && w.riverDown[i] >= 0 && w.flow[i] > w.channelThreshold[i])
                inlandRiverCells++;
        }
    w.inlandRiverCells = inlandRiverCells;
    w.wetness = new Float32Array(GN);
    let wetland = 0;
    for (let y = 1; y < GH - 1; y++)
        for (let x = 1; x < GW - 1; x++) {
            const i = y * GW + x;
            if (h[i] <= 0 || w.lake[i] > 0 || w.ice[i] > 25 || w.temp[i] < 0)
                continue;
            const ns = [i - 1, i + 1, i - GW, i + GW], slope = Math.max(...ns.map(j => Math.abs(h[j] - h[i])));
            const lakeEdge = ns.some(j => w.lake[j] > 0), water = clamp(w.flow[i] / w.riverThreshold / 2), low = clamp(1 - slope / 340);
            const wet = (water * .8 + (lakeEdge ? .7 : 0) + clamp(w.rain[i] / 2) * .4) * low;
            w.wetness[i] = wet;
            if (w.arid[i] > .6 && h[i] < 1200 && wet > .55) {
                w.biome[i] = w.dist[i] <= 1 && w.temp[i] > 20 ? 19 : wet > .8 ? 18 : 20;
                wetland++;
            }
        }
    w.hydrologyStats = { basins: basins.length, lakes: basins.filter(b => b.area >= 8).length, largeLakes: basins.filter(b => b.area >= 45).length, closedLakes: basins.filter(b => b.closed && b.area >= 3).length, lakeCells: basins.reduce((s, b) => s + b.area, 0), wetlandCells: wetland, fjords: w.fjords.length, budgetResidual: totalError, inlandRiverCells, riverCycleCells: w.riverCycleCells };
}
function describeHydrology(w) {
    const largest = w.basins.filter(b => b.area >= 8).sort((a, b) => b.area - a.area);
    const names = ['Aster Inland Sea', 'Lake Mirrengard', 'Lake Silvermere', 'The Saffron Lake', 'Lake Willowglass', 'The Azure Basin', 'Lake Greywater'];
    for (let k = 0; k < largest.length; k++) {
        const b = largest[k];
        b.name = names[k % names.length] + (k >= names.length ? ' ' + (k + 1) : '');
        let i = b.waterCells[Math.floor(b.waterCells.length / 2)] || b.cells[0];
        b.i = i;
        b.x = i % GW;
        b.y = i / GW | 0;
        if (k < 4)
            w.features.push({ id: 'lake-' + b.id, name: b.name, kind: b.kind.toUpperCase(), i, x: b.x, y: b.y, text: `A depression with ${b.catchment} upstream catchment cells. ${b.closed ? 'Water terminates here; evaporation competes with inflow.' : 'Surplus water spills into the downstream river.'} Its lake level comes from an explicit uncalibrated water-storage balance.` });
    }
    for (const b of w.basins)
        if (!b.name) {
            b.name = 'Basin ' + (b.id + 1);
            b.i = b.cells[0];
            b.x = b.i % GW;
            b.y = b.i / GW | 0;
        }
    for (const f of w.fjords.slice(0, 2))
        w.features.push({ ...f, id: 'fjord-' + f.id, kind: 'DROWNED GLACIAL VALLEY', text: 'A narrow coastal valley was carved below sea level during a prescribed earlier glacial episode. This is a conditioned landform, not a time-integrated glacial erosion result.' });
    const wet = findRegion(w, i => [18, 19, 20].includes(w.biome[i]));
    if (wet)
        w.features.push({ id: 'wetland', name: 'The Reedwater Fens', kind: 'WETLAND & FLOODPLAIN', i: wet.i, x: wet.i % GW, y: wet.i / GW | 0, text: 'Runoff convergence or a lake margin combines with low slope and available moisture. Wet ground affects settlement and travel costs.' });
    const jungle = findRegion(w, i => w.biome[i] === 11);
    if (jungle)
        w.features.push({ id: 'jungle', name: 'The Emerald Canopy', kind: 'TROPICAL RAINFOREST', i: jungle.i, x: jungle.i % GW, y: jungle.i / GW | 0, text: 'Warm conditions and transported rainfall sustain a wet forest province.' });
    w.audit.waterBudget = w.waterBudgetError;
}
/* VII: Legendary places.
 * Every named wonder is the extreme of a quantity the physical model already
 * computed — the strongest headwater, the highest standing lake, the deepest
 * trench. The myth is a label placed on a real cell; it moves no terrain and
 * writes to no field. A world that lacks the landform simply lacks the legend.
 */
function nameLegends(w) {
    w.legends = [];
    const add = (id, name, kind, i, lore, basis) => {
        if (!(i >= 0) || i >= GN)
            return null;
        const f = { id, name, kind, i, x: i % GW, y: i / GW | 0, legend: true, lore, basis, text: lore + ' In the model: ' + basis };
        w.legends.push(f);
        return f;
    };
    const down = w.riverDown || w.down, threshold = i => w.channelThreshold?.[i] || w.riverThreshold;
    // The strongest river's own headwater, reached by walking its trunk upstream.
    let mouth = -1, mouthFlow = 0;
    for (let i = 0; i < GN; i++)
        if (w.height[i] > 0 && w.flow[i] > mouthFlow) {
            const d = down[i];
            if (d < 0 || w.height[d] <= 0) {
                mouthFlow = w.flow[i];
                mouth = i;
            }
        }
    if (mouth >= 0 && mouthFlow > w.riverThreshold * 4) {
        let source = mouth;
        for (let step = 0; step < GN; step++) {
            const x = source % GW, y = source / GW | 0;
            let best = -1, bestFlow = 0;
            // Drainage is eight-connected, so a four-neighbour walk loses the trunk
            // at the first diagonal step and never leaves the coast.
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy)
                        continue;
                    const j = cell(x + dx, y + dy);
                    if (down[j] === source && w.height[j] > 0 && w.flow[j] > bestFlow) {
                        bestFlow = w.flow[j];
                        best = j;
                    }
                }
            if (best < 0 || bestFlow < threshold(best))
                break;
            source = best;
        }
        add('dragonwell', 'The Dragonwell', 'SOURCE OF THE GREAT RIVER', source, 'The first dragon is said to have broken the mountain here and left its breath running downhill forever; every hold along the water claims descent from that morning.', `the headwater of the world's largest river, traced upstream from a mouth carrying ${Math.round(mouthFlow).toLocaleString()} units of modeled discharge, standing at ${Math.round(w.height[source]).toLocaleString()} m.`);
    }
    // The highest standing water surface in the world.
    let sky = -1, skyLevel = 0;
    for (let i = 0; i < GN; i++)
        if (w.lake[i] > skyLevel) {
            skyLevel = w.lake[i];
            sky = i;
        }
    if (sky >= 0 && skyLevel > 900) {
        const basin = w.basins[w.lakeId[sky]], crater = w.volcanoes.some(v => Math.hypot(v.x - sky % GW, v.y - (sky / GW | 0)) < 2.5);
        add('skymirror', 'The Skymirror', crater ? 'LAKE IN A DEAD CRATER' : 'THE HIGH LAKE', sky, crater ? 'Pilgrims climb to a still lake sitting in the throat of a burnt-out mountain, and swear the sky it reflects is the older of the two.' : 'A lake held so high that travellers describe walking up to the edge of the sky and finding water there.', `the highest standing water surface in the world at ${Math.round(skyLevel).toLocaleString()} m${basin?.name ? ', the ' + basin.kind.toLowerCase() + ' named ' + basin.name : ''}.`);
    }
    // The most powerful erupting vent.
    const burning = w.volcanoes.filter(v => v.active).sort((a, b) => b.magnitude - a.magnitude)[0];
    if (burning)
        add('emberthroat', 'The Emberthroat', 'THE MOUNTAIN THAT NEVER SLEEPS', burning.i, 'The mountain is counted a living thing with an appetite, and the calendars of three peoples begin on the night it last spoke.', `the largest vent still marked active, a ${burning.type.toLowerCase()} of ${Math.round(burning.magnitude).toLocaleString()} m modeled relief contribution.`);
    // The largest single elevation step along a channel.
    let fall = -1, fallDrop = 0;
    for (let i = 0; i < GN; i++) {
        const d = down[i];
        if (d < 0 || w.height[i] <= 0 || w.lake[i] > 0 || w.flow[i] < threshold(i) * 3)
            continue;
        const drop = w.height[i] - w.height[d];
        if (drop > fallDrop) {
            fallDrop = drop;
            fall = i;
        }
    }
    if (fall >= 0 && fallDrop > 220)
        add('weepingstair', 'The Weeping Stair', 'THE GREAT CATARACT', fall, 'The water is said to be a grief that has not finished falling; boatmen going upstream stop here and go no further by any craft.', `the steepest single step on any modeled channel, dropping ${Math.round(fallDrop).toLocaleString()} m between neighbouring cells while carrying ${Math.round(w.flow[fall]).toLocaleString()} units of discharge.`);
    // The largest basin that never reaches the sea.
    const terminal = w.basins.filter(b => b.closed && b.area >= 3).sort((a, b) => b.area - a.area)[0];
    if (terminal)
        add('hollowcrown', 'The Hollow Crown', terminal.saline ? 'THE SALT THAT SWALLOWS RIVERS' : 'THE WATER WITH NO SEA', terminal.i, 'Rivers walk in and are never seen again, and the crust left behind is traded as far as the coast; the local telling is that something beneath is still drinking.', `the largest closed basin, ${terminal.area} cells of water with no outlet to the ocean${terminal.saline ? '; modeled evaporation exceeds rainfall, so salt concentrates' : ''}.`);
    // The two extremes of the elevation field.
    let peak = -1, peakH = 0, abyss = -1, abyssH = 0;
    for (let i = 0; i < GN; i++) {
        if (w.height[i] > peakH) {
            peakH = w.height[i];
            peak = i;
        }
        if (w.height[i] < abyssH) {
            abyssH = w.height[i];
            abyss = i;
        }
    }
    if (peak >= 0)
        add('nightspire', 'The Nightspire', 'THE HIGHEST SUMMIT', peak, 'It keeps the last light after the valleys are dark, which is read either as a watch being kept or a debt being counted, depending on who is asked.', `the highest cell in the world at ${Math.round(peakH).toLocaleString()} m of modeled bedrock elevation.`);
    if (abyss >= 0 && abyssH < -4000)
        add('drownedchoir', 'The Drowned Choir', 'THE DEEPEST WATER', abyss, 'Sailors report a sound over this water on calm nights and will not fish it; the charts of two admiralties simply leave the square blank.', `the deepest point of the modeled ocean floor at ${Math.round(-abyssH).toLocaleString()} m below sea level${w.trench[abyss] > .2 ? ', above a subducting margin' : ''}.`);
    w.legendStats = { count: w.legends.length, ids: w.legends.map(f => f.id) };
}
if (typeof module !== 'undefined')
    module.exports = { generateWorld, GW, GH, GN, BIOME, BOUNDARY, seedHash, random32, noise, clamp, cell, measureLandmasses };
