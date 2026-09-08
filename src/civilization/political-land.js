/* Read-only political geography. Wilderness is an explicit absence of a claim,
 * not a missing label, and an independent settlement is not uninhabited land. */
const PoliticalLand = (() => {
    const dry = (w, i) => Number.isInteger(i) && i >= 0 && w?.height?.[i] > 0 && (w.lake?.[i] ?? -1) <= 0;
    const cellKind = (w, i) => w.height[i] > 0 ? ((w.lake?.[i] ?? -1) > 0 ? 2 : 1) : 0;
    const heldBy = (s, province) => {
        const owner = province?.owner, realm = s?.realms?.[owner];
        return Number.isInteger(owner) && owner >= 0 && realm && realm.alive !== false ? owner : -1;
    };
    const cache = new WeakMap(), empty = Object.freeze({ owners: new Int32Array(0), key: 'territory:none' });
    function neighbours(i, width, n, visit) {
        if (i % width > 0) visit(i - 1);
        if (i % width + 1 < width && i + 1 < n) visit(i + 1);
        if (i >= width) visit(i - width);
        if (i + width < n) visit(i + width);
    }
    /** A read-only display map, separate from province cells and their accounting.
     * Obtain this once per render/update, then read owners[i] in constant time.
     * Exact input comparisons also detect in-place conquest, realm death, and
     * restored/edited water rasters without requiring a simulation revision. */
    function territory(w, s, width = GW) {
        const n = w?.height?.length || 0;
        if (!n) return empty;
        width = Number.isInteger(width) && width > 0 ? width : GW;
        const provinces = s?.provinces || [], previous = cache.get(w);
        let unchanged = !!previous && previous.sim === s && previous.width === width && previous.kinds.length === n && previous.held.length === provinces.length;
        for (let p = 0; unchanged && p < provinces.length; p++) unchanged = previous.held[p] === heldBy(s, provinces[p]);
        for (let i = 0; unchanged && i < n; i++) {
            const kind = cellKind(w, i), province = kind === 1 ? (w.provinceId?.[i] ?? -1) : -1;
            unchanged = previous.kinds[i] === kind && previous.provinces[i] === province;
        }
        if (unchanged) return previous.result;

        const kinds = new Uint8Array(n), provinceIds = new Int32Array(n), held = Int32Array.from(provinces, p => heldBy(s, p));
        const owners = new Int32Array(n).fill(-1), seen = new Uint8Array(n), assigned = new Uint8Array(n), queue = new Int32Array(n);
        for (let i = 0; i < n; i++) {
            const kind = kinds[i] = cellKind(w, i), province = provinceIds[i] = kind === 1 ? (w.provinceId?.[i] ?? -1) : -1;
            if (province >= 0 && province < held.length) owners[i] = held[province];
        }
        for (let start = 0; start < n; start++) {
            if (kinds[start] !== 2 || seen[start]) continue;
            let head = 0, tail = 1, open = false;
            const seeds = [];
            queue[0] = start; seen[start] = 1;
            while (head < tail) {
                const i = queue[head++], x = i % width;
                // A water region reaching the raster edge or the ocean is not
                // an enclosed inland lake, even if a malformed lake bit says so.
                open ||= x === 0 || x === width - 1 || i < width || i + width >= n;
                let shoreOwner = Infinity;
                neighbours(i, width, n, j => {
                    if (kinds[j] === 0) open = true;
                    else if (kinds[j] === 1) shoreOwner = Math.min(shoreOwner, owners[j]);
                    else if (!seen[j]) { seen[j] = 1; queue[tail++] = j; }
                });
                if (shoreOwner !== Infinity) { owners[i] = shoreOwner; seeds.push(i); }
            }
            if (open) {
                for (let k = 0; k < tail; k++) owners[queue[k]] = -1;
                continue;
            }
            // A multi-source water-distance partition. Unclaimed shores are
            // real sources (-1), so nearby wilderness never cedes its water to a
            // distant country. Seed order fixes ties: unclaimed, then realm id.
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
        let hash = 2166136261;
        for (let i = 0; i < n; i++) { hash = Math.imul(hash ^ kinds[i], 16777619); hash = Math.imul(hash ^ (owners[i] + 1), 16777619); }
        const result = Object.freeze({ owners, key: 'territory:1:' + width + ':' + n + ':' + (hash >>> 0).toString(16) });
        cache.set(w, { sim: s, width, kinds, provinces: provinceIds, held, result });
        return result;
    }
    function owner(w, s, i, width = GW) {
        if (dry(w, i)) return heldBy(s, s?.provinces?.[w.provinceId?.[i]]);
        return Number.isInteger(i) && i >= 0 && w?.height?.[i] > 0 && w.lake?.[i] > 0 ? territory(w, s, width).owners[i] ?? -1 : -1;
    }
    function status(w, s, i, width = GW) {
        if (!dry(w, i)) {
            const realm = s?.realms?.[owner(w, s, i, width)];
            return realm ? { kind: 'realm', label: RealmNames.fullName(realm), province: null, realm, water: true }
                : { kind: 'water', label: 'Water', province: null, realm: null };
        }
        const province = s?.provinces?.[w.provinceId?.[i]], held = s?.realms?.[province?.owner];
        if (held && held.alive !== false)
            return { kind: 'realm', label: RealmNames.fullName(held), province, realm: held };
        return { kind: province?.pop > 0 ? 'communities' : 'wilderness',
            label: province?.pop > 0 ? 'Independent communities' : 'Unclaimed wilderness', province, realm: null };
    }
    function description(w, s, i, width = GW) {
        const place = status(w, s, i, width);
        if (place.kind === 'water') return '';
        if (place.realm) return 'Territory of ' + place.label + '.';
        if (place.kind === 'communities') return 'Local communities live here outside the territory of any realm.';
        return 'No realm claims this land. Remote or sparsely inhabited wilderness is shown separately from national territory.';
    }
    /** One label per substantial connected unclaimed region. An anchor is always
     * a real unclaimed land cell, including when the region curves around a realm. */
    function labels(w, s, width = GW) {
        const n = w?.height?.length || 0, height = Math.ceil(n / width), free = new Uint8Array(n), seen = new Uint8Array(n), queue = new Int32Array(n), labels = [], owners = territory(w, s, width).owners;
        for (let i = 0; i < n; i++) free[i] = dry(w, i) && owners[i] < 0 ? 1 : 0;
        for (let start = 0; start < n; start++) {
            if (!free[start] || seen[start]) continue;
            let head = 0, tail = 1, sx = 0, sy = 0, area = 0, communities = false;
            queue[0] = start; seen[start] = 1;
            while (head < tail) {
                const i = queue[head++], x = i % width, y = Math.floor(i / width), weight = w.area?.[i] ?? 1;
                sx += x * weight; sy += y * weight; area += weight;
                // A few scattered residents do not turn an entire icefield
                // into a settlement; their individual location cards still
                // identify them as independent communities.
                communities ||= !!s?.provinces?.[w.provinceId?.[i]]?.settled;
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
                name: communities ? 'Independent communities' : 'Unclaimed wilds',
                kind: 'NO REALM', wilderness: true });
        }
        return labels.sort((a, b) => b.area - a.area || a.i - b.i);
    }
    return Object.freeze({ territory, owner, status, description, labels });
})();
