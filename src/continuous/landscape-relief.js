/** Bounded display relief outside every existing town survey and water corridor.
 * Parent heights, water, city routing and parcel bounds remain model inputs. */
const LandscapeRelief = (() => {
    const version = 2, FADE = .4, cache = new WeakMap();
    const ZERO = {offset: 0, dx: 0, dy: 0};
    let serial = 0;
    function prepare(w, sim) {
        if (!w?.height || w.height.length < GN || !w.lake || w.lake.length < GN || !w.ice || w.ice.length < GN ||
            !w.flow || w.flow.length < GN || !(w.down || w.riverDown) || !Array.isArray(sim?.provinces) || !Array.isArray(sim.realms)) return false;
        const towns = sim.provinces.filter(p => p.settled && p.urbanPop >= 650).slice().sort((a, b) => a.id - b.id);
        const signature = towns.map(p => [p.id, p.x, p.y, p.detailSupport ?? p.urbanSupport ?? p.urbanPop].join(',')).join(';') + '/' +
            sim.realms.filter(r => r.alive).map(r => r.capital).sort((a, b) => a - b).join(',');
        const old = cache.get(w); if (old?.signature === signature) return false;
        const cells = new Array(GN), wet = new Uint8Array(GN), corners = new Float64Array(GN), factors = new Float64Array(GN);
        const add = (guard, x0, y0, x1, y1) => {
            for (let y = Math.max(0, Math.floor(y0 - FADE)); y <= Math.min(GH - 2, Math.floor(y1 + FADE)); y++)
                for (let x = Math.max(0, Math.floor(x0 - FADE)); x <= Math.min(GW - 2, Math.floor(x1 + FADE)); x++)
                    (cells[y * GW + x] ||= []).push(guard);
        };
        for (const g of [{x0: -1, x1: 0, y0: -1, y1: GH}, {x0: GW - 1, x1: GW, y0: -1, y1: GH},
            {x0: -1, x1: GW, y0: -1, y1: 0}, {x0: -1, x1: GW, y0: GH - 1, y1: GH}]) add(g, g.x0, g.y0, g.x1, g.y1);
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
            const i = y * GW + x;
            // Ice on land is a surface to refine. Sea ice retains the same
            // shoreline protection as open water, even at a raised ice surface.
            wet[i] = w.height[i] <= 0 || w.lake[i] > 0 || w.biome?.[i] === 17 ? 1 : 0;
            const pattern = LandscapePatterns.sample(w, x, y);
            corners[i] = pattern.height;
            const slope = CityEnvironment.atlasGrade(w, x, y), rugged = clamp(Math.max(pattern.glacier, pattern.snow, pattern.alpine, pattern.rock));
            // Keep lowland grading intact, but retain fine ice and rock texture
            // on steep terrain. Bilinear factors preserve boundary continuity.
            factors[i] = lerp(1 / (1 + slope * slope * 4), .45 + .55 / (1 + slope * slope * 1.25), rugged);
        }
        // Every mixed water/land patch is kept exactly intact. Only boundary wet
        // vertices need guard records; fully wet interiors are rejected below.
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
            const i = y * GW + x; if (!wet[i]) continue;
            let edge = false;
            for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && xx < GW && yy >= 0 && yy < GH && !wet[yy * GW + xx]) { edge = true; break; }
            }
            if (edge) { const g = {x0: x - 1.12, x1: x + 1.12, y0: y - 1.12, y1: y + 1.12}; add(g, g.x0, g.y0, g.x1, g.y1); }
        }
        for (const p of towns) {
            // A capital can lose its 10% survey allowance before the replacement
            // city finishes streaming. Keep that former footprint protected too.
            const survey = citySurvey(sim, p), span = Math.min(16 * CityEnvironment.cityFootprint, survey.terrainSpan * 1.1);
            const rx = span / 2 + .12, ry = span * survey.depth / survey.width / 2 + .12;
            const g = {x0: p.x - rx, x1: p.x + rx, y0: p.y - ry, y1: p.y + ry}; add(g, g.x0, g.y0, g.x1, g.y1);
        }
        const X = MAP_X / (GW - 1), Z = MAP_Z / (GH - 1), unit = CityEnvironment.cityDimensions.span * CityEnvironment.cityFootprint / CityEnvironment.cityDimensions.width * Math.sqrt(X * Z);
        let rivers = 0;
        for (let i = 0; i < GN; i++) {
            const threshold = Math.min(w.riverThreshold * .6, w.channelThreshold?.[i] || w.riverThreshold);
            if (!(w.height[i] > 0 && w.flow[i] >= threshold)) continue;
            const seen = new Set();
            for (const d of [w.down?.[i], w.riverDown?.[i]]) {
                if (!(d >= 0 && d < GN) || seen.has(d)) continue; seen.add(d);
                const x = i % GW, y = Math.floor(i / GW), dx = d % GW - x, dy = Math.floor(d / GW) - y;
                const length2 = dx * dx + dy * dy; if (!length2 || Math.abs(dx) > 2) continue;
                const radius = .12 + CityEnvironment.riverWidth(w, i) * unit / Math.min(X, Z) * 2;
                const g = {x, y, dx, dy, length2, radius}; add(g, Math.min(x, x + dx) - radius, Math.min(y, y + dy) - radius, Math.max(x, x + dx) + radius, Math.max(y, y + dy) + radius); rivers++;
            }
        }
        cache.set(w, {signature, key: version + '/' + (++serial), cells, wet, corners, factors, towns: towns.length, rivers, last: null});
        return true;
    }
    function sample(w, x, y, relief = 1) {
        const state = cache.get(w); if (!state || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(relief) || relief === 0 || x <= 0 || y <= 0 || x >= GW - 1 || y >= GH - 1) return ZERO;
        if (state.last?.x === x && state.last.y === y && state.last.relief === relief) return state.last.value;
        const a = Math.floor(x), b = Math.floor(y), u = x - a, v = y - b, i = b * GW + a, ids = [i, i + 1, i + GW, i + GW + 1];
        if (ids.some(j => state.wet[j])) return ZERO;
        let mask = 1, mx = 0, my = 0;
        for (const g of state.cells[i] || []) {
            let dx, dy, distance;
            if (g.length2) {
                const t = clamp(((x - g.x) * g.dx + (y - g.y) * g.dy) / g.length2);
                dx = x - g.x - g.dx * t; dy = y - g.y - g.dy * t;
                const length = Math.hypot(dx, dy); distance = length - g.radius;
                if (distance <= 1e-12) return ZERO;
                dx /= length; dy /= length;
            } else {
                dx = x < g.x0 ? x - g.x0 : x > g.x1 ? x - g.x1 : 0;
                dy = y < g.y0 ? y - g.y0 : y > g.y1 ? y - g.y1 : 0;
                // Equivalent footprint arithmetic can differ by one ULP at the
                // edge. Keep that protected edge exactly zero, not 1e-30 relief.
                distance = Math.hypot(dx, dy); if (distance <= 1e-12) return ZERO;
                dx /= distance; dy /= distance;
            }
            if (distance >= FADE) continue;
            const t = distance / FADE, fade = t * t * (3 - 2 * t);
            if (fade < mask) { mask = fade; const derivative = 6 * t * (1 - t) / FADE; mx = derivative * dx; my = derivative * dy; }
        }
        const A = state.corners[i], B = state.corners[i + 1], C = state.corners[i + GW], D = state.corners[i + GW + 1];
        // The shared pattern field and its analytic derivatives use atlas height
        // units. Removing its parent interpolation keeps every original vertex
        // exact and joins adjacent parent patches without a height seam.
        const n = LandscapePatterns.sample(w, x, y), residual = u === 0 && v === 0 ? 0 : n.height - lerp(lerp(A, B, u), lerp(C, D, u), v);
        const dx = n.dx - lerp(B - A, D - C, v), dy = n.dy - lerp(C - A, D - B, u);
        const F = state.factors[i], G = state.factors[i + 1], H = state.factors[i + GW], I = state.factors[i + GW + 1];
        const factor = lerp(lerp(F, G, u), lerp(H, I, u), v), fx = lerp(G - F, I - H, v), fy = lerp(H - F, I - G, u), amp = relief;
        const value = {offset: residual * factor * mask * amp,
            dx: (dx * factor * mask + residual * (fx * mask + factor * mx)) * amp,
            dy: (dy * factor * mask + residual * (fy * mask + factor * my)) * amp};
        state.last = {x, y, relief, value}; return value;
    }
    const offset = (w, x, y, relief = 1) => sample(w, x, y, relief).offset;
    const gradient = (w, x, y, relief = 1) => { const p = sample(w, x, y, relief); return [p.dx, p.dy]; };
    const key = w => cache.get(w)?.key || 'none';
    return {version, prepare, offset, gradient, key};
})();
