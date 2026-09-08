/* Low-poly map miniatures. Local axes are forward, left and up; the supplied
 * position is the feet, in whichever coordinate system the caller is drawing.
 * All movement comes from stride: appearance never changes a route or its speed.
 */
Geometry.prototype.figure = function (x, y, z, height, girth, angle, cloth, skin, accent, stride, legs = true, detail = 'full') {
    if (!(height > 0) || !(girth > 0)) return;
    const simple = detail === 'simple', c = Math.cos(angle), s = Math.sin(angle), w = girth / height;
    const point = p => [x + height * (c * p[0] - s * p[1]), y + height * p[2], z + height * (s * p[0] + c * p[1])];
    // A primitive's interior fixes winding for both sides of a mirrored feature.
    // Local forward/side/up becomes world x/z/y, reversing handedness.
    const tri = (a, b, c, col, inside) => {
        if (inside) {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            const direction = (uy * vz - uz * vy) * (a[0] - inside[0]) + (uz * vx - ux * vz) * (a[1] - inside[1]) + (ux * vy - uy * vx) * (a[2] - inside[2]);
            if (direction > 0) { this.tri(point(a), point(c), point(b), col); return; }
        }
        this.tri(point(a), point(b), point(c), col);
    };
    const quad = (a, b, c, d, col, inside) => { tri(a, b, c, col, inside); tri(a, c, d, col, inside); };
    const middle = points => [0, 1, 2].map(k => points.reduce((sum, p) => sum + p[k], 0) / points.length);
    const shade = (col, factor) => col.map(v => Math.max(0, Math.min(1, v * factor)));
    const trousers = shade(cloth, .66), boots = shade(cloth, .40), hair = shade(cloth, .43);
    const pale = skin.map(v => Math.min(1, v * .65 + .30)), shadowSkin = shade(skin, .80), trim = shade(cloth, 1.17);
    const wave = Math.sin(stride), amplitude = legs ? 1 : .32, bob = (1 - Math.cos(stride * 2)) * .004 * amplitude;
    const dwarf = accent === 'broad', beast = accent === 'tail', drake = accent === 'ridge';
    const shoulder = w * (dwarf ? .66 : .58), hips = w * .27, headWidth = w * (dwarf ? .33 : .28);

    // A solid pointed feature, with its triangular base hidden in the parent part.
    // Three faces are enough for ears, noses and the end of a curved horn/tail.
    const spike = (a, b, c, tip, col, closed = false) => {
        const inside = middle([a, b, c, tip]);
        tri(a, b, tip, col, inside); tri(b, c, tip, col, inside); tri(c, a, tip, col, inside);
        if (closed) tri(c, b, a, col, inside);
    };
    const tetra = (a, b, c, d, col) => spike(a, b, c, d, col, true);
    const ring = (p, depth, width) => [[p[0] - depth, p[1] - width, p[2]], [p[0] + depth, p[1] - width, p[2]], [p[0] + depth, p[1] + width, p[2]], [p[0] - depth, p[1] + width, p[2]]];
    const band = (a, b, col, cap = false) => {
        const inside = middle([...a, ...b]);
        for (let k = 0; k < a.length; k++) { const j = (k + 1) % a.length; quad(a[k], b[k], b[j], a[j], col, inside); }
        if (cap) for (let k = 1; k < b.length - 1; k++) tri(b[0], b[k], b[k + 1], col, inside);
    };
    // Tubes follow the joints, unlike an upright cone translated to a moving foot.
    const tubeRing = (a, b, radius, sides) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dy, dz) || 1;
        const axis = [dx / length, dy / length, dz / length];
        const tangent = Math.abs(axis[1]) < .9 ? [axis[2], 0, -axis[0]] : [0, -axis[2], axis[1]];
        const tl = Math.hypot(...tangent) || 1, u = tangent.map(v => v / tl);
        const v = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
        return Array.from({ length: sides }, (_, i) => {
            const t = i * Math.PI * 2 / sides + Math.PI / sides;
            return a.map((n, k) => n + radius * (u[k] * Math.cos(t) + v[k] * Math.sin(t)));
        });
    };
    const bone = (a, b, ra, rb, col, sides = 4) => {
        const aRing = tubeRing(a, b, ra, sides), delta = b.map((v, k) => v - a[k]);
        const bRing = aRing.map(p => p.map((v, k) => a[k] + (v - a[k]) * rb / ra + delta[k]));
        band(aRing, bRing, col);
        return bRing;
    };
    const jewel = (p, depth, width, high, col, upperCol = col) => {
        const r = [[p[0] - depth, p[1], p[2]], [p[0], p[1] - width, p[2]], [p[0] + depth, p[1], p[2]], [p[0], p[1] + width, p[2]]];
        for (let k = 0; k < 4; k++) {
            const j = (k + 1) % 4;
            tri(r[k], r[j], [p[0], p[1], p[2] + high], upperCol, p);
            tri(r[j], r[k], [p[0], p[1], p[2] - high], col, p);
        }
    };
    const curvedPoint = (a, b, tip, radius, col) => {
        const end = bone(a, b, radius, radius * .55, col, 3);
        spike(end[0], end[1], end[2], tip, col);
    };
    const cape = () => {
        const a = [-.061, -shoulder, .76 + bob], b = [-.061, shoulder, .76 + bob];
        const d = [-.14, -w * .64, .34 + bob], e = [-.14, w * .64, .34 + bob], back = [-.205, 0, .48 + bob];
        const inside = middle([a, b, d, e, back]);
        quad(a, d, e, b, trim, inside);
        tri(a, b, back, cloth, inside); tri(b, e, back, cloth, inside); tri(e, d, back, cloth, inside); tri(d, a, back, cloth, inside);
    };

    // Hips, waist and shoulders remain separate readable masses at close range.
    const low = ring([0, 0, .45 + bob], .058, w * .43), waist = ring([0, 0, .59 + bob], .054, w * .37), top = ring([-.008, 0, .765 + bob], .071, shoulder);
    if (simple) band(low, top, cloth);
    else { band(low, waist, cloth); band(waist, top, cloth, true); bone([0, 0, .76 + bob], [0, 0, .845 + bob], .037, .038, skin); }

    for (const side of [-1, 1]) {
        const swing = wave * side * amplitude, lift = Math.max(0, swing) * .065;
        const hip = [0, side * hips, .475 + bob], knee = [.026 + swing * .075, side * hips, .265 + lift * .45], ankle = [swing * .14, side * hips, .046 + lift];
        const shoulderPoint = [-.005, side * shoulder, .74 + bob];
        const elbow = [-swing * .055, side * (shoulder + .018), .61 + bob];
        const wrist = [.022 - swing * .14, side * (shoulder + .015), .485 + bob];
        if (simple) {
            tetra([hip[0] - .034, hip[1] - .022, hip[2]], [hip[0] + .037, hip[1] - .022, hip[2]], [hip[0], hip[1] + .031, hip[2]], ankle, trousers);
            bone(shoulderPoint, wrist, .030, .023, cloth, 3);
            tetra([wrist[0] - .021, wrist[1] - .023, wrist[2]], [wrist[0] + .027, wrist[1] - .023, wrist[2]], [wrist[0], wrist[1] + .026, wrist[2]], [wrist[0] + .013, wrist[1], wrist[2] - .055], skin);
            tetra([ankle[0] - .038, ankle[1] - .030, lift], [ankle[0] + .079, ankle[1] - .030, lift], [ankle[0] + .025, ankle[1] + .036, lift], [ankle[0] - .01, ankle[1], .082 + lift], boots);
        } else {
            bone(hip, knee, w * .15, w * .115, trousers);
            bone(knee, ankle, w * .115, w * .092, trousers);
            bone(shoulderPoint, elbow, w * .145, w * .115, cloth);
            bone(elbow, wrist, w * .115, w * .087, skin);
            jewel([wrist[0] + .008, wrist[1], wrist[2] - .028], .031, .027, .044, skin);
            // A triangular prism gives each boot a flat sole and a projecting toe.
            const a = [ankle[0] - .038, ankle[1] - .034, lift], b = [ankle[0] + .081, ankle[1] - .034, lift], d = [ankle[0] - .020, ankle[1] - .034, .085 + lift];
            const a2 = [a[0], ankle[1] + .034, a[2]], b2 = [b[0], ankle[1] + .034, b[2]], d2 = [d[0], ankle[1] + .034, d[2]];
            const inside = middle([a, b, d, a2, b2, d2]);
            tri(a, d, b, boots, inside); tri(a2, b2, d2, boots, inside);
            quad(a, b, b2, a2, boots, inside); quad(b, d, d2, b2, boots, inside); quad(d, a, a2, d2, boots, inside);
        }
    }

    const headY = .899 + bob, headDepth = beast || drake ? .082 : .071;
    if (simple) jewel([.008, 0, headY], headDepth, headWidth, .103, skin, accent === 'none' || dwarf || accent === 'cloak' ? hair : skin);
    else {
        const jaw = ring([.011, 0, .817 + bob], headDepth * .72, headWidth * .76), cheek = ring([.008, 0, .91 + bob], headDepth, headWidth), crown = ring([-.005, 0, .989 + bob], headDepth * .72, headWidth * .80);
        band(jaw, cheek, skin); band(cheek, crown, skin, true);
        if (!beast && !drake && accent !== 'crest') {
            const hairBase = ring([-.012, 0, .947 + bob], headDepth * 1.03, headWidth * 1.06), hairTop = ring([-.016, 0, .995 + bob], headDepth * .75, headWidth * .88);
            band(hairBase, hairTop, hair, true);
        }
        if (!beast && !drake) spike([.073, -.018, .909 + bob], [.073, .018, .909 + bob], [.073, 0, .856 + bob], [.112, 0, .873 + bob], shadowSkin, true);
        // Tiny inset-looking eyes give the close miniature a face without adding
        // separate spherical parts to every member of a moving crowd.
        for (const side of [-1, 1]) {
            const f = beast || drake ? .088 : .078, eye = side * headWidth * .48, h = .923 + bob;
            quad([f, eye - .010, h - .007], [f, eye + .010, h - .007], [f, eye + .010, h + .007], [f, eye - .010, h + .007], hair, [0, 0, h]);
        }
    }

    if (accent === 'cloak') {
        for (const side of [-1, 1]) spike([-.036, side * headWidth, .936 + bob], [.035, side * headWidth, .926 + bob], [.006, side * headWidth, .870 + bob], [-.042, side * (headWidth + .105), .969 + bob], skin, !simple);
        cape();
        if (!simple) band(ring([-.069, 0, .91 + bob], .017, headWidth * .92), ring([-.086, 0, .735 + bob], .020, headWidth * .72), hair);
    } else if (dwarf) {
        // The beard projects from the jaw and hangs well below it, visibly in profile.
        jewel([.091, 0, .776 + bob], .068, headWidth * 1.05, .140, hair);
        if (!simple) {
            band(ring([0, 0, .55 + bob], .062, w * .405), ring([0, 0, .59 + bob], .062, w * .405), boots);
            for (const side of [-1, 1]) spike([.112, side * .024, .766 + bob], [.079, side * .064, .75 + bob], [.117, side * .063, .80 + bob], [.104, side * .065, .640 + bob], hair, true);
        }
    } else if (beast) {
        // Long muzzle, upright animal ears and a lifted tapering tail, all solid.
        spike([.068, -.050, .912 + bob], [.068, .050, .912 + bob], [.060, 0, .826 + bob], [.184, 0, .866 + bob], shadowSkin, !simple);
        for (const side of [-1, 1]) spike([-.039, side * headWidth, .932 + bob], [.027, side * headWidth, .954 + bob], [-.006, side * headWidth * .53, .977 + bob], [-.035, side * (headWidth + .025), 1.098 + bob], skin, !simple);
        const sway = wave * .028;
        curvedPoint([-.065, 0, .49 + bob], [-.218, sway, .525 + bob], [-.295, sway * 1.6, .681 + bob], .027, shadowSkin);
        if (!simple) {
            for (const side of [-1, 1]) spike([.027, side * headWidth * .7, .907 + bob], [-.034, side * headWidth, .867 + bob], [.018, side * headWidth * .7, .831 + bob], [-.020, side * (headWidth + .044), .876 + bob], skin, true);
            jewel([.165, 0, .865 + bob], .018, .031, .022, hair);
        }
    } else if (accent === 'horns') {
        for (const side of [-1, 1]) curvedPoint([-.003, side * headWidth * .75, .972 + bob], [-.047, side * (headWidth + .057), 1.060 + bob], [.005, side * (headWidth + .067), 1.145 + bob], .032, pale);
    } else if (accent === 'crest') {
        // A deep median fin and paired gills are wedges with thickness, not decals.
        tetra([-.098, -.014, .884 + bob], [.025, -.014, .982 + bob], [-.065, .022, .942 + bob], [-.12, 0, 1.090 + bob], trim);
        for (const side of [-1, 1]) spike([-.018, side * headWidth, .951 + bob], [.022, side * headWidth, .865 + bob], [-.047, side * headWidth, .872 + bob], [-.10, side * (headWidth + .075), .910 + bob], pale, !simple);
        if (!simple) for (const side of [-1, 1]) {
            const swing = wave * side * amplitude;
            tetra([-.01 - swing * .055, side * (shoulder + .016), .625 + bob], [.026 - swing * .14, side * (shoulder + .018), .50 + bob], [-.025 - swing * .09, side * (shoulder + .048), .535 + bob], [-.09 - swing * .09, side * (shoulder + .065), .61 + bob], trim);
        }
    } else if (drake) {
        spike([.067, -.052, .931 + bob], [.067, .052, .931 + bob], [.056, 0, .827 + bob], [.184, 0, .890 + bob], shadowSkin, !simple);
        // Backward horns frame a reptilian head; a broad tail and dorsal spikes
        // distinguish it from the pointed ears and upward tail of Beastfolk.
        for (const side of [-1, 1]) spike([-.024, side * .041, .982 + bob], [.007, side * .073, .952 + bob], [-.059, side * .071, .928 + bob], [-.173, side * .089, 1.025 + bob], pale, !simple);
        curvedPoint([-.062, 0, .48 + bob], [-.207, wave * .026, .345 + bob], [-.366, wave * .044, .296 + bob], .044, shadowSkin);
        if (!simple) for (const h of [.80, .66, .52]) tetra([-.070, -.026, h - .045 + bob], [-.069, .026, h - .040 + bob], [-.074, 0, h + .044 + bob], [-.160, 0, h + .016 + bob], trim);
    } else if (!simple) {
        for (const side of [-1, 1]) spike([-.024, side * headWidth, .923 + bob], [.028, side * headWidth, .918 + bob], [.002, side * headWidth, .863 + bob], [.005, side * (headWidth + .022), .902 + bob], skin, true);
    }
};
