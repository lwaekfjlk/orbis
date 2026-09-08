/** Small atlas symbols share vector artwork across map pins and search cards.
 * Their surrounding button supplies the accessible name; repeated symbols need
 * neither SVG IDs nor font glyphs. All coordinates use the same 32-unit square.
 */
const AtlasMarks = (() => {
    const artwork = Object.freeze({
        dragon: `<path class="atlas-mark-body" d="M7 29C4 24 4 18 10 13L8 5L15 8L20 2L21 10L26 13L26 16L30 18L27 22L21 21L18 24L22 28L17 30Z"/>
            <path class="atlas-mark-wing" d="M7 27L2 18L10 19L6 12L14 16L13 23L17 28Z"/>
            <path class="atlas-mark-eye" d="M19 13L23 15L19 17Z"/>
            <path class="atlas-mark-detail" d="M22 21L24 21L23 24Z"/>`,
        holy: `<path class="atlas-mark-body" d="M16 1L20 7L27 5L25 12L31 16L25 20L27 27L20 25L16 31L12 25L5 27L7 20L1 16L7 12L5 5L12 7Z"/>
            <circle class="atlas-mark-halo" cx="16" cy="16" r="8.5"/>
            <path class="atlas-mark-eye" d="M14.5 10H17.5V14.5H22V17.5H17.5V23H14.5V17.5H10V14.5H14.5Z"/>`,
        'dragon-ruin': `<path class="atlas-mark-ring" d="M12 3A13 13 0 0 0 3 18L7 17L5 22L10 27M20 29A13 13 0 0 0 29 12L25 13L27 8L22 5"/>
            <path class="atlas-mark-body" d="M11 24L8 17L11 11L10 7L16 10L20 11L23 15L28 17L26 21L22 20L20 24L17 23L17 20L14 20L15 24Z"/>
            <path class="atlas-mark-eye" d="M14 13L18 14L17 18L13 17ZM23 16L26 18L23 18Z"/>
            <path class="atlas-mark-fracture" d="M18 11L16 13L19 16"/>`
    });
    function markup(kind, {size = 24, className = ''} = {}) {
        if (!Object.hasOwn(artwork, kind)) return '';
        const dimension = Number.isFinite(Number(size)) ? Math.min(96, Math.max(12, Number(size))) : 24;
        const extra = String(className).split(/\s+/).filter(v => /^[a-zA-Z_][\w-]*$/.test(v)).join(' ');
        return `<svg xmlns="http://www.w3.org/2000/svg" class="atlas-mark atlas-mark--${kind}${extra ? ' '+extra : ''}" data-atlas-mark="${kind}" viewBox="0 0 32 32" width="${dimension}" height="${dimension}" aria-hidden="true" focusable="false">${artwork[kind]}</svg>`;
    }
    return Object.freeze({markup, kinds: Object.freeze(Object.keys(artwork))});
})();
