/* Read-only political geography. Wilderness is an explicit absence of a claim,
 * not a missing label, and an independent settlement is not uninhabited land. */
const PoliticalLand = (() => {
    const dry = (w, i) => Number.isInteger(i) && i >= 0 && w?.height?.[i] > 0 && (w.lake?.[i] ?? -1) <= 0;
    function status(w, s, i) {
        if (!dry(w, i)) return { kind: 'water', label: 'Water', province: null, realm: null };
        const province = s?.provinces?.[w.provinceId?.[i]], held = s?.realms?.[province?.owner];
        if (held && held.alive !== false)
            return { kind: 'realm', label: RealmNames.fullName(held), province, realm: held };
        return { kind: province?.pop > 0 ? 'communities' : 'wilderness',
            label: province?.pop > 0 ? 'Independent communities' : 'Unclaimed wilderness', province, realm: null };
    }
    function description(w, s, i) {
        const place = status(w, s, i);
        if (place.kind === 'water') return '';
        if (place.realm) return 'Territory of ' + place.label + '.';
        if (place.kind === 'communities') return 'Local communities live here outside the territory of any realm.';
        return 'No realm claims this land. Remote or sparsely inhabited wilderness is shown separately from national territory.';
    }
    /** One label per substantial connected unclaimed region. An anchor is always
     * a real unclaimed land cell, including when the region curves around a realm. */
    function labels(w, s, width = GW) {
        const n = w?.height?.length || 0, height = Math.ceil(n / width), free = new Uint8Array(n), seen = new Uint8Array(n), queue = new Int32Array(n), labels = [];
        for (let i = 0; i < n; i++) free[i] = dry(w, i) && !status(w, s, i).realm ? 1 : 0;
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
                communities ||= !!status(w, s, i).province?.settled;
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
    return Object.freeze({ status, description, labels });
})();
