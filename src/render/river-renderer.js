/* A terrain-following river sheet. The caller owns channel selection and its
 * screen-space budget; this builder changes neither the drainage nor its banks.
 * Cross-sections can be shared by adjoining segments, including their normals. */
const RiverMesh = (() => {
    function ribbon(g, { a, b, width, steps = 4, across = 2, sample, color, lift = .002,
        crossA, crossB, normalStep = 1e-4 }) {
        const validPoint = p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
        const dx = b?.[0] - a?.[0], dz = b?.[1] - a?.[1], length = Math.hypot(dx, dz);
        if (!validPoint(a) || !validPoint(b) || !(length > 0) || !Number.isFinite(width) || width <= 0)
            return { triangles: 0, vertices: 0, samples: 0, steps: 0, across: 0 };
        if (!Number.isFinite(steps) || steps < 1 || !Number.isFinite(across) || across < 1 ||
            !Number.isFinite(normalStep) || normalStep <= 0 || !Number.isFinite(lift))
            throw new RangeError('River mesh subdivisions, normal spacing and lift must be finite.');
        steps = Math.floor(steps); across = Math.floor(across);
        const perpendicular = [-dz / length * width, dx / length * width];
        crossA = crossA || perpendicular; crossB = crossB || perpendicular;
        if (!validPoint(crossA) || !validPoint(crossB))
            throw new RangeError('River cross-sections must contain finite XZ offsets.');
        let triangles = 0;
        function row(i) {
            const t = i / steps;
            // Explicit endpoints matter: a+(b-a) need not equal b in floating point.
            // Adjacent ribbons must emit byte-identical vertices at their shared join.
            const cx = i === 0 ? a[0] : i === steps ? b[0] : a[0] + dx * t;
            const cz = i === 0 ? a[1] : i === steps ? b[1] : a[1] + dz * t;
            const px = i === 0 ? crossA[0] : i === steps ? crossB[0] : crossA[0] + (crossB[0] - crossA[0]) * t;
            const pz = i === 0 ? crossA[1] : i === steps ? crossB[1] : crossA[1] + (crossB[1] - crossA[1]) * t;
            const vertices = [];
            for (let j = 0; j <= across; j++) {
                const u = j / across * 2 - 1, x = cx + px * u, z = cz + pz * u;
                const y = sample(x, z) + lift;
                // One common derivative spacing keeps lighting independent of LOD,
                // ribbon direction and the adjacent segment's longitudinal budget.
                const nx = -(sample(x + normalStep, z) - sample(x - normalStep, z)) / (2 * normalStep);
                const nz = -(sample(x, z + normalStep) - sample(x, z - normalStep)) / (2 * normalStep);
                const scale = 1 / Math.hypot(nx, 1, nz);
                vertices.push([x, y, z, nx * scale, scale, nz * scale, color[0], color[1], color[2]]);
            }
            return vertices;
        }
        function emit(a, b, c) {
            const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
            if (!up) return;
            // Supplied cross-sections may use either left/right convention.
            if (up > 0) g.smoothTri(a, b, c); else g.smoothTri(a, c, b);
            triangles++;
        }
        let previous = row(0);
        for (let i = 1; i <= steps; i++) {
            const next = row(i);
            for (let j = 0; j < across; j++) {
                emit(previous[j], previous[j + 1], next[j]);
                emit(next[j], previous[j + 1], next[j + 1]);
            }
            previous = next;
        }
        return { triangles, vertices: triangles * 3, samples: (steps + 1) * (across + 1), steps, across };
    }
    return { ribbon };
})();
