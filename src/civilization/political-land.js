/* Read-only sovereign geography. Directly administered province cells remain
 * fixed; outer territory is derived separately from population and resources. */
const PoliticalLand = (() => {
    const dry = (w, i) => Number.isInteger(i) && i >= 0 && w?.height?.[i] > 0 && (w.lake?.[i] ?? -1) <= 0;
    const cellKind = (w, i) => w.height[i] > 0 ? ((w.lake?.[i] ?? -1) > 0 ? 2 : 1) : 0;
    const heldBy = (s, province) => {
        const owner = province?.owner, realm = s?.realms?.[owner];
        return Number.isInteger(owner) && owner >= 0 && realm && realm.alive !== false ? owner : -1;
    };
    const cache = new WeakMap(), empty = Object.freeze({ owners: new Int32Array(0), areas: Object.freeze([]), key: 'territory:none' });
    const weight = (w, i) => Number.isFinite(w.area?.[i]) ? w.area[i] : 1;
    function origin(s, realm, width, n) {
        const p = s?.provinces?.[realm?.capital];
        if (Number.isInteger(p?.i) && p.i >= 0 && p.i < n) return p.i;
        if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) {
            const x = Math.max(0, Math.min(width - 1, Math.round(p.x))), y = Math.max(0, Math.min(Math.ceil(n / width) - 1, Math.round(p.y)));
            return Math.min(n - 1, y * width + x);
        }
        return -1;
    }
    function neighbours(i, width, n, visit) {
        if (i % width > 0) visit(i - 1);
        if (i % width + 1 < width && i + 1 < n) visit(i + 1);
        if (i >= width) visit(i - width);
        if (i + width < n) visit(i + width);
    }
    // Sorted sources make equal-length paths independent of traversal order.
    // Ocean can participate in a distance query without receiving territory.
    function spread(owners, kinds, width, water = false) {
        const n = owners.length, seeds = [], queue = new Int32Array(n), distance = new Int32Array(n).fill(-1);
        for (let i = 0; i < n; i++) if (owners[i] >= 0) seeds.push(i);
        seeds.sort((a, b) => owners[a] - owners[b] || a - b);
        let head = 0, tail = 0;
        for (const i of seeds) { queue[tail++] = i; distance[i] = 0; }
        while (head < tail) {
            const i = queue[head++];
            neighbours(i, width, n, j => {
                if (distance[j] >= 0 || !water && kinds[j] !== 1) return;
                distance[j] = distance[i] + 1; owners[j] = owners[i]; queue[tail++] = j;
            });
        }
        return distance;
    }
    /** A read-only display map, separate from province cells and their accounting.
     * Obtain this once per render/update, then read owners[i] in constant time.
     * Exact input comparisons also detect in-place conquest, realm death, and
     * restored/edited water rasters without requiring a simulation revision. */
    function territory(w, s, width = GW) {
        const n = w?.height?.length || 0;
        if (!n) return empty;
        width = Number.isInteger(width) && width > 0 ? width : GW;
        const provinces = s?.provinces || [], realms = s?.realms || [], previous = cache.get(w);
        let unchanged = !!previous && previous.sim === s && previous.width === width && previous.kinds.length === n && previous.held.length === provinces.length && previous.origins.length === realms.length;
        for (let p = 0; unchanged && p < provinces.length; p++) unchanged = previous.held[p] === heldBy(s, provinces[p]);
        for (let r = 0; unchanged && r < realms.length; r++) unchanged = previous.living[r] === +(!!realms[r] && realms[r].alive !== false) && previous.origins[r] === origin(s, realms[r], width, n);
        for (let i = 0; unchanged && i < n; i++) {
            const kind = cellKind(w, i), province = kind === 1 ? (w.provinceId?.[i] ?? -1) : -1;
            unchanged = previous.kinds[i] === kind && previous.provinces[i] === province && previous.weights[i] === weight(w, i);
        }
        if (unchanged) return previous.result;

        const kinds = new Uint8Array(n), provinceIds = new Int32Array(n), held = Int32Array.from(provinces, p => heldBy(s, p)), weights = Float64Array.from(w.height, (_, i) => weight(w, i));
        const living = Uint8Array.from(realms, r => !!r && r.alive !== false), origins = Int32Array.from(realms, r => origin(s, r, width, n));
        const owners = new Int32Array(n).fill(-1), seen = new Uint8Array(n), assigned = new Uint8Array(n), queue = new Int32Array(n);
        let direct = 0, firstLand = -1;
        for (let i = 0; i < n; i++) {
            const kind = kinds[i] = cellKind(w, i), province = provinceIds[i] = kind === 1 ? (w.provinceId?.[i] ?? -1) : -1;
            if (kind === 1 && firstLand < 0) firstLand = i;
            if (province >= 0 && province < held.length) { owners[i] = held[province]; if (owners[i] >= 0) direct++; }
        }
        // Normally the existing province raster supplies every source. A valid
        // living country with no direct raster cells can still govern land;
        // use its capital only when there are no direct sources anywhere.
        if (!direct && firstLand >= 0) for (let r = 0; r < realms.length; r++) {
            if (!living[r]) continue;
            let seed = firstLand, best = Infinity;
            if (origins[r] >= 0) for (let i = 0; i < n; i++) {
                if (kinds[i] !== 1) continue;
                const d = Math.abs(i % width - origins[r] % width) + Math.abs(Math.floor(i / width) - Math.floor(origins[r] / width));
                if (d < best) { best = d; seed = i; }
            }
            if (owners[seed] < 0) owners[seed] = r;
        }
        spread(owners, kinds, width);
        if (owners.some((o, i) => o < 0 && kinds[i] === 1) && owners.some(o => o >= 0)) {
            const nearest = owners.slice(), distance = spread(nearest, kinds, width, true), visited = new Uint8Array(n);
            // An uninhabited island stays one coherent territory. Compare its
            // nearest shore to all established coasts, without filling the sea
            // or letting arbitrary processing order annex an island chain.
            for (let start = 0; start < n; start++) {
                if (kinds[start] !== 1 || owners[start] >= 0 || visited[start]) continue;
                let head = 0, tail = 1, closest = start;
                queue[0] = start; visited[start] = 1;
                while (head < tail) {
                    const i = queue[head++];
                    if (distance[i] < distance[closest] || distance[i] === distance[closest] && (nearest[i] < nearest[closest] || nearest[i] === nearest[closest] && i < closest)) closest = i;
                    neighbours(i, width, n, j => {
                        if (kinds[j] !== 1 || owners[j] >= 0 || visited[j]) return;
                        visited[j] = 1; queue[tail++] = j;
                    });
                }
                for (let k = 0; k < tail; k++) owners[queue[k]] = nearest[closest];
            }
        }
        let offshore = null, offshoreDistance = null;
        for (let start = 0; start < n; start++) {
            if (kinds[start] !== 2 || seen[start]) continue;
            let head = 0, tail = 1;
            const seeds = [];
            queue[0] = start; seen[start] = 1;
            while (head < tail) {
                const i = queue[head++];
                let shoreOwner = Infinity;
                neighbours(i, width, n, j => {
                    if (kinds[j] === 1 && owners[j] >= 0) shoreOwner = Math.min(shoreOwner, owners[j]);
                    else if (kinds[j] === 2 && !seen[j]) { seen[j] = 1; queue[tail++] = j; }
                });
                if (shoreOwner !== Infinity) { owners[i] = shoreOwner; seeds.push(i); }
            }
            if (!seeds.length) {
                // Positive-height water is inland territory even on a cropped
                // raster edge. A tiny water-only island uses the nearest coast;
                // an all-lake world falls back to an existing capital.
                if (!offshore) {
                    offshore = Int32Array.from(owners, (owner, i) => kinds[i] === 1 ? owner : -1);
                    offshoreDistance = spread(offshore, kinds, width, true);
                }
                let realm = -1, best = Infinity;
                for (let k = 0; k < tail; k++) {
                    const i = queue[k], d = offshoreDistance[i], r = offshore[i];
                    if (r >= 0 && (d < best || d === best && r < realm)) { realm = r; best = d; }
                }
                if (realm < 0) for (let r = 0; r < realms.length; r++) if (living[r]) {
                    let d = Infinity;
                    if (origins[r] >= 0) for (let k = 0; k < tail; k++) { const i = queue[k]; d = Math.min(d, Math.abs(i % width - origins[r] % width) + Math.abs(Math.floor(i / width) - Math.floor(origins[r] / width))); }
                    if (realm < 0 || d < best) { realm = r; best = d; }
                }
                for (let k = 0; k < tail; k++) owners[queue[k]] = realm;
                continue;
            }
            // The same completed shore map partitions international lakes.
            seeds.sort((a, b) => owners[a] - owners[b] || a - b);
            head = tail = 0;
            for (const i of seeds) { queue[tail++] = i; assigned[i] = 1; }
            while (head < tail) {
                const i = queue[head++];
                neighbours(i, width, n, j => {
                    if (kinds[j] !== 2 || assigned[j]) return;
                    assigned[j] = 1; owners[j] = owners[i]; queue[tail++] = j;
                });
            }
        }
        const areas = Array.from(realms, () => ({ land: 0, water: 0, cells: 0 })), bits = new Uint32Array(weights.buffer);
        let hash = 2166136261;
        for (let i = 0; i < n; i++) {
            hash = Math.imul(hash ^ kinds[i], 16777619); hash = Math.imul(hash ^ (owners[i] + 1), 16777619);
            hash = Math.imul(hash ^ bits[i * 2], 16777619); hash = Math.imul(hash ^ bits[i * 2 + 1], 16777619);
            if (owners[i] >= 0) { const a = areas[owners[i]]; a[kinds[i] === 2 ? 'water' : 'land'] += weights[i]; a.cells++; }
        }
        const result = Object.freeze({ owners, areas: Object.freeze(areas.map(Object.freeze)), key: 'territory:2:' + width + ':' + n + ':' + (hash >>> 0).toString(16) });
        cache.set(w, { sim: s, width, kinds, provinces: provinceIds, held, living, origins, weights, result });
        return result;
    }
    function owner(w, s, i, width = GW) {
        if (dry(w, i)) { const direct = heldBy(s, s?.provinces?.[w.provinceId?.[i]]); if (direct >= 0) return direct; }
        return Number.isInteger(i) && i >= 0 && w?.height?.[i] > 0 ? territory(w, s, width).owners[i] ?? -1 : -1;
    }
    function status(w, s, i, width = GW) {
        if (!dry(w, i)) {
            const realm = s?.realms?.[owner(w, s, i, width)];
            return realm ? { kind: 'realm', label: RealmNames.fullName(realm), province: null, realm, water: true }
                : { kind: 'water', label: 'Water', province: null, realm: null };
        }
        const province = s?.provinces?.[w.provinceId?.[i]], id = owner(w, s, i, width), held = s?.realms?.[id];
        if (held) return { kind: 'realm', label: RealmNames.fullName(held), province, realm: held, derived: heldBy(s, province) !== id };
        return { kind: 'neutral', label: 'No countries yet', province, realm: null };
    }
    function description(w, s, i, width = GW) {
        const place = status(w, s, i, width);
        if (place.kind === 'water') return '';
        if (place.realm) return 'Territory of ' + place.label + '.';
        return 'No countries have formed in this world yet.';
    }
    /** Neutral geography labels only when the world has no living countries. */
    function labels(w, s, width = GW) {
        const n = w?.height?.length || 0, height = Math.ceil(n / width), free = new Uint8Array(n), seen = new Uint8Array(n), queue = new Int32Array(n), labels = [], owners = territory(w, s, width).owners;
        for (let i = 0; i < n; i++) free[i] = dry(w, i) && owners[i] < 0 ? 1 : 0;
        for (let start = 0; start < n; start++) {
            if (!free[start] || seen[start]) continue;
            let head = 0, tail = 1, sx = 0, sy = 0, area = 0;
            queue[0] = start; seen[start] = 1;
            while (head < tail) {
                const i = queue[head++], x = i % width, y = Math.floor(i / width), weight = w.area?.[i] ?? 1;
                sx += x * weight; sy += y * weight; area += weight;
                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const xx = x + dx, yy = y + dy, j = yy * width + xx;
                    if (xx < 0 || xx >= width || yy < 0 || yy >= height || j >= n || !free[j] || seen[j]) continue;
                    seen[j] = 1; queue[tail++] = j;
                }
            }
            if (tail < 28 || area <= 0) continue;
            const cx = sx / area, cy = sy / area;
            let anchor = start, score = -Infinity;
            for (let k = 0; k < tail; k++) {
                const i = queue[k], x = i % width, y = Math.floor(i / width);
                let interior = 0;
                for (const [dx, dy] of [[-2,0],[2,0],[0,-2],[0,2]]) {
                    const xx = x + dx, yy = y + dy;
                    if (xx >= 0 && xx < width && yy >= 0 && yy < height && free[yy * width + xx]) interior++;
                }
                const next = interior * 3 - Math.hypot(x - cx, y - cy);
                if (next > score) { score = next; anchor = i; }
            }
            labels.push({ i: anchor, x: anchor % width, y: Math.floor(anchor / width), area,
                name: 'No countries yet', kind: '', neutral: true });
        }
        return labels.sort((a, b) => b.area - a.area || a.i - b.i);
    }
    return Object.freeze({ territory, owner, status, description, labels });
})();
