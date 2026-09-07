/** The face that tells you the story.
 *
 * A cartoon bust, drawn as SVG from numbers — no image files, no fonts, nothing fetched,
 * which is the same rule the rest of the atlas keeps. The people is whoever the saga drew
 * as its narrator, so a Drakekin harbourmaster and a Sylvan archivist are the same code
 * with different parameters.
 *
 * The seven faces differ in build, ears, brow, muzzle and crown only. None of them is
 * drawn nobler, older, uglier or more dangerous than another, and the palette is each
 * people's own colour from the civilization model rather than anything assigned here.
 */
const Portrait = (() => {
    // Indexed exactly like PEOPLES. Every field is a shape parameter, not a judgement.
    // `snout` is [width, length, kind]: a dragon's reaches past the jaw and squares off,
    // a beastfolk's is short and round, and most peoples have none at all.
    const FACE = [
        { head: [23, 25], jaw: .86, ear: 'round', crown: null, snout: null, brow: 1.0, hair: 'crop' },
        { head: [19.5, 27], jaw: .70, ear: 'long', crown: 'circlet', snout: null, brow: .78, hair: 'fall' },
        { head: [25.5, 22.5], jaw: 1.06, ear: 'round', crown: null, snout: null, brow: 1.35, hair: 'beard' },
        { head: [21.5, 24], jaw: .92, ear: 'tuft', crown: null, snout: [.55, 13, 'round'], brow: 1.1, hair: 'mane' },
        { head: [21.5, 24.5], jaw: .90, ear: 'round', crown: 'horns', snout: null, brow: 1.2, hair: 'crop' },
        { head: [20.5, 25.5], jaw: .80, ear: 'fin', crown: 'fin', snout: null, brow: .82, hair: 'slick' },
        { head: [20, 22], jaw: .96, ear: 'fin', crown: 'ridge', snout: [.68, 31, 'square'], brow: 1.3, hair: 'scale' }
    ];
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
    const rnd = (seed, salt) => hash2(seed | 0, salt | 0, 6271);
    const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(clamp(r, 0, .9999) * list.length))];
    /** Skin is the people's own colour, lightened; cloth is that colour worn deeper. */
    function palette(people, seed) {
        const base = hex(PEOPLES[people].color), tone = rnd(seed, 3);
        return {
            skin: css(mix(base, [246, 226, 200], .46 + tone * .26)),
            shade: css(mix(base, [70, 56, 48], .30)),
            cloth: css(mix(base, [46, 42, 40], .34 + rnd(seed, 5) * .2)),
            hair: css(mix(base, pick([[58, 44, 36], [92, 78, 60], [38, 36, 40], [140, 126, 100], [104, 60, 44]], rnd(seed, 7)), .62)),
            eye: css(mix(base, pick([[52, 92, 96], [92, 70, 44], [58, 70, 110], [70, 96, 62]], rnd(seed, 11)), .55)),
            line: css(mix(base, [34, 30, 28], .74))
        };
    }
    /** A snout is drawn as its own shape in front of the jaw, not as a bump on the face.
     * A dragon's runs well past the head and squares off with nostrils at the tip; the
     * beastfolk's is short, round and wet-nosed. Both carry their own mouth. */
    function snout(spec, rx, ry, cy, p, speaking) {
        if (!spec)
            return '';
        const [w, len, kind] = spec, top = cy + ry * .08, half = rx * w, tipHalf = half * (kind === 'square' ? .74 : .82);
        const end = top + len, out = [];
        out.push(kind === 'square'
            ? `<path d="M${50 - half},${top} L${50 - tipHalf},${end - 5} Q${50 - tipHalf},${end} ${50 - tipHalf + 5},${end} L${50 + tipHalf - 5},${end} Q${50 + tipHalf},${end} ${50 + tipHalf},${end - 5} L${50 + half},${top} Z" fill="${p.skin}" stroke="${p.line}" stroke-width="2" stroke-linejoin="round"/>`
            : `<ellipse cx="50" cy="${top + len * .48}" rx="${half}" ry="${len * .56}" fill="${p.skin}" stroke="${p.line}" stroke-width="2"/>`);
        // Nostrils at the tip, and the mouth line across it.
        const nose = kind === 'square' ? end - 15 : top + len * .22;
        out.push(`<ellipse cx="${50 - tipHalf * .44}" cy="${nose}" rx="2" ry="2.6" fill="${p.line}"/><ellipse cx="${50 + tipHalf * .44}" cy="${nose}" rx="2" ry="2.6" fill="${p.line}"/>`);
        const lip = end - (kind === 'square' ? 7 : len * .22);
        if (speaking === false)
            out.push(`<path d="M${50 - tipHalf * .74},${lip} q${tipHalf * .74},4 ${tipHalf * 1.48},0" fill="none" stroke="${p.line}" stroke-width="2" stroke-linecap="round"/>`);
        else {
            out.push(`<path d="M${50 - tipHalf * .74},${lip - 1} q${tipHalf * .74},${kind === 'square' ? 8 : 6} ${tipHalf * 1.48},0 q${-tipHalf * .74},2 ${-tipHalf * 1.48},0 Z" fill="${p.line}" opacity=".85"/>`);
            if (kind === 'square')
                out.push([-1, 1].map(s => `<path d="M${50 + s * tipHalf * .52},${lip + 1} l${s * 2.4},5 l${s * 1.6},-5 Z" fill="#f6f1e2"/>`).join(''));
        }
        return out.join('');
    }
    function ears(kind, rx, cy, p) {
        if (kind === 'long')
            return [-1, 1].map(s => `<path d="M${50 + s * rx * .92},${cy - 2} Q${50 + s * (rx + 15)},${cy - 20} ${50 + s * (rx + 3)},${cy + 6} Z" fill="${p.skin}" stroke="${p.line}" stroke-width="1.6" stroke-linejoin="round"/>`).join('');
        if (kind === 'tuft')
            return [-1, 1].map(s => `<path d="M${50 + s * rx * .55},${cy - 19} L${50 + s * (rx * .40)},${cy - 34} L${50 + s * (rx * 1.02)},${cy - 20} Z" fill="${p.skin}" stroke="${p.line}" stroke-width="1.6" stroke-linejoin="round"/>`).join('');
        if (kind === 'fin')
            return [-1, 1].map(s => `<path d="M${50 + s * rx * .90},${cy - 4} Q${50 + s * (rx + 13)},${cy - 2} ${50 + s * (rx + 2)},${cy + 12} Z" fill="${p.shade}" stroke="${p.line}" stroke-width="1.4" stroke-linejoin="round" opacity=".92"/>`).join('');
        return [-1, 1].map(s => `<ellipse cx="${50 + s * rx * .98}" cy="${cy + 2}" rx="4.4" ry="5.6" fill="${p.skin}" stroke="${p.line}" stroke-width="1.6"/>`).join('');
    }
    function crown(kind, rx, ry, cy, p) {
        if (kind === 'horns')
            return [-1, 1].map(s => `<path d="M${50 + s * rx * .72},${cy - ry * .74} Q${50 + s * (rx + 12)},${cy - ry - 10} ${50 + s * (rx + 4)},${cy - ry - 20}" fill="none" stroke="${p.shade}" stroke-width="6.5" stroke-linecap="round"/>`).join('');
        if (kind === 'ridge')
            // Backswept horns and a row of crest spikes: the pair is what makes the
            // silhouette read as a dragon rather than as an animal with a long face.
            return [-1, 1].map(s => `<path d="M${50 + s * rx * .80},${cy - ry * .58} Q${50 + s * (rx + 16)},${cy - ry - 4} ${50 + s * (rx + 10)},${cy - ry - 20}" fill="none" stroke="${p.shade}" stroke-width="7" stroke-linecap="round"/>`).join('')
                + [0, 1, 2].map(k => { const o = (k - 1) * 8.5, h = 10 - Math.abs(k - 1) * 3.5;
                    return `<path d="M${50 + o - 4.5},${cy - ry + Math.abs(k - 1) * 2.5} L${50 + o},${cy - ry - h} L${50 + o + 4.5},${cy - ry + Math.abs(k - 1) * 2.5} Z" fill="${p.shade}" stroke="${p.line}" stroke-width="1.2" stroke-linejoin="round"/>`; }).join('');
        if (kind === 'fin')
            return `<path d="M${50 - 11},${cy - ry + 3} Q50,${cy - ry - 17} ${50 + 11},${cy - ry + 3} Q50,${cy - ry + 8} ${50 - 11},${cy - ry + 3} Z" fill="${p.shade}" stroke="${p.line}" stroke-width="1.4" stroke-linejoin="round"/>`;
        if (kind === 'circlet')
            return `<path d="M${50 - rx * .92},${cy - ry * .48} Q50,${cy - ry * .84} ${50 + rx * .92},${cy - ry * .48}" fill="none" stroke="${p.cloth}" stroke-width="2.6" stroke-linecap="round"/><circle cx="50" cy="${cy - ry * .70}" r="2.6" fill="${p.eye}" stroke="${p.line}" stroke-width="1"/>`;
        return '';
    }
    function hair(kind, rx, ry, cy, p) {
        if (kind === 'beard')
            // A beard hangs BELOW the mouth and carries a moustache above it. Filling the
            // whole lower face instead just reads as a hood with eyes over it.
            return `<path d="M${50 - rx * .80},${cy + ry * .40} Q${50 - rx * .62},${cy + ry * 1.34} 50,${cy + ry * 1.42} Q${50 + rx * .62},${cy + ry * 1.34} ${50 + rx * .80},${cy + ry * .40} Q50,${cy + ry * .86} ${50 - rx * .80},${cy + ry * .40} Z" fill="${p.hair}" stroke="${p.line}" stroke-width="1.6" stroke-linejoin="round"/>`
                + `<path d="M${50 - rx * .52},${cy + ry * .44} q${rx * .26},4.5 ${rx * .52},0 q${rx * .26},-4.5 ${rx * .52},0" fill="${p.hair}" stroke="${p.line}" stroke-width="1.4" stroke-linejoin="round"/>`;
        if (kind === 'fall')
            return `<path d="M${50 - rx},${cy - ry * .30} Q${50 - rx * 1.16},${cy + ry * 1.05} ${50 - rx * .58},${cy + ry * 1.12} L${50 - rx * .80},${cy + ry * .10} Z" fill="${p.hair}" stroke="${p.line}" stroke-width="1.3"/>`
                + `<path d="M${50 + rx},${cy - ry * .30} Q${50 + rx * 1.16},${cy + ry * 1.05} ${50 + rx * .58},${cy + ry * 1.12} L${50 + rx * .80},${cy + ry * .10} Z" fill="${p.hair}" stroke="${p.line}" stroke-width="1.3"/>`
                + `<path d="M${50 - rx * .98},${cy - ry * .34} Q50,${cy - ry * 1.16} ${50 + rx * .98},${cy - ry * .34} Q50,${cy - ry * .58} ${50 - rx * .98},${cy - ry * .34} Z" fill="${p.hair}" stroke="${p.line}" stroke-width="1.4"/>`;
        if (kind === 'mane')
            return `<path d="M${50 - rx * 1.02},${cy - ry * .26} Q50,${cy - ry * 1.34} ${50 + rx * 1.02},${cy - ry * .26} Q${50 + rx * .5},${cy - ry * .74} 50,${cy - ry * .66} Q${50 - rx * .5},${cy - ry * .74} ${50 - rx * 1.02},${cy - ry * .26} Z" fill="${p.hair}" stroke="${p.line}" stroke-width="1.5" stroke-linejoin="round"/>`;
        if (kind === 'slick')
            return `<path d="M${50 - rx * .96},${cy - ry * .40} Q50,${cy - ry * 1.22} ${50 + rx * .96},${cy - ry * .40} Q50,${cy - ry * .80} ${50 - rx * .96},${cy - ry * .40} Z" fill="${p.shade}" stroke="${p.line}" stroke-width="1.3"/>`;
        if (kind === 'scale')
            return [0, 1, 2, 3].map(k => `<path d="M${50 - 15 + k * 10},${cy - ry * .52} q5,-5 10,0" fill="none" stroke="${p.shade}" stroke-width="1.7" stroke-linecap="round" opacity=".8"/>`).join('');
        return `<path d="M${50 - rx * .98},${cy - ry * .38} Q50,${cy - ry * 1.26} ${50 + rx * .98},${cy - ry * .38} Q50,${cy - ry * .72} ${50 - rx * .98},${cy - ry * .38} Z" fill="${p.hair}" stroke="${p.line}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    /** One bust. `seed` varies the face within a people; `speaking` opens the mouth. */
    function svg(people, seed = 0, options = {}) {
        const f = FACE[people] || FACE[0], p = palette(people, seed), size = options.size || 96;
        const [rx, ry] = f.head, cy = 44, slit = people === 6, speaking = options.speaking !== false;
        const eyeY = cy + (f.snout ? -2 : 1), eyeX = rx * .46, open = .82 + rnd(seed, 13) * .5;
        const smile = (rnd(seed, 17) - .35) * 4;
        const parts = [
            // Shoulders first, so the head sits in front of the collar.
            `<path d="M12,100 Q16,${74 + f.jaw * 3} 50,72 Q84,${74 + f.jaw * 3} 88,100 Z" fill="${p.cloth}" stroke="${p.line}" stroke-width="2" stroke-linejoin="round"/>`,
            `<path d="M${50 - 9},${cy + ry * .78} h18 v${10} h-18 Z" fill="${p.skin}" stroke="${p.line}" stroke-width="1.6"/>`,
            ears(f.ear, rx, cy, p),
            `<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="${p.skin}" stroke="${p.line}" stroke-width="2.2"/>`,
            snout(f.snout, rx, ry, cy, p, options.speaking),
            hair(f.hair, rx, ry, cy, p),
            crown(f.crown, rx, ry, cy, p),
            // Eyes. A slit pupil is a lizard's eye, and carries no character with it.
            `<ellipse cx="${50 - eyeX}" cy="${eyeY}" rx="${5.4 * open}" ry="${5.8 * open}" fill="#fbf7ec" stroke="${p.line}" stroke-width="1.5"/>`,
            `<ellipse cx="${50 + eyeX}" cy="${eyeY}" rx="${5.4 * open}" ry="${5.8 * open}" fill="#fbf7ec" stroke="${p.line}" stroke-width="1.5"/>`,
            slit ? `<ellipse cx="${50 - eyeX}" cy="${eyeY}" rx="1.5" ry="4.4" fill="${p.line}"/><ellipse cx="${50 + eyeX}" cy="${eyeY}" rx="1.5" ry="4.4" fill="${p.line}"/>`
                : `<circle cx="${50 - eyeX}" cy="${eyeY}" r="2.7" fill="${p.eye}"/><circle cx="${50 + eyeX}" cy="${eyeY}" r="2.7" fill="${p.eye}"/>`
                    + `<circle cx="${50 - eyeX}" cy="${eyeY}" r="1.3" fill="${p.line}"/><circle cx="${50 + eyeX}" cy="${eyeY}" r="1.3" fill="${p.line}"/>`,
            `<circle cx="${50 - eyeX + 1.9}" cy="${eyeY - 2}" r="1.2" fill="#fff" opacity=".9"/><circle cx="${50 + eyeX + 1.9}" cy="${eyeY - 2}" r="1.2" fill="#fff" opacity=".9"/>`,
            // Brows carry the expression, and every face gets the same neutral one.
            [-1, 1].map(s => `<path d="M${50 + s * eyeX - 6},${eyeY - 8.5 * f.brow} q6,${-2.6 * f.brow} 12,0" fill="none" stroke="${p.line}" stroke-width="${2 * f.brow}" stroke-linecap="round"/>`).join(''),
            // Mouth, for the faces that have no snout carrying one. Mid-sentence, because
            // they are telling you something — but a wide black oval reads as alarm, so
            // this is a lip line with a little space under it.
            f.snout ? '' : speaking
                ? `<path d="M${50 - 7.5},${cy + ry * .58} q7.5,${5 + smile} 15,0 q-7.5,2.5 -15,0 Z" fill="${p.line}" opacity=".85"/>`
                : `<path d="M${50 - 7},${cy + ry * .58} q7,${3 + smile} 14,0" fill="none" stroke="${p.line}" stroke-width="2" stroke-linecap="round"/>`,
            // A gill line, for the people the model gives them to.
            f.ear === 'fin' && !f.snout ? [0, 1].map(k => `<path d="M${50 - rx * .72},${cy + 6 + k * 5} q6,1.5 9,0" fill="none" stroke="${p.line}" stroke-width="1.2" opacity=".55"/>`).join('') : ''
        ];
        return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${PEOPLES[people].name} narrator" focusable="false">${parts.join('')}</svg>`;
    }
    return { svg, palette, FACE, version: 1 };
})();
