/** Small atlas symbols share vector artwork across map pins and search cards.
 * Their surrounding button supplies the accessible name; repeated symbols need
 * neither SVG IDs nor font glyphs. All coordinates use the same 32-unit square.
 */
const AtlasMarks = (() => {
    const artwork = Object.freeze({
        dragon: `<path d="M22 9C17 3 8 6 5 14C2 24 14 29 23 24C29 21 29 14 25 12L22 14C24 20 18 24 13 21C8 18 10 11 15 11C20 11 21 17 16 18"/>
            <path d="M22 9L22 3M22 9L28 6"/>`,
        holy: `<circle cx="16" cy="16" r="8.5"/>
            <path d="M16 10L20 16L16 22L12 16ZM16 2V5M16 27V30M2 16H5M27 16H30M6 6L8 8M24 24L26 26M6 26L8 24M24 8L26 6"/>`,
        'dragon-ruin': `<path d="M22 9C17 3 8 6 5 14M5 21C9 28 17 28 23 24C29 21 29 14 25 12L22 14C24 20 18 24 13 21M10 16C10 13 12 11 15 11C20 11 21 17 16 18"/>
            <path d="M22 9L22 3M25 7.5L28 6"/>`
    });
    function markup(kind, {size = 24, className = ''} = {}) {
        if (!Object.hasOwn(artwork, kind)) return '';
        const dimension = Number.isFinite(Number(size)) ? Math.min(96, Math.max(12, Number(size))) : 24;
        const extra = String(className).split(/\s+/).filter(v => /^[a-zA-Z_][\w-]*$/.test(v)).join(' ');
        return `<svg xmlns="http://www.w3.org/2000/svg" class="atlas-mark atlas-mark--${kind}${extra ? ' '+extra : ''}" data-atlas-mark="${kind}" viewBox="0 0 32 32" width="${dimension}" height="${dimension}" aria-hidden="true" focusable="false">${artwork[kind]}</svg>`;
    }
    return Object.freeze({markup, kinds: Object.freeze(Object.keys(artwork))});
})();
