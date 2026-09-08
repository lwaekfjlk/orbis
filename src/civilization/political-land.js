/* Read-only political geography. Preserve open wildness and existing provinces;
 * fill domestic holes without changing the physical or demographic ledgers. */
const PoliticalLand = (() => {
    const dry = (w, i) => Number.isInteger(i) && i >= 0 && w?.height?.[i] > 0 && (w.lake?.[i] ?? -1) <= 0;
    const rawKind = (w, i) => w.height[i] > 0 ? ((w.lake?.[i] ?? -1) > 0 ? 2 : 1) : 0;
    const heldBy = (s, province) => {
        const owner = province?.owner, realm = s?.realms?.[owner];
        return Number.isInteger(owner) && owner >= 0 && realm && realm.alive !== false ? owner : -1;
    };
    const cache = new WeakMap(), empty = Object.freeze({ owners: new Int32Array(0), inlandWater: new Uint8Array(0), areas: Object.freeze([]), key: 'territory:none' });
    const weight = (w, i) => Number.isFinite(w.area?.[i]) ? w.area[i] : 1;
    function neighbours(i, width, n, visit) {
        if (i % width > 0) visit(i - 1);
        if (i % width + 1 < width && i + 1 < n) visit(i + 1);
        if (i >= width) visit(i - width);
        if (i + width < n) visit(i + width);
    }
    const edge = (i, width, n) => i % width === 0 || i % width === width - 1 || i < width || i + width >= n;
    function fillHoles(owners, kinds, width, queue) {
        const n = owners.length, seen = new Uint8Array(n);
        for (let start = 0; start < n; start++) {
            if (!kinds[start] || owners[start] >= 0 || seen[start]) continue;
            let head = 0, tail = 1, outside = false, boundary = -1, foreign = false;
            queue[0] = start; seen[start] = 1;
            while (head < tail) {
                const i = queue[head++];
                outside ||= edge(i, width, n);
                neighbours(i, width, n, j => {
                    if (!kinds[j]) outside = true;
                    else if (owners[j] >= 0) {
                        if (boundary < 0) boundary = owners[j];
                        else if (boundary !== owners[j]) foreign = true;
                    } else if (!seen[j]) { seen[j] = 1; queue[tail++] = j; }
                });
            }
            // A foreign enclave is a legitimate inner boundary. A component
            // touching the sea or raster edge is genuinely open, not a hole.
            if (!outside && !foreign && boundary >= 0)
                for (let k = 0; k < tail; k++) owners[queue[k]] = boundary;
        }
    }
    /** Obtain once per render/update, then read owners[i] and inlandWater[i].
     * Exact comparisons detect conquest, extinction and in-place raster edits.
     * Arrays are read-only display snapshots; nothing is stored on world/sim. */
    function territory(w, s, width = GW) {
        const n = w?.height?.length || 0;
        if (!n) return empty;
        width = Number.isInteger(width) && width > 0 ? width : GW;
        const provinces = s?.provinces || [], realms = s?.realms || [], previous = cache.get(w);
        let unchanged = !!previous && previous.sim === s && previous.width === width && previous.raw.length === n && previous.held.length === provinces.length && previous.realmCount === realms.length;
        for (let p = 0; unchanged && p < provinces.length; p++) unchanged = previous.held[p] === heldBy(s, provinces[p]);
        for (let i = 0; unchanged && i < n; i++) {
            const kind = rawKind(w, i), province = kind === 1 ? (w.provinceId?.[i] ?? -1) : -1;
            unchanged = previous.raw[i] === kind && previous.provinces[i] === province && previous.weights[i] === weight(w, i);
        }
        if (unchanged) return previous.result;

        const raw = Uint8Array.from(w.height, (_, i) => rawKind(w, i)), kinds = raw.slice(), provinceIds = new Int32Array(n);
        const held = Int32Array.from(provinces, p => heldBy(s, p)), weights = Float64Array.from(w.height, (_, i) => weight(w, i));
        const owners = new Int32Array(n).fill(-1), inlandWater = new Uint8Array(n), ocean = new Uint8Array(n), queue = new Int32Array(n);
        // A below-sea-level bed is not necessarily open ocean: closed inland
        // seas otherwise punch artificial holes through a surrounding country.
        // Only negative/zero beds connected to the raster edge are ocean.
        let head = 0, tail = 0;
        for (let i = 0; i < n; i++) if (!raw[i] && edge(i, width, n)) { ocean[i] = 1; queue[tail++] = i; }
        while (head < tail) {
            const i = queue[head++];
            neighbours(i, width, n, j => {
                if (raw[j] || ocean[j]) return;
                ocean[j] = 1; queue[tail++] = j;
            });
        }
        for (let i = 0; i < n; i++) {
            if (!raw[i] && !ocean[i]) kinds[i] = 2;
            inlandWater[i] = kinds[i] === 2 ? 1 : 0;
            const province = provinceIds[i] = kinds[i] === 1 ? (w.provinceId?.[i] ?? -1) : -1;
            if (province >= 0 && province < held.length) owners[i] = held[province];
        }
        fillHoles(owners, kinds, width, queue);
        const seen = new Uint8Array(n), assigned = new Uint8Array(n);
        for (let start = 0; start < n; start++) {
            if (kinds[start] !== 2 || seen[start]) continue;
            head = 0; tail = 1;
            const seeds = [];
            queue[0] = start; seen[start] = 1;
            while (head < tail) {
                const i = queue[head++];
                let shoreOwner = Infinity;
                neighbours(i, width, n, j => {
                    if (kinds[j] === 1) shoreOwner = Math.min(shoreOwner, owners[j]);
                    else if (kinds[j] === 2 && !seen[j]) { seen[j] = 1; queue[tail++] = j; }
                });
                if (shoreOwner !== Infinity) { owners[i] = shoreOwner; seeds.push(i); }
            }
            // Shared lakes follow shortest water paths from their actual shores.
            // Wildness remains a source too. Equal-distance ties favor wildness,
            // then the lower country id, independently of traversal order.
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
        // Shore partitioning can isolate a small unowned island/water pocket.
        // Close that domestic hole, while retaining every foreign-owned cell.
        fillHoles(owners, kinds, width, queue);
        const areas = Array.from(realms, () => ({ land: 0, water: 0, cells: 0 })), bits = new Uint32Array(weights.buffer);
        let hash = 2166136261;
        for (let i = 0; i < n; i++) {
            hash = Math.imul(hash ^ kinds[i], 16777619); hash = Math.imul(hash ^ (owners[i] + 1), 16777619);
            hash = Math.imul(hash ^ bits[i * 2], 16777619); hash = Math.imul(hash ^ bits[i * 2 + 1], 16777619);
            if (owners[i] >= 0) { const a = areas[owners[i]]; a[kinds[i] === 2 ? 'water' : 'land'] += weights[i]; a.cells++; }
        }
        const result = Object.freeze({ owners, inlandWater, areas: Object.freeze(areas.map(Object.freeze)), key: 'territory:3:' + width + ':' + n + ':' + (hash >>> 0).toString(16) });
        cache.set(w, { sim: s, width, raw, provinces: provinceIds, held, realmCount: realms.length, weights, result });
        return result;
    }
    function owner(w, s, i, width = GW) {
        if (!Number.isInteger(i) || i < 0 || i >= (w?.height?.length || 0)) return -1;
        if (dry(w, i)) { const direct = heldBy(s, s?.provinces?.[w.provinceId?.[i]]); if (direct >= 0) return direct; }
        return territory(w, s, width).owners[i] ?? -1;
    }
    function status(w, s, i, width = GW) {
        if (!Number.isInteger(i) || i < 0 || i >= (w?.height?.length || 0)) return { kind: 'water', label: 'Water', province: null, realm: null };
        if (!dry(w, i)) {
            const t = territory(w, s, width), realm = s?.realms?.[t.owners[i]];
            if (!t.inlandWater[i]) return { kind: 'water', label: 'Water', province: null, realm: null };
            return realm ? { kind: 'realm', label: RealmNames.fullName(realm), province: null, realm, water: true }
                : { kind: 'wildness', label: 'wildness', province: null, realm: null, water: true };
        }
        const province = s?.provinces?.[w.provinceId?.[i]], id = owner(w, s, i, width), held = s?.realms?.[id];
        if (held) return { kind: 'realm', label: RealmNames.fullName(held), province, realm: held, derived: heldBy(s, province) !== id };
        return { kind: 'wildness', label: 'wildness', province, realm: null };
    }
    function description(w, s, i, width = GW) {
        const place = status(w, s, i, width);
        if (place.kind === 'water') return '';
        return place.realm ? 'Territory of ' + place.label + '.' : 'wildness';
    }
    /** One label per substantial open unowned region, anchored on actual land. */
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
                neighbours(i, width, n, j => { if (!free[j] || seen[j]) return; seen[j] = 1; queue[tail++] = j; });
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
            labels.push({ i: anchor, x: anchor % width, y: Math.floor(anchor / width), area, name: 'wildness', kind: '', wildness: true });
        }
        return labels.sort((a, b) => b.area - a.area || a.i - b.i);
    }
    return Object.freeze({ territory, owner, status, description, labels });
})();
