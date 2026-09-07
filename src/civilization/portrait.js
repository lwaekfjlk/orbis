/** Seeded, self-contained vector portraits for the atlas's seven peoples.
 * Anatomical silhouettes, quiet expressions and layered colour planes stay legible
 * at 72px. No image/font requests, SVG resource IDs, or mutable random state.
 */
const Portrait = (() => {
    const FACE = [
        { head: [17.5, 24], jaw: .78, ear: 'round', crown: null, snout: null, brow: 1, hair: 'crop' },
        { head: [15.5, 25], jaw: .66, ear: 'long', crown: 'circlet', snout: null, brow: .8, hair: 'fall' },
        { head: [22, 22], jaw: .95, ear: 'round', crown: null, snout: null, brow: 1.2, hair: 'beard' },
        { head: [19, 23], jaw: .85, ear: 'tuft', crown: null, snout: [.62, 12, 'round'], brow: 1, hair: 'mane' },
        { head: [17, 24], jaw: .74, ear: 'round', crown: 'horns', snout: null, brow: 1, hair: 'crop' },
        { head: [16.5, 24], jaw: .72, ear: 'fin', crown: 'fin', snout: null, brow: .8, hair: 'slick' },
        { head: [19, 23], jaw: .92, ear: 'fin', crown: 'ridge', snout: [.72, 18, 'square'], brow: 1.1, hair: 'scale' }
    ];
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const css = c => `rgb(${c.join(',')})`;
    const rnd = (seed, salt) => hash2(seed | 0, salt | 0, 6271);
    const validPeople = people => Number.isInteger(people) && FACE[people] ? people : 0;
    const n = value => +value.toFixed(2);
    function palette(people, seed = 0) {
        people = validPeople(people);
        const base = hex(PEOPLES[people].color), tone = rnd(seed, 3);
        const skin = mix(base, [241, 207, 165], .30 + tone * .32);
        // hash2 can return exactly 1; keep that endpoint inside the four swatches.
        const hair = mix(base, [[44, 33, 29], [66, 46, 33], [195, 184, 154], [50, 49, 47]][Math.min(3, Math.floor(rnd(seed, 7) * 4))], .82);
        const cloth = mix(base, [23, 36, 35], .69);
        return {
            skin: css(skin), shade: css(mix(skin, [73, 47, 44], .27)),
            light: css(mix(skin, [255, 237, 204], .30)),
            cloth: css(cloth), fold: css(mix(cloth, [10, 22, 23], .37)),
            seam: css(mix(cloth, [192, 177, 136], .38)),
            hair: css(hair), strand: css(mix(hair, [227, 205, 161], .26)),
            eye: css(mix(base, [109, 133, 102], .42)),
            line: css(mix(base, [27, 28, 27], .88)),
            gold: css(mix(base, [218, 188, 117], .75)),
            backdrop: css(mix(base, [23, 37, 37], .82))
        };
    }
    // Fixed precision keeps the offline markup compact; all attributes are internal.
    const path = (d, fill, stroke = 'none', width = .7, extra = '') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
    const ellipse = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${extra}/>`;
    const line = (d, colour, width = .7, extra = '') => path(d, 'none', colour, width, extra);
    const sides = fn => [-1, 1].map(fn).join('');

    function setting(p) {
        return path('M0 0H100V100H0Z', p.backdrop)
            + ellipse(50, 46, 37, 40, p.seam, ' opacity=".12"')
            + line('M12 76V43A38 38 0 0 1 88 43V76 M16 70V43A34 34 0 0 1 84 43V70', p.gold, .45, ' opacity=".24"')
            + line('M46 8H54 M50 5V11 M8 47H12 M88 47H92', p.gold, .6, ' opacity=".5"');
    }
    function clothing(p, f, seed) {
        const wide = f.hair === 'beard' ? 4 : 0, clasp = 66 + rnd(seed, 29) * 5;
        return path(`M${8-wide} 100Q11 85 28 81L40 76H60L72 81Q89 85 ${92+wide} 100Z`, p.cloth, p.line, .9)
            + path('M42 62H58L60 78L50 87L40 78Z', p.shade, p.line)
            + path('M43 64H54L55 77L49 82L43 77Z', p.skin)
            + path('M38 76L49 87L43 100H20L27 83Z', p.cloth, p.line)
            + path('M61 76L51 88L57 100H83L73 84Z', p.fold, p.line)
            + path('M37 76L47 86L41 92L31 81Z', p.seam)
            + path('M61 76L53 86L59 91L69 81Z', p.seam)
            + line('M31 85L24 99 M68 86L78 99 M48 91L46 100', p.seam, .7)
            + line('M29 81L39 91 M70 82L60 90', p.gold, .65)
            + ellipse(clasp, 86, 2.7, 2.7, p.line)
            + ellipse(clasp, 86, 2.1, 2.1, p.gold)
            + path(`M${n(clasp)} 84.5L${n(clasp+1)} 86L${n(clasp)} 87.5L${n(clasp-1)} 86Z`, p.cloth);
    }
    function ears(f, p, rx) {
        const x = s => n(50 + s * (rx - 1));
        if (f.ear === 'tuft') return sides(s => {
            const a = x(s), b = n(50+s*23), c = n(50+s*11);
            return path(`M${a} 35Q${b} 25 ${b} 14Q${c} 19 ${c} 31Z`, p.hair, p.line, .8)
                + path(`M${a} 29L${n(50+s*21)} 19L${n(50+s*14)} 27Z`, p.shade)
                + line(`M${n(50+s*21)} 18L${n(50+s*20)} 14`, p.strand);
        });
        if (f.ear === 'long') return sides(s => path(`M${x(s)} 39Q${n(50+s*22)} 34 ${n(50+s*32)} 26Q${n(50+s*28)} 46 ${x(s)} 51Z`, p.skin, p.line, .8)
            + path(`M${x(s)} 44L${n(50+s*27)} 32L${n(50+s*21)} 44Z`, p.shade)
            + line(`M${n(50+s*19)} 43L${n(50+s*25)} 35`, p.light, .6));
        if (f.ear === 'fin') return sides(s => {
            const edge = n(50+s*31), mid = n(50+s*25), a = x(s);
            return path(`M${a} 37L${edge} 30L${mid} 41L${edge} 47L${mid} 48L${n(50+s*25)} 56L${a} 52Z`, p.shade, p.line, .75)
                + path(`M${a} 40L${n(50+s*27)} 35L${n(50+s*22)} 43L${n(50+s*27)} 47L${a} 47Z`, p.skin)
                + line(`M${a} 43L${edge} 30 M${a} 46L${edge} 47 M${a} 48L${n(50+s*25)} 56`, p.light, .55, ' opacity=".7"');
        });
        return sides(s => ellipse(50+s*rx, 45, 3.3, 5.8, p.shade)
            + line(`M${n(50+s*(rx+.5))} 42Q${n(50+s*(rx+3))} 43 ${n(50+s*rx)} 48`, p.light, .9));
    }
    function backHair(f, p, rx) {
        if (!['fall','beard','crop','mane'].includes(f.hair)) return '';
        const long = f.hair === 'fall', bottom = long ? 83 : f.hair === 'mane' ? 62 : 58;
        if (!long) return path(`M${n(48-rx)} 43Q${n(45-rx)} 17 49 16Q${n(55+rx)} 13 ${n(53+rx)} 43L${n(51+rx)} ${bottom}L${n(47+rx)} ${bottom-3}L${n(48+rx)} 34H${n(52-rx)}L${n(53-rx)} ${bottom-3}L${n(49-rx)} ${bottom}Z`, p.hair, p.line, .8);
        return path(`M${n(48-rx)} 45Q${n(45-rx)} 16 49 16Q${n(55+rx)} 13 ${n(53+rx)} 43L${n(56+rx)} ${bottom}Q66 ${bottom+4} 60 72H39Q26 ${bottom+3} ${n(44-rx)} ${bottom}Z`, p.hair, p.line, .8)
            + (long ? sides(s => line(`M${n(50+s*(rx+1))} 35Q${n(50+s*(rx-2))} 60 ${n(50+s*(rx+3))} 78`, p.strand, 1.2)) : '');
    }
    function horns(f, p, rx) {
        if (!['horns','ridge'].includes(f.crown)) return '';
        return sides(s => {
            const a=n(50+s*(rx-5)), b=n(50+s*(rx+3)), c=n(50+s*(rx+10));
            return path(`M${a} 28Q${c} 24 ${c} 7Q${n(50+s*(rx+6))} 17 ${n(50+s*(rx-1))} 19L${a} 21Z`, p.gold, p.line, .8)
                + path(`M${a} 28Q${b} 25 ${c} 7Q${b} 21 ${a} 23Z`, p.shade)
                + line(`M${n(50+s*(rx-1))} 21L${n(50+s*(rx+2))} 24 M${n(50+s*(rx+3))} 18L${n(50+s*(rx+5))} 20`, p.line, .55);
        });
    }
    function face(f, p, rx, ry) {
        const top=n(44-ry), chin=n(44+ry), left=n(50-rx), right=n(50+rx), jaw=n(rx*f.jaw);
        const outline = f.hair === 'scale'
            ? `M50 ${top}L${right} 29L${n(52+rx)} 45L${n(50+jaw)} 59L57 ${chin}H43L${n(50-jaw)} 59L${n(48-rx)} 45L${left} 29Z`
            : `M50 ${top}C${right} ${top} ${right} 32 ${right} 43Q${right} 55 ${n(50+jaw)} 59Q57 ${chin} 50 ${chin}Q43 ${chin} ${n(50-jaw)} 59Q${left} 55 ${left} 43C${left} 32 ${left} ${top} 50 ${top}Z`;
        return path(outline, p.skin, p.line, .85)
            + path(`M50 ${top}Q${right} ${top} ${right} 43Q${right} 55 ${n(50+jaw)} 59Q57 ${chin} 50 ${chin}L54 61L59 53L61 37Z`, p.shade)
            + path(`M${n(51-rx)} 36Q${n(54-rx)} 25 47 ${n(47-ry)}L46 36L38 40Z`, p.light, 'none', 0, ' opacity=".6"')
            + path(`M${n(53-rx)} 50L43 51L41 56L${n(56-rx)} 54Z`, p.light, 'none', 0, ' opacity=".65"');
    }
    function hair(f, p, rx, seed) {
        const l=n(50-rx), r=n(50+rx);
        if (f.hair === 'scale') return path('M36 30L43 24L50 27L57 24L64 30L57 29L50 33L43 29Z', p.light)
            + line('M39 34L43 36L47 34 M53 34L57 36L61 34 M46 23L50 20L54 23', p.shade, .8);
        if (f.hair === 'slick') return path(`M${l} 39Q28 17 48 16Q70 15 ${r} 39L60 30L50 25L40 30Z`, p.hair, p.line, .8)
            + sides(s => line(`M50 19Q${n(50+s*12)} 22 ${n(50+s*14)} 34 M50 23L${n(50+s*9)} 29`, p.strand, 1));
        if (f.hair === 'mane') return path(`M${l} 41L29 33L36 22L44 23L49 19L56 23L63 23L71 34L${r} 41L61 32L55 35L50 30L45 35L39 32Z`, p.hair, p.line, .8)
            + path('M43 26L48 24L50 29L53 24L58 27L54 30L50 28L46 30Z', p.strand);
        if (f.hair === 'beard') return path(`M${l} 39Q25 20 37 20Q46 15 60 21Q75 20 ${r} 40L65 32Q53 35 42 28L33 34L32 44Z`, p.hair, p.line, .8)
            + line('M32 29Q41 20 52 25 M48 23Q60 21 67 30 M31 36L31 43 M69 35L69 43', p.strand, 1.1);
        if (f.hair === 'fall') return path(`M${l} 47Q28 19 45 16Q72 12 ${r} 47L61 34Q55 30 50 23Q43 33 38 35Z`, p.hair, p.line, .8)
            + line('M47 20Q34 25 35 41 M52 19Q66 22 65 41 M37 49Q35 64 33 73 M64 49Q65 65 68 76', p.strand, .9);
        const part = n(43 + rnd(seed, 19)*8);
        return path(`M${l} 46L${n(48-rx)} 31Q${n(47-rx)} 21 38 19Q45 12 61 18L65 16L64 22Q72 26 ${r} 45L${n(47+rx)} 36L61 27Q${part} 36 37 30L36 43Z`, p.hair, p.line, .8)
            + line(`M35 27Q44 19 58 21 M39 28Q50 27 59 23 M${n(49+rx)} 30L${n(49+rx)} 37`, p.strand, 1.1);
    }
    function eyes(f, p, rx, seed) {
        const ex=rx*.48, y=f.snout?43:44, gaze=n((rnd(seed,11)-.5)*.9), lid=n(2.1+rnd(seed,13)*.5);
        return sides(s => {
            const x=n(50+s*ex), a=n(x-4.8), b=n(x+4.8);
            return path(`M${a} ${y}Q${x} ${n(y-lid-1)} ${b} ${y}Q${x} ${n(y+lid)} ${a} ${y}Z`, '#e9dfc8', 'none', 0, ' data-feature="eye"')
                + ellipse(x+gaze, y-.1, 2, 1.85, p.eye)
                + ellipse(x+gaze, y-.1, f.hair==='scale'?.65:1, 1.6, p.line, f.hair==='scale'?' data-feature="slit-pupil"':'')
                + ellipse(x+gaze-.55, y-.75, .45, .45, '#fff3d9')
                + line(`M${a} ${y}Q${x} ${n(y-lid-1)} ${b} ${y}`, p.line, 1)
                + line(`M${n(a+.8)} ${y+2.5}Q${x} ${y+3.6} ${n(b-.8)} ${y+2.3}`, p.shade, .6)
                + path(`M${n(a-.3)} ${y-5}Q${x} ${n(y-7-f.brow)} ${n(b+.2)} ${y-5.7}L${b} ${y-4.6}Q${x} ${y-6} ${a} ${y-3.9}Z`, f.snout?p.shade:p.hair);
        });
    }
    function noseAndMouth(f, p, rx, ry, seed, speaking) {
        const lip=n(44+ry*.67), smile=n(.7+rnd(seed,17));
        if (f.snout) {
            if (f.snout[2]==='square') return path('M40 49L47 47H53L60 49L65 60L60 66H40L35 60Z', p.shade, p.line, .8, ' data-feature="muzzle"')
                + path('M40 49L47 47H53L60 49L62 57L55 60H44L38 57Z', p.skin)
                + path('M42 50L48 48H52L58 50L59 53H42Z', p.light)
                + sides(s=>ellipse(50+s*7,55,1.7,1.1,p.line))
                + line('M39 60Q50 64 61 60',p.line,.9)
                + (speaking?path('M44 62Q50 64 56 62L54 64H46Z',p.line):'')
                + line('M45 66H55',p.light,.7);
            return path('M34 48L39 46L46 50H54L61 46L66 48L63 59L56 65H44L37 59Z',p.light,'none',0,' data-feature="muzzle"')
                + path('M49 51Q41 48 39 55Q39 60 50 59Q61 60 61 55Q59 49 51 51Z',p.light)
                + path('M45 51Q50 49 55 51L51 55H49Z',p.line)
                + line('M50 55V59 M41 58Q46 62 50 59Q54 62 59 58',p.line,.8)
                + (speaking?path('M46 61Q50 63 54 61Q50 66 46 61Z',p.line):'')
                + sides(s => line(`M${50+s*9} 54L${50+s*11} 53 M${50+s*10} 57L${50+s*12} 57`,p.shade,.65));
        }
        return path(`M49 46L46 54Q48 57 53 54L51 53Z`,p.shade)
            + line('M49 47L48 53L50 54',p.light,.9)
            + line('M47 55Q50 57 53 55',p.line,.55)
            + path(`M44 ${lip}Q48 ${lip-1.3} 50 ${lip-.3}Q52 ${lip-1.3} 56 ${lip}Q50 ${n(lip+smile+1.4)} 44 ${lip}Z`,p.shade)
            + line(`M44 ${lip}Q50 ${n(lip+smile)} 56 ${lip}`,p.line,.65)
            + (speaking?path(`M47 ${lip+.5}Q50 ${lip+1.2} 53 ${lip+.5}Q50 ${lip+2.9} 47 ${lip+.5}Z`,p.line):'')
            + line(`M47 ${lip+3}Q50 ${lip+3.7} 53 ${lip+3}`,p.light,.6);
    }
    function beard(f,p) {
        if(f.hair!=='beard')return '';
        return path('M29 49L34 51L37 58L43 60L50 64L57 60L63 58L66 51L71 49L68 68L62 78L56 83H44L38 78L32 68Z',p.hair,p.line,.8)
            + path('M39 57Q44 54 49 57L50 59L51 57Q56 54 61 57L65 61Q55 64 50 60Q45 64 35 61Z',p.hair,p.line,.55)
            + line('M39 59L45 58 M55 58L61 59 M35 63Q36 71 42 75 M41 66L46 78 M50 68V80 M59 66L54 78 M65 63Q64 71 58 75',p.strand,1)
            + sides(s=>path(`M${50+s*10} 71l${s*2} 3l${-s*2} 3l${s*1} 2`, 'none',p.strand,1))
            + sides(s=>path(`M${50+s*10-2} 77h4v3h-4Z`,p.gold,p.line,.4));
    }
    function details(f,p,rx) {
        if(f.crown==='circlet')return line('M35 32L43 34L50 32L57 34L65 32',p.gold,1.15)
            + path('M50 29L52 32L50 35L48 32Z',p.gold,p.line,.45);
        if(f.crown==='fin')return path('M40 24Q40 16 44 12L47 18L51 9L55 18L60 14L59 25L50 22Z',p.skin,p.line,.75)
            + line('M44 14L46 22 M51 12L51 21 M58 17L55 23',p.light,.8)
            + sides(s=>line(`M${n(50+s*(rx-4))} 53l${-s*4} 2 M${n(50+s*(rx-4))} 57l${-s*3} 1`,p.shade,.85));
        if(f.crown==='ridge')return path('M39 24L41 18L46 21L50 14L54 21L59 18L61 24L55 27L50 24L45 27Z',p.shade,p.line,.7)
            + path('M47 23L50 17L53 23L50 21Z',p.light)
            + sides(s=>line(`M${50+s*15} 49l${s*3} -2 M${50+s*16} 53l${s*2} -1`,p.light,.8));
        if(f.hair==='mane')return sides(s=>path(`M${50+s*17} 44L${50+s*22} 49L${50+s*19} 51L${50+s*22} 55L${50+s*16} 57L${50+s*14} 52Z`,p.skin,p.line,.6));
        return '';
    }
    /** Same narrator/seed, same face in both the world card and the town drawer. */
    function svg(people, seed = 0, options = {}) {
        people=validPeople(people);
        seed=Number.isFinite(seed)?seed:0;
        options=options||{};
        const size=Number.isFinite(options.size)?clamp(options.size,16,1024):96;
        const f=FACE[people],p=palette(people,seed);
        const rx=n(f.head[0]+(rnd(seed,23)-.5)*1.2),ry=n(f.head[1]+(rnd(seed,31)-.5)*1.2);
        const parts=[setting(p),clothing(p,f,seed),backHair(f,p,rx),ears(f,p,rx),horns(f,p,rx),face(f,p,rx,ry),hair(f,p,rx,seed),eyes(f,p,rx,seed),noseAndMouth(f,p,rx,ry,seed,options.speaking!==false),beard(f,p),details(f,p,rx)];
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${PEOPLES[people].name} narrator" focusable="false">${parts.join('')}</svg>`;
    }
    return {svg,palette,FACE,version:2};
})();
