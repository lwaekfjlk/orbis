/* A small dependency-free WebGL2 orthographic cartography renderer.
 * Real geometry, flat face normals, directional lighting and a shadow map.
 * All assets are procedural; no network, textures, font downloads or CDN.
 */
function rgb(hex) { return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]; }
function colorMix(a, b, t) { return a.map((v, i) => lerp(v, b[i], clamp(t))); }
function colorScale(a, s) { return a.map(v => clamp(v * s)); }
function norm(a) { const s = Math.hypot(...a) || 1; return a.map(x => x / s); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function sub(a, b) { return a.map((v, i) => v - b[i]); }
function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function mul4(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++)
            o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); }
function lookAt(eye, target, up) { const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]); }
function project4(m, p) { return [0, 1, 2, 3].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]); }
class Geometry {
    constructor() { this.data = []; }
    // The innermost loop of the whole renderer: a town pushes half a million triangles
    // through it. Written with sub/cross/norm/spread it allocated seven arrays and four
    // spreads per triangle — some 3.6M short-lived allocations per town, which is most of
    // what a reader waits for after clicking one. Inlined here, allocation-free. The
    // arithmetic is deliberately identical, Math.hypot included, so every vertex and every
    // geometry hash comes out bit-for-bit as before; only the garbage is gone.
    tri(a, b, c, color, normal = null) {
        const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2], cx = c[0], cy = c[1], cz = c[2];
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        if (Math.hypot(fx, fy, fz) < 1e-10)
            return;
        let nx, ny, nz;
        if (normal) { nx = normal[0]; ny = normal[1]; nz = normal[2]; }
        else { const s = Math.hypot(fx, fy, fz) || 1; nx = fx / s; ny = fy / s; nz = fz / s; }
        const r = color[0], g = color[1], bl = color[2];
        this.data.push(ax, ay, az, nx, ny, nz, r, g, bl, bx, by, bz, nx, ny, nz, r, g, bl, cx, cy, cz, nx, ny, nz, r, g, bl);
    }
    // Per-vertex normals and colours; each vertex is [x,y,z, nx,ny,nz, r,g,b], the
    // buffer layout this renderer already uses. A surface built from these reads as
    // one sheet instead of a fan of individually shaded facets, and a flat-shading
    // fallback still finds usable first-vertex data.
    smoothTri(a, b, c) { for (const v of [a, b, c])
        this.data.push(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]); }
    quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
    cone(x, y, z, r1, r2, height, color, segments = 6, rot = 0) { for (let i = 0; i < segments; i++) {
        const a = rot + i / segments * Math.PI * 2, b = rot + (i + 1) / segments * Math.PI * 2;
        this.quad([x + Math.cos(a) * r1, y, z + Math.sin(a) * r1], [x + Math.cos(a) * r2, y + height, z + Math.sin(a) * r2], [x + Math.cos(b) * r2, y + height, z + Math.sin(b) * r2], [x + Math.cos(b) * r1, y, z + Math.sin(b) * r1], color);
    } }
    blob(x, y, z, r, color, stretch = 1) { const a = [x, y + r * stretch, z], b = [x, y - r * stretch, z]; let ring = []; for (let k = 0; k < 7; k++)
        ring.push([x + Math.cos(k / 7 * Math.PI * 2) * r, y, z + Math.sin(k / 7 * Math.PI * 2) * r]); for (let k = 0; k < 7; k++) {
        this.tri(a, ring[(k + 1) % 7], ring[k], color);
        this.tri(b, ring[k], ring[(k + 1) % 7], color);
    } }
    line(a, b, width, col) { const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1, px = -dz / len * width, pz = dx / len * width; this.quad([a[0] + px, a[1], a[2] + pz], [b[0] + px, b[1], b[2] + pz], [b[0] - px, b[1], b[2] - pz], [a[0] - px, a[1], a[2] - pz], col); }
}
const PLATE_COLORS = Array.from({ length: 30 }, (_, i) => { const a = i * 2.39996; return [.66 + .16 * Math.cos(a), .69 + .13 * Math.cos(a + 2.1), .64 + .17 * Math.cos(a - 2.1)]; });
const BCOL = { 1: rgb('#9e4f4a'), 2: rgb('#d47847'), 3: rgb('#d47847'), 4: rgb('#338e94'), 5: rgb('#86718b') };
/* Schematic vegetation, not literal plant populations. One form vocabulary shared by
 * the atlas symbols, the town scene and the streaming city layer, so the same climate
 * grows the same plant at every scale. `unit` is the height of an average specimen in
 * that scale's own units; everything else is proportional to it.
 * Forms come from CityEnvironment.canopy(), which reads the same temperature and
 * aridity fields the ground colour reads.
 */
/* `coarse` halves the silhouette down to the parts that carry the form — a trunk and
 * one crown — for the scatter that fills a whole visible landscape. A full broadleaf
 * runs about 38 triangles, and twelve thousand of them is 419k triangles and most of a
 * second of remesh; the same field at coarse detail is a third of that and still reads
 * as a palm, an acacia or a fir at the range it is drawn. Towns keep the full form. */
function plantForm(g, p, form, unit, col, jitter = () => .5, coarse = false) {
    if(form==='none'||!(unit>0))return;
    const trunk = rgb('#79644a'), r = unit * .34;
    if (coarse) {
        if (form === 'cushion' || form === 'scrub') {
            const cushion=form==='cushion';
            g.cone(p[0], p[1], p[2], r * (cushion ? .52 : .70), r * (cushion ? .24 : .30), unit * (cushion ? .14 : .34), col, 4, jitter() * 6);
            return;
        }
        const bare = form === 'acacia' || form === 'palm' || form === 'rainforest';
        g.cone(p[0], p[1], p[2], r * .17, r * .12, unit * (bare ? .80 : .40), trunk, 4);
        const y = p[1] + unit * (bare ? .80 : .40);
        if (form === 'conifer' || form === 'pine')
            g.cone(p[0], y - unit * .22, p[2], r * .86, 0, unit * 1.02, col, 5, jitter() * 6);
        else if (form === 'acacia')
            g.cone(p[0], y, p[2], r * 1.18, r * .70, unit * .16, col, 5, jitter() * 6);
        else if (form === 'palm')
            g.cone(p[0], y - unit * .06, p[2], r * .18, r * 1.05, unit * .22, col, 5, jitter() * 6);
        else if (form === 'hardleaf')
            g.cone(p[0], y, p[2], r * .80, r * .50, unit * .34, col, 5, jitter() * 6);
        else
            g.cone(p[0], y, p[2], r * .92, r * .34, unit * (form === 'laurel' ? .52 : .60), col, 5, jitter() * 6);
        return;
    }
    if (form === 'cushion') { // Above the treeline: dwarf tufts, no trunk.
        g.blob(p[0], p[1] + unit * .05, p[2], r * .52, col, .40);
        return;
    }
    if (form === 'scrub') { // Semi-arid bushes sitting straight on the ground.
        g.blob(p[0], p[1] + unit * .11, p[2], r * .64, col, .70);
        g.blob(p[0] + r * .44, p[1] + unit * .08, p[2] - r * .32, r * .42, colorScale(col, .93), .62);
        return;
    }
    if (form === 'acacia') { // Savanna: bare stem, wide flat crown.
        g.cone(p[0], p[1], p[2], r * .14, r * .10, unit * .78, trunk, 5);
        g.blob(p[0], p[1] + unit * .84, p[2], r * 1.24, col, .30);
        g.blob(p[0], p[1] + unit * .96, p[2], r * .76, colorScale(col, 1.07), .26);
        return;
    }
    if (form === 'palm') { // Slender leaning stem, radiating fronds.
        const lean = (jitter() - .5) * r * .60, top = p[1] + unit * 1.02;
        g.cone(p[0], p[1], p[2], r * .15, r * .10, unit, trunk, 5);
        for (let k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2 + jitter(), s = r * 1.04;
            g.tri([p[0] + lean, top, p[2]], [p[0] + lean + Math.cos(a) * s, top - r * .40, p[2] + Math.sin(a) * s],
                [p[0] + lean + Math.cos(a + .5) * s * .8, top - r * .52, p[2] + Math.sin(a + .5) * s * .8], col);
        }
        return;
    }
    if (form === 'mangrove') { // Low dark canopy carried on visible prop roots.
        for (let k = 0; k < 4; k++) {
            const a = k / 4 * Math.PI * 2;
            g.line([p[0] + Math.cos(a) * r * .60, p[1], p[2] + Math.sin(a) * r * .60], [p[0], p[1] + unit * .42, p[2]], r * .07, trunk);
        }
        g.blob(p[0], p[1] + unit * .60, p[2], r * .88, col, .82);
        return;
    }
    if (form === 'laurel') { // Evergreen subtropics: short bole, one heavy dark dome.
        g.cone(p[0], p[1], p[2], r * .22, r * .17, unit * .40, trunk, 5);
        g.blob(p[0], p[1] + unit * .62, p[2], r * 1.02, colorScale(col, .88), .96);
        g.blob(p[0] + r * .30, p[1] + unit * .50, p[2] - r * .26, r * .62, colorScale(col, .80), .88);
        return;
    }
    if (form === 'hardleaf') { // Dry subtropics: low forked stems, open grey-green crown.
        for (const side of [-1, 1]) {
            const lean = side * r * .30;
            g.cone(p[0], p[1], p[2], r * .11, r * .08, unit * .46, trunk, 4);
            g.blob(p[0] + lean, p[1] + unit * .58, p[2] + lean * .4, r * .58, colorScale(col, 1.04), .74);
        }
        g.blob(p[0], p[1] + unit * .70, p[2], r * .46, colorScale(col, .93), .66);
        return;
    }
    if (form === 'rainforest') { // Tall clear trunk under a layered crown.
        g.cone(p[0], p[1], p[2], r * .17, r * .12, unit * .96, trunk, 5);
        g.blob(p[0], p[1] + unit * 1.00, p[2], r, col, .72);
        g.blob(p[0] - r * .40, p[1] + unit * .84, p[2] + r * .36, r * .76, colorScale(col, .90), .60);
        g.blob(p[0] + r * .32, p[1] + unit * 1.18, p[2] - r * .24, r * .54, colorScale(col, 1.10), .58);
        return;
    }
    g.cone(p[0], p[1], p[2], r * .18, r * .14, unit * .52, trunk, 5);
    if (form === 'conifer' || form === 'pine') {
        g.cone(p[0], p[1] + unit * .20, p[2], r * .88, 0, unit * .86, col, 6, jitter());
        g.cone(p[0], p[1] + unit * .56, p[2], r * .60, 0, unit * .76, colorScale(col, 1.06), 6, jitter());
    } else {
        g.blob(p[0], p[1] + unit * .66, p[2], r * .98, col, 1.17);
        g.blob(p[0] - r * .36, p[1] + unit * .60, p[2] + r * .32, r * .70, colorScale(col, .96), 1);
    }
}
class AtlasRenderer {
    constructor(canvas, onChange, forceSoftware = false) {
        this.canvas = canvas;
        this.onChange = onChange || (() => { });
        this.gl = forceSoftware ? null : canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
        if (!this.gl && !forceSoftware)
            return new SoftwareAtlasRenderer(canvas, onChange);
        this.meshes = {};
        this.layer = 'relief';
        this.options = { trees: true, volcanoes: true, rivers: true, borders: false, wind: false, ice: true, legends: true };
        this.zoom = 1;
        this.azimuth = .018;
        this.elevation = 1.19;
        this.target = [0, 0, 0];
        this.selected = -1;
        this.hoveredRealm = null;
        this.relief = 1.0;
        this.dirtyShadow = true;
        this.pending = false;
        if (this.gl)
            this.initGL();
        this.resize();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement);
    }
    shader(type, source) { const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(s)); return s; }
    program(v, f) { const gl = this.gl, p = gl.createProgram(), vs = this.shader(gl.VERTEX_SHADER, v), fs = this.shader(gl.FRAGMENT_SHADER, f); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(p)); gl.deleteShader(vs); gl.deleteShader(fs); return p; }
    initGL() {
        const gl = this.gl;
        this.main = this.program(`#version 300 es
   layout(location=0) in vec3 pos;layout(location=1) in vec3 normal;layout(location=2) in vec3 color;
   uniform mat4 mvp;uniform mat4 lightVP;out vec3 vNormal;out vec3 vColor;out vec4 vShadow;
   void main(){gl_Position=mvp*vec4(pos,1.);vNormal=normal;vColor=color;vShadow=lightVP*vec4(pos,1.);}`, `#version 300 es
   precision highp float;in vec3 vNormal;in vec3 vColor;in vec4 vShadow;uniform sampler2D shadowMap;uniform float opacity;uniform float unlit;uniform vec3 lightDir;out vec4 frag;
   void main(){vec3 n=normalize(vNormal);if(n.y<0.)n=-n;vec3 sun=normalize(lightDir);float nd=max(dot(n,sun),0.);vec3 p=vShadow.xyz/vShadow.w*.5+.5;float vis=1.;if(p.x>0.&&p.x<1.&&p.y>0.&&p.y<1.){vis=0.;float bias=max(.00032*(1.-nd),.00013);for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float d=texture(shadowMap,p.xy+vec2(float(x),float(y))*.00065).r;vis+=p.z-bias<=d?1.:.0;}vis/=9.;}float illum=.58+.47*nd*mix(.26,1.,vis)+.06*max(n.y,0.);vec3 outColor=vColor*mix(illum,1.,unlit);outColor=mix(outColor,vec3(.88,.88,.78),.035);frag=vec4(outColor,opacity);}`);
        this.depth = this.program(`#version 300 es
   layout(location=0) in vec3 pos;uniform mat4 mvp;void main(){gl_Position=mvp*vec4(pos,1.);}`, `#version 300 es
   precision highp float;void main(){}`);
        this.loc = {};
        for (const n of ['mvp', 'lightVP', 'shadowMap', 'opacity', 'unlit', 'lightDir'])
            this.loc[n] = gl.getUniformLocation(this.main, n);
        this.depthLoc = gl.getUniformLocation(this.depth, 'mvp');
        this.shadowSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
        this.shadow = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadow);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadow, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw Error('This graphics device could not create the shadow framebuffer.');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.lightVP = mul4(ortho(-110, 110, -87, 87, 1, 380), lookAt([-110, 170, -82], [0, 0, 0], [0, 1, 0]));
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
    }
    upload(name, geometry, shadow = true, unlit = 0, alpha = 1) { const gl = this.gl; if (this.meshes[name]) {
        gl.deleteBuffer(this.meshes[name].buffer);
        gl.deleteVertexArray(this.meshes[name].vao);
    } const vertices = geometry.data instanceof Float32Array ? geometry.data : new Float32Array(geometry.data);
    // Transferred worker buffers already have the GPU format. Keep that same
    // array for picking and export instead of copying the entire mesh twice.
    const buffer = gl.createBuffer(), vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW); for (let i = 0; i < 3; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12);
    } gl.bindVertexArray(null); this.meshes[name] = { buffer, vao, vertices, count: vertices.length / 9, shadow, unlit, alpha }; this.dirtyShadow = true; }
    clear() { const gl = this.gl; for (const m of Object.values(this.meshes)) {
        gl.deleteBuffer(m.buffer);
        gl.deleteVertexArray(m.vao);
    } this.meshes = {}; this.dirtyShadow = true; }
    ground(x, y) { if (!this.world)
        return 0; const w = this.world, xx = clamp(x, 0, GW - 1), yy = clamp(y, 0, GH - 1), a = Math.floor(xx), b = Math.floor(yy), u = xx - a, v = yy - b; const sample = (x, y) => { const i = cell(x, y), h = w.lake[i] > 0 ? w.lake[i] : w.height[i] + (w.ice?.[i] || 0); return h > 0 ? .14 + Math.pow(h / 1000, .98) * this.relief : 0; }; return lerp(lerp(sample(a, b), sample(Math.min(a + 1, GW - 1), b), u), lerp(sample(a, Math.min(b + 1, GH - 1)), sample(Math.min(a + 1, GW - 1), Math.min(b + 1, GH - 1)), u), v); }
    coord(x, y, h = null) { return [(x / (GW - 1) - .5) * MAP_X, h == null ? this.ground(x, y) : h, (y / (GH - 1) - .5) * MAP_Z]; }
    palette(i) {
        const w = this.world, h = w.height[i], b = w.biome[i];
        if (this.layer === 'ice') {
            if (h <= 0)
                return colorMix(rgb('#568ca5'), rgb('#d7eff1'), w.seaIce[i]);
            if (w.ice[i] > 25)
                return colorMix(rgb('#9cd4de'), rgb('#f0f6f1'), clamp(w.ice[i] / 1100));
            return colorMix(rgb(BIOME[b][1]), rgb('#d6d4b8'), .6);
        }
        if (this.layer === 'plates') {
            return colorMix(PLATE_COLORS[w.plate[i]], h <= 0 ? rgb('#c5d6d2') : rgb('#f1e7cf'), h <= 0 ? .22 : .04);
        }
        if (this.layer === 'rain' && h > 0) {
            const r = clamp(w.rain[i] / 2);
            const stops = [rgb('#e2bf83'), rgb('#b9bc86'), rgb('#689d89'), rgb('#326b7b')];
            const t = r * 3, j = Math.min(2, Math.floor(t));
            return colorMix(stops[j], stops[j + 1], t - j);
        }
        if (this.layer === 'aridity' && h > 0) {
            if ([3, 4, 13, 14].includes(b))
                return [rgb('#e2d3b3'), rgb('#b78a92'), rgb('#e0b25e'), rgb('#68a7ac'), rgb('#bf8060')][w.cause[i]];
            return colorMix(rgb(BIOME[b][1]), rgb('#d6d9c5'), .70);
        }
        if (this.layer === 'ocean') {
            if (h <= 0) {
                const a = w.seaAnomaly[i];
                return colorMix(rgb('#aecbc7'), a > 0 ? rgb('#d69a73') : rgb('#729fb2'), clamp(Math.abs(a) / 4));
            }
            return colorMix(rgb(BIOME[b][1]), rgb('#e2dcca'), .75);
        }
        if (h <= 0) {
            const ocean = colorMix(rgb('#a9d2ce'), rgb('#4d859e'), clamp(-h / 3400));
            return colorMix(ocean, rgb('#d1ebee'), w.seaIce[i] * .82);
        }
        const c=CityEnvironment.cellColor(w,i);
        return c;
    }
    buildTerrain() {
        const w = this.world, g = new Geometry(), pos = [], colors = [];
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const i = cell(x, y);
                let p = this.coord(x, y);
                if (x > 0 && x < GW - 1 && y > 0 && y < GH - 1) {
                    p[0] += (hash2(x, y, w.seed + 2) - .5) * .20;
                    p[2] += (hash2(x, y, w.seed + 3) - .5) * .20;
                }
                pos.push(p);
                colors.push(this.palette(i));
            }
        for (let y = 0; y < GH - 1; y++)
            for (let x = 0; x < GW - 1; x++) {
                const a = cell(x, y), b = a + 1, c = a + GW, d = c + 1, ts = (x + y) % 2 ? [[a, c, b], [b, c, d]] : [[a, c, d], [a, d, b]];
                for (const t of ts) {
                    let co = [0, 0, 0];
                    for (const i of t)
                        for (let k = 0; k < 3; k++)
                            co[k] += colors[i][k] / 3;
                    co = colorScale(co, w.height[t[0]] <= 0 && w.height[t[1]] <= 0 && w.height[t[2]] <= 0 ? .999 + hash2(x, y, w.seed + 1) * .002 : .987 + hash2(x, y, w.seed + 1) * .025);
                    g.tri(pos[t[0]], pos[t[1]], pos[t[2]], co);
                }
            }
        // Extend only the ocean beyond the data rectangle, avoiding a visible "tile" edge.
        const c = rgb('#4d859e'), a = -MAP_X / 2, b = MAP_X / 2, n = -MAP_Z / 2, s = MAP_Z / 2, R = 500;
        g.quad([-R, -.015, -R], [-R, -.015, n], [R, -.015, n], [R, -.015, -R], c);
        g.quad([-R, -.015, s], [-R, -.015, R], [R, -.015, R], [R, -.015, s], c);
        g.quad([-R, -.015, n], [-R, -.015, s], [a, -.015, s], [a, -.015, n], c);
        g.quad([b, -.015, n], [b, -.015, s], [R, -.015, s], [R, -.015, n], c);
        this.upload('terrain', g, true, this.layer === 'relief' ? 0 : .30);
    }
    buildSymbols() {
        const w = this.world, rnd = random32(w.seed + 962), trees = new Geometry(), vents = new Geometry(), smoke = new Geometry(), dunes = new Geometry(), rocks = new Geometry();
        let treeCount = 0, duneCount = 0;
        const forms = {};
        // Schematic vegetation, not literal plant populations. Form, density and
        // colour all come from CityEnvironment, which reads the same temperature and
        // aridity fields the ground colour reads, so a stand of trees agrees with the
        // ground under it. The old pass covered five biomes with two shapes and three
        // fixed colours, drew conifers over tropical rainforest, and left savanna,
        // tundra, steppe and alpine meadow bare.
        // Form, density and colour all come from CityEnvironment, so a stand of trees
        // agrees with the ground under it. The old pass covered five biomes with two
        // shapes and three fixed colours, drew conifers over tropical rainforest, and
        // left savanna, tundra, steppe and alpine meadow entirely bare.
        for (let y = 5; y < GH - 5; y += 3.5)
            for (let x = 5; x < GW - 5; x += 3.5) {
                const xx = x + rnd() * 2 - 1, yy = y + rnd() * 2 - 1, i = cell(xx, yy);
                if (w.ice[i] > 25 || w.height[i] <= 0 || w.lake[i] > 0)
                    continue;
                const here = CityEnvironment.canopy(w.biome[i], w.temp[i], w.arid[i]);
                // Density is the acceptance test, so a thin steppe reads as scattered
                // cover and a rainforest as closed canopy, from one continuous field.
                if (!here.density || rnd() > here.density * 1.15)
                    continue;
                if (w.volcanoes.some(v => Math.hypot(v.x - xx, v.y - yy) < 3))
                    continue;
                const low = here.form === 'cushion' || here.form === 'scrub';
                const count = low ? 2 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
                for (let k = 0; k < count; k++) {
                    const tx = xx + (rnd() - .5) * 1.8, ty = yy + (rnd() - .5) * 1.8, ti = cell(tx, ty);
                    if (w.height[ti] <= 0 || w.lake[ti] > 0 || w.ice[ti] > 25)
                        continue;
                    const at = CityEnvironment.canopy(w.biome[ti], w.temp[ti], w.arid[ti]);
                    if (!at.density)
                        continue;
                    const p = this.coord(tx, ty), scale = (low ? .48 : at.form === 'rainforest' ? .68 : .56) + rnd() * .38;
                    plantForm(trees, p, at.form, 1.6 * scale, colorScale(CityEnvironment.leafColor(w.temp[ti], w.arid[ti]), .86 + rnd() * .26), rnd);
                    forms[at.form] = (forms[at.form] || 0) + 1;
                    treeCount++;
                }
            }
        // Wind-oriented dune crests appear only in modeled warm, sandy arid regions.
        for (let y = 4; y < GH - 4; y += 2.6)
            for (let x = 4; x < GW - 4; x += 2.9) {
                const xx = x + rnd() * 2.7, yy = y + rnd() * 2.5, i = cell(xx, yy);
                if (w.biome[i] !== 4 || rnd() > .74)
                    continue;
                const slope = Math.abs(w.height[cell(xx + 1, yy)] - w.height[cell(xx - 1, yy)]) + Math.abs(w.height[cell(xx, yy + 1)] - w.height[cell(xx, yy - 1)]);
                if (slope > 450)
                    continue;
                const wind = windAt(w.lat[i], 0), angle = Math.atan2(wind[1], wind[0]), co = Math.cos(angle), sn = Math.sin(angle), scale = .65 + rnd() * .4, transform = (u, v, dh) => { const gx = xx + (u * co - v * sn) * scale, gy = yy + (u * sn + v * co) * scale; return this.coord(gx, gy, this.ground(gx, gy) + dh); };
                for (let k = 0; k < 3; k++) {
                    const z0 = -1.0 + k * .67, z1 = z0 + .67, crest = z => -.23 * (z * z), a = transform(crest(z0), z0, .23 * scale), b = transform(crest(z1), z1, .23 * scale), c = transform(-.75, z1, .014), d = transform(-.75, z0, .014), e = transform(.39, z0, .014), f = transform(.39, z1, .014);
                    dunes.quad(a, b, c, d, rgb('#dfb375'));
                    dunes.quad(a, e, f, b, rgb('#cf9e5d'));
                }
                duneCount++;
            }
        // No volcano symbol. A vent's cone is already IN the terrain — geography adds its
        // magnitude to w.height — so this drew a second, schematic cone on top of the real
        // mountain, at a size that had nothing to do with it, with a crater rim and a lava
        // streak that read as a game icon rather than as ground. The volcano is still in
        // the model, still in the relief, and still named where it earns a legend.
        this.symbolStats = { trees: treeCount, dunes: duneCount, forms };
        this.upload('trees', trees, true);
        this.upload('volcanoes', vents, true);
        this.upload('dunes', dunes, true);
        this.upload('smoke', smoke, false, .4, .55);
    }
    buildRivers() {
        if(this.continuousLayer?.natural&&typeof RiverDetail!=='undefined')return RiverDetail.build(this.continuousLayer);
        const w=this.world,rivers=new Geometry();
        for (let i = 0; i < GN; i++)
            if (w.height[i] > 0 && w.flow[i] > (w.channelThreshold?.[i] || w.riverThreshold) && (w.riverDown || w.down)[i] >= 0 && w.lake[i] < 0 && w.biome[i] !== 14 && w.ice[i] < 25) {
                const d = (w.riverDown || w.down)[i], x = i % GW, y = i / GW | 0, xx = d % GW, yy = d / GW | 0;
                if (Math.abs(x - xx) > 2)
                    continue;
                const width = clamp(.025 + Math.sqrt(w.flow[i] / (w.channelThreshold?.[i] || w.riverThreshold)) * .028, .03, .16);
                let prev = null;
                for (let k = 0; k <= 4; k++) {
                    const tx = lerp(x, xx, k / 4), ty = lerp(y, yy, k / 4), p = this.coord(tx, ty, this.ground(tx, ty) + .095);
                    if (prev)
                        rivers.line(prev, p, width, rgb('#558f95'));
                    prev = p;
                }
            }
        this.upload('rivers',rivers,false,.2);
        if(this.continuousLayer&&typeof RiverDetail!=='undefined')this.continuousLayer.lastRiverKey=RiverDetail.key(this.continuousLayer);
    }
    buildLines() {
        const w = this.world, borders = new Geometry(), arrows = new Geometry(), currents = new Geometry(), wind = new Geometry();
        this.buildRivers();
        for (const b of w.boundaries) {
            const vert = b.x % 1 !== 0, dx = vert ? 0 : .51, dy = vert ? .51 : 0, a = this.coord(b.x - dx, b.y - dy, this.ground(b.x - dx, b.y - dy) + .12), c = this.coord(b.x + dx, b.y + dy, this.ground(b.x + dx, b.y + dy) + .12);
            borders.line(a, c, .087, BCOL[b.type]);
        }
        const arrow = (g, x, y, dx, dy, length, color, width = .10) => { const len = Math.hypot(dx, dy); if (len < 1e-6)
            return; dx = dx / len * length; dy = dy / len * length; const end = this.coord(x + dx, y + dy, this.ground(x + dx, y + dy) + .17), start = this.coord(x, y, this.ground(x, y) + .17); g.line(start, end, width, color); const l = this.coord(x + dx - dx * .23 - dy * .18, y + dy - dy * .23 + dx * .18, this.ground(x + dx - dx * .23 - dy * .18, y + dy - dy * .23 + dx * .18) + .17), r = this.coord(x + dx - dx * .23 + dy * .18, y + dy - dy * .23 - dx * .18, this.ground(x + dx - dx * .23 + dy * .18, y + dy - dy * .23 - dx * .18) + .17); g.tri(end, l, r, color, [0, 1, 0]); };
        for (const p of w.plates)
            arrow(arrows, p.x, p.y, p.vx, p.vy, 6 * p.speed, rgb('#384f50'), .15);
        for (let y = 12; y < GH - 10; y += 15)
            for (let x = 10; x < GW - 10; x += 16) {
                const i = cell(x, y);
                if (w.height[i] <= 0) {
                    const a = w.seaAnomaly[i], color = a > 0 ? rgb('#b97452') : rgb('#457f96');
                    arrow(currents, x, y, w.ou[i], w.ov[i], 5.2, color, .105);
                }
                const v = windAt(w.lat[i], 0);
                arrow(wind, x, y, v[0], v[1], 4.3, rgb('#f1e5c5'), .085);
            }
        this.upload('borders', borders, false, .7);
        this.upload('arrows', arrows, false, .8);
        this.upload('currents', currents, false, .7);
        this.upload('wind', wind, false, .8);
    }
    buildIce() {
        const w = this.world, g = new Geometry(), floes = new Geometry(), rnd = random32(w.seed + 713);
        let tongues = 0;
        // Ribbons trace the computed ice flux rather than the river drainage surface.
        for (let y = 2; y < GH - 2; y += 3)
            for (let x = 2; x < GW - 2; x += 3) {
                const i = cell(x, y);
                if (w.ice[i] < 35 || Math.hypot(w.iceFlowU[i], w.iceFlowV[i]) < .12 || rnd() > .45)
                    continue;
                let xx = x, yy = y;
                const color = rgb('#91c6d6');
                for (let k = 0; k < 7; k++) {
                    const j = cell(xx, yy), dx = w.iceFlowU[j], dy = w.iceFlowV[j], len = Math.hypot(dx, dy);
                    if (len < .05 || w.ice[j] < 25)
                        break;
                    const nx = clamp(xx + dx / len * .72, 1, GW - 2), ny = clamp(yy + dy / len * .72, 1, GH - 2);
                    if (w.ice[cell(nx, ny)] < 20)
                        break;
                    g.line(this.coord(xx, yy, this.ground(xx, yy) + .06), this.coord(nx, ny, this.ground(nx, ny) + .06), clamp(w.ice[j] / 3200, .023, .11), color);
                    xx = nx;
                    yy = ny;
                }
                tongues++;
            }
        // Stylized sea-ice floes, kept separate from grounded glacier ice.
        for (let y = 2; y < GH - 2; y += 3.7)
            for (let x = 2; x < GW - 2; x += 3.7) {
                const xx = x + rnd() * 2, yy = y + rnd() * 2, i = cell(xx, yy);
                if (w.height[i] > -50 || w.seaIce[i] < .25 || rnd() > w.seaIce[i] * .65)
                    continue;
                const p = this.coord(xx, yy, 0), rad = .18 + rnd() * .45;
                floes.cone(p[0], .01, p[2], rad, rad * .78, .06 + rnd() * .13, rgb('#d7ecef'), 5, rnd() * 2);
                for (let k = 0; k < 5; k++) {
                    const a = k / 5 * Math.PI * 2, b = (k + 1) / 5 * Math.PI * 2;
                    floes.tri([p[0], .18, p[2]], [p[0] + Math.cos(a) * rad * .8, .15, p[2] + Math.sin(a) * rad * .8], [p[0] + Math.cos(b) * rad * .8, .15, p[2] + Math.sin(b) * rad * .8], rgb('#eaf3f0'));
                }
            }
        this.symbolStats.glacierFlowTraces = tongues;
        this.upload('iceflow', g, false, .2);
        this.upload('icefloes', floes, true, .1);
    }
    // Legendary places carry a marker of their own so a wonder is findable on the
    // map itself, not only in the name layer. The glyph is decoration standing on
    // the surface; it is never written back into the terrain or the height field.
    buildLegends() {
        const g = new Geometry(), gold = rgb('#e7c069'), dark = rgb('#8b6b36');
        for (const f of this.world.legends || []) {
            const p = this.coord(f.x, f.y), top = p[1] + 1.24;
            g.cone(p[0], p[1], p[2], .30, .11, .29, dark, 8);
            g.cone(p[0], p[1] + .26, p[2], .075, .055, .96, gold, 6);
            for (let k = 0; k < 4; k++) {
                const a = k / 4 * Math.PI * 2, b = (k + 1) / 4 * Math.PI * 2;
                const u = [p[0] + Math.cos(a) * .19, top, p[2] + Math.sin(a) * .19], v = [p[0] + Math.cos(b) * .19, top, p[2] + Math.sin(b) * .19];
                g.tri([p[0], top + .31, p[2]], u, v, gold);
                g.tri([p[0], top - .31, p[2]], v, u, gold);
            }
        }
        this.upload('legends', g, false, .72);
    }
    prepareTerritory() {
        this.territoryWorld = this.world;
        this.territorySim = this.sim;
        this.territoryOwners = typeof PoliticalLand !== 'undefined' && this.world && this.sim
            ? PoliticalLand.territory(this.world, this.sim).owners : null;
        return this.territoryOwners;
    }
    setWorld(w) { this.clear(); this.world = w; this.selected = -1; this.hoveredRealm = null; this.prepareTerritory(); this.buildTerrain(); this.buildSymbols(); this.buildLines(); this.buildIce(); this.buildLegends(); this.request(); }
    setLayer(layer) { this.layer = layer; this.hoveredRealm = null; this.prepareTerritory(); if (this.world)
        this.buildTerrain(); this.dirtyShadow = true; this.request(); }
    setHoveredRealm(id) {
        const next = Number.isInteger(id) && this.sim?.realms[id]?.alive ? id : null;
        if (next === this.hoveredRealm) return;
        this.hoveredRealm = next;
        this.prepareTerritory();
        // A preview changes only colours, never the selected realm or camera.
        // The continuous map updates its existing colour buffer; the original
        // renderer retains its terrain rebuild path. Pointer movement is a no-op.
        if (this.world && this.sim) {
            if (this.continuousLayer?.recolorTerrain) this.continuousLayer.recolorTerrain();
            else this.buildTerrain();
        }
        if (next != null) this.buildRealmHover();
        this.request();
    }
    buildRealmHover() {
        const w = this.world, s = this.sim, g = new Geometry();
        if (!w || !s || this.hoveredRealm == null) return;
        const territory = this.prepareTerritory();
        const owns = (x, y) => {
            if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
            const i = cell(x, y);
            return territory ? territory[i] === this.hoveredRealm
                : w.height[i] > 0 && w.lake[i] <= 0 && s.provinces[w.provinceId[i]]?.owner === this.hoveredRealm;
        };
        const casing = rgb('#735231'), light = rgb('#fff2b0'), neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
            if (!owns(x, y)) continue;
            for (const [dx, dy] of neighbours) {
                if (owns(x + dx, y + dy)) continue;
                const cx = x + dx * .5, cy = y + dy * .5;
                const ax = cx - dy * .5, ay = cy - dx * .5, bx = cx + dy * .5, by = cy + dx * .5;
                const ah = this.ground(ax, ay), bh = this.ground(bx, by);
                g.line(this.coord(ax, ay, ah + .16), this.coord(bx, by, bh + .16), .23, casing);
                g.line(this.coord(ax, ay, ah + .18), this.coord(bx, by, bh + .18), .10, light);
            }
        }
        const dirtyShadow = this.dirtyShadow;
        this.upload('realmHover', g, false, 1);
        this.dirtyShadow = dirtyShadow;
    }
    select(i) { this.selected = i; this.selectionKey = null;
        if (i >= 0) this.updateCamera();
        else this.upload('selection', new Geometry(), false, 1);
        this.request();
    }
    buildSelection() {
        if (!this.world || !this.width || !this.height) return;
        // Keep the ground marker small in CSS pixels, including a selection made
        // before zooming. Stroke and lift shrink with it instead of filling the town.
        const pixel = 2 * this.halfH / this.height, key = [this.selected, pixel, this.relief].join('/');
        if (key === this.selectionKey) return;
        this.selectionKey = key;
        const g = new Geometry(), x = this.selected % GW, y = this.selected / GW | 0;
        const rx = Math.min(1.35, 6 * pixel * (GW - 1) / MAP_X), ry = Math.min(1.35, 6 * pixel * (GH - 1) / MAP_Z);
        const width = Math.min(.08, .65 * pixel), lift = Math.min(.23, .9 * pixel);
        const point = a => { const px = x + Math.cos(a) * rx, py = y + Math.sin(a) * ry; return this.coord(px, py, this.ground(px, py) + lift); };
        for (let k = 0; k < 32; k++) {
            const a = k / 32 * Math.PI * 2, b = (k + 1) / 32 * Math.PI * 2;
            g.line(point(a), point(b), width, rgb('#f8edd0'));
        }
        const dirtyShadow = this.dirtyShadow;
        this.upload('selection', g, false, 1);
        this.dirtyShadow = dirtyShadow; // This unlit marker never casts a shadow.
    }
    // Render above CSS resolution and let the compositor downsample. Multisampling
    // only cleans geometry edges, while the relief shading, coastlines and thin
    // river ribbons alias inside the triangle. A pixel budget keeps a large window
    // on a dense display from quietly quadrupling the fill cost, and the software
    // fallback keeps its old ceiling because it pays per pixel on the CPU.
    resize() { const r = this.canvas.parentElement.getBoundingClientRect(), device = window.devicePixelRatio || 1; this.width = r.width; this.height = r.height;
        const scale = this.gl ? Math.max(1, Math.min(Math.max(device, 1.6), Math.sqrt(11e6 / Math.max(1, r.width * r.height)))) : Math.min(device, 2);
        this.renderScale = scale; this.canvas.width = Math.max(1, Math.round(r.width * scale)); this.canvas.height = Math.max(1, Math.round(r.height * scale)); this.request(); }
    updateCamera() {
        const aspect = this.width / Math.max(this.height, 1), el = this.elevation, az = this.azimuth;
        this.halfH = Math.max(49, 94 / aspect) / this.zoom;
        this.halfW = this.halfH * aspect;
        this.right = [Math.cos(az), 0, -Math.sin(az)];
        this.up = [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)];
        this.dir = [-Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el)];
        const eye = this.target.map((v, i) => v - this.dir[i] * 180);
        this.mvp = mul4(ortho(-this.halfW, this.halfW, -this.halfH, this.halfH, .1, 420), lookAt(eye, this.target, [0, 1, 0]));
        if (this.selected >= 0) this.buildSelection();
    }
    visible(name) { if (['terrain', 'selection'].includes(name))
        return true; if (name === 'legends')
        return this.options.legends !== false && this.layer !== 'plates' && this.zoom < 24; if (name === 'borders' || name === 'arrows')
        return this.layer === 'plates' || this.options.borders; if (name === 'currents')
        return this.layer === 'ocean'; if (name === 'wind')
        return this.options.wind; if (name === 'iceflow' || name === 'icefloes')
        return this.options.ice && (this.layer === 'relief' || this.layer === 'ice'); if (name === 'rivers')
        return this.options.rivers && this.layer !== 'plates'; if (this.layer !== 'relief')
        return false; if (name === 'dunes')
        return true; if (name === 'trees')
        return this.options.trees; return this.options.volcanoes; }
    render() {
        const gl = this.gl;
        if (!this.width || !this.height)
            return;
        this.updateCamera();
        if (this.dirtyShadow) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.viewport(0, 0, this.shadowSize, this.shadowSize);
            // Bias in light-space follows the actual triangle slope. A fixed
            // shader bias using smoothed terrain normals leaves diagonal acne
            // across hills when the camera approaches a town.
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(2, 4);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.useProgram(this.depth);
            gl.uniformMatrix4fv(this.depthLoc, false, this.lightVP);
            for (const [name, m] of Object.entries(this.meshes))
                if (m.shadow && this.visible(name)) {
                    // Terrain's smoothed normal does not describe each light-
                    // space face. Cover the full PCF footprint on steep slopes
                    // without separating building shadows from their footings.
                    gl.polygonOffset(name === 'terrain' ? 4 : 2, name === 'terrain' ? 8 : 4);
                    gl.bindVertexArray(m.vao);
                    gl.drawArrays(gl.TRIANGLES, 0, m.count);
                }
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this.dirtyShadow = false;
        }
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(...(this.backgroundColor || [.30, .52, .62]), 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.main);gl.uniform3fv(this.loc.lightDir,this.sunDirection||[-.65,1,-.48]);
        gl.uniformMatrix4fv(this.loc.mvp, false, this.mvp);
        gl.uniformMatrix4fv(this.loc.lightVP, false, this.lightVP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadow);
        gl.uniform1i(this.loc.shadowMap, 0);
        for (const [name, m] of Object.entries(this.meshes))
            if (this.visible(name) && m.count) {
                if (m.alpha < 1) {
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                    gl.depthMask(false);
                }
                gl.uniform1f(this.loc.opacity, m.alpha);
                gl.uniform1f(this.loc.unlit, m.unlit);
                gl.bindVertexArray(m.vao);
                gl.drawArrays(gl.TRIANGLES, 0, m.count);
                if (m.alpha < 1) {
                    gl.disable(gl.BLEND);
                    gl.depthMask(true);
                }
            }
        gl.bindVertexArray(null);
        this.onChange();
    }
    request() { if (this.pending)
        return; this.pending = true; requestAnimationFrame(() => { this.pending = false; this.render(); }); }
    screen(x, y, dh = 0) { if (!this.mvp)
        return [-1000, -1000]; const p = project4(this.mvp, this.coord(x, y, this.ground(x, y) + dh)); return [(p[0] / p[3] * .5 + .5) * this.width, (.5 - p[1] / p[3] * .5) * this.height]; }
    pick(sx, sy) { if (!this.world)
        return -1; this.updateCamera(); const nx = (sx / this.width * 2 - 1) * this.halfW, ny = (1 - sy / this.height * 2) * this.halfH, origin = this.target.map((v, i) => v + this.right[i] * nx + this.up[i] * ny - this.dir[i] * 180); let lo = (22 - origin[1]) / this.dir[1], hi = (-.1 - origin[1]) / this.dir[1]; for (let k = 0; k < 25; k++) {
        const t = (lo + hi) / 2, p = origin.map((v, i) => v + this.dir[i] * t), x = (p[0] / MAP_X + .5) * (GW - 1), y = (p[2] / MAP_Z + .5) * (GH - 1), g = this.ground(x, y);
        if (p[1] > g)
            lo = t;
        else
            hi = t;
    } const t = (lo + hi) / 2, p = origin.map((v, i) => v + this.dir[i] * t), x = (p[0] / MAP_X + .5) * (GW - 1), y = (p[2] / MAP_Z + .5) * (GH - 1); return x < 0 || x > GW - 1 || y < 0 || y > GH - 1 ? -1 : cell(Math.round(x), Math.round(y)); }
    reset() { this.zoom = 1; this.target = [0, 0, 0]; this.azimuth = .018; this.elevation = 1.19; this.request(); }
    focus(x, y) { const p = this.coord(x, y); this.target = [p[0], 0, p[2]]; this.zoom = 2.0; this.request(); }
    pan(dx, dy) { const f = 2 * this.halfW / this.width, sin = Math.sin(this.elevation); this.target[0] -= dx * f * this.right[0] + dy * f * Math.sin(this.azimuth) / sin; this.target[2] -= dx * f * this.right[2] + dy * f * Math.cos(this.azimuth) / sin; this.request(); }
}
/* Canvas fallback renders the same 3D mesh by projection and depth sorting.
 * It is slower than WebGL and uses terrain ray-occlusion instead of a shadow map.
 * No raster "preview image" is substituted for the generated scene.
 */
class SoftwareAtlasRenderer extends AtlasRenderer {
    constructor(canvas, onChange) { super(canvas, onChange, true); this.ctx = canvas.getContext('2d', { alpha: false }); this.software = true; if (!this.ctx)
        throw Error('No supported canvas rendering context is available.'); }
    upload(name, geometry, shadow = true, unlit = 0, alpha = 1) {
        const vertices = new Float32Array(geometry.data), styles = [], triCount = vertices.length / 27;
        const sun = norm([-.65, 1, -.48]);
        for (let t = 0; t < triCount; t++) {
            const k = t * 27;
            let n = [vertices[k + 3], vertices[k + 4], vertices[k + 5]];
            if (n[1] < 0)
                n = n.map(v => -v);
            const nd = Math.max(0, dot(n, sun)), x = (vertices[k] + vertices[k + 9] + vertices[k + 18]) / 3, z = (vertices[k + 2] + vertices[k + 11] + vertices[k + 20]) / 3, gx = (x / MAP_X + .5) * (GW - 1), gy = (z / MAP_Z + .5) * (GH - 1), inside = gx >= 0 && gx < GW && gy >= 0 && gy < GH;
            const sh = inside && this.shadowField ? this.shadowField[cell(gx, gy)] : 1;
            let illum = .58 + .47 * nd * (.26 + .74 * sh) + .06 * Math.max(n[1], 0);
            illum = lerp(illum, 1, unlit);
            let c = [];
            for (let j = 0; j < 3; j++)
                c.push(Math.round(clamp(vertices[k + 6 + j] * illum * .965 + [.88, .88, .78][j] * .035) * 255));
            styles.push(`rgb(${c[0]},${c[1]},${c[2]})`);
        }
        this.meshes[name] = { vertices, styles, count: vertices.length / 9, shadow, unlit, alpha };
        this.dirtyShadow = true;
    }
    clear() { this.meshes = {}; this.dirtyShadow = true; }
    setWorld(w) {
        this.world = w;
        this.shadowField = new Float32Array(GN).fill(1);
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const i = cell(x, y), start = this.ground(x, y);
                let vis = 1;
                for (let k = 1; k < 18; k++) {
                    const xx = x - k * .81, yy = y - k * .60;
                    if (xx < 0 || yy < 0)
                        break;
                    const beam = start + k * .76, obstacle = this.ground(xx, yy);
                    if (obstacle > beam + .07) {
                        vis = .20;
                        break;
                    }
                    if (obstacle > beam - .12)
                        vis = Math.min(vis, .60);
                }
                this.shadowField[i] = vis;
            }
        super.setWorld(w);
    }
    render() {
        if (!this.ctx || !this.width)
            return;
        this.updateCamera();
        const ctx = this.ctx, c = this.canvas, sx = c.width / 2, sy = c.height / 2, m = this.mvp;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.backgroundHex || '#4d859e';
        ctx.fillRect(0, 0, c.width, c.height);
        const tris = [];
        for (const [name, mesh] of Object.entries(this.meshes)) {
            if (!this.visible(name))
                continue;
            const v = mesh.vertices;
            for (let k = 0, t = 0; k < v.length; k += 27, t++) {
                const points = [];
                let depth = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
                for (let n = 0; n < 3; n++) {
                    const j = k + n * 9, x = v[j], y = v[j + 1], z = v[j + 2], px = (m[0] * x + m[4] * y + m[8] * z + m[12] + 1) * sx, py = (1 - m[1] * x - m[5] * y - m[9] * z - m[13]) * sy;
                    points.push(px, py);
                    depth += m[2] * x + m[6] * y + m[10] * z + m[14];
                    minX = Math.min(minX, px);
                    maxX = Math.max(maxX, px);
                    minY = Math.min(minY, py);
                    maxY = Math.max(maxY, py);
                }
                if (maxX < 0 || minX > c.width || maxY < 0 || minY > c.height)
                    continue;
                tris.push([depth, ...points, mesh.styles[t], mesh.alpha, name === 'terrain' || name === 'water' || name === 'trees' || name === 'volcanoes' || name === 'dunes']);
            }
        }
        tris.sort((a, b) => b[0] - a[0]);
        ctx.lineJoin = 'round';
        ctx.lineWidth = .45;
        for (const t of tris) {
            ctx.globalAlpha = t[8];
            ctx.fillStyle = t[7];
            ctx.beginPath();
            ctx.moveTo(t[1], t[2]);
            ctx.lineTo(t[3], t[4]);
            ctx.lineTo(t[5], t[6]);
            ctx.closePath();
            ctx.fill();
            if (t[9]) {
                ctx.strokeStyle = t[7];
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        this.onChange();
    }
}
/* Civilization and hydrology overlays share the original relief renderer. */
const physicalPalette = AtlasRenderer.prototype.palette;
AtlasRenderer.prototype.palette = function (i) {
    const c = physicalPalette.call(this, i), w = this.world, s = this.sim;
    if (['potential', 'settlements'].includes(this.layer)) {
        if (w.height[i] <= 0 || w.lake[i] > 0 || w.ice[i] > 120)
            return c;
        const p = s?.provinces[w.provinceId[i]];
        const v = this.layer === 'potential' ? (w.human?.potential[i] || 0) : Math.min(1, (w.human?.capacity[i] || 0) / 6500 * .7 + (p?.settled ? .12 : 0));
        return colorMix(c, colorMix(rgb('#d3c3a7'), rgb('#388c79'), v), this.layer === 'potential' ? .78 : .44);
    }
    if (this.layer === 'water') {
        if (w.height[i] <= 0)
            return w.fjord[i] ? colorMix(c, rgb('#346e91'), .42) : c;
        if (w.lake[i] > 0) {
            const b = w.basins[w.lakeId[i]];
            return rgb(b?.closed ? '#74a7c2' : '#68b6cb');
        }
        if ([18, 19, 20].includes(w.biome[i]))
            return rgb('#589a89');
        if (w.ice[i] > 25)
            return c;
        return colorMix(c, rgb('#d4d2b9'), .55);
    }
    if (!s || !['realms', 'faiths', 'peoples', 'diplomacy', 'wealth', 'magic'].includes(this.layer) || w.height[i] <= 0)
        return c;
    const pid = w.provinceId[i], p = s.provinces[pid];
    if (this.territoryWorld !== w || this.territorySim !== s) this.prepareTerritory();
    const direct = s.realms[p?.owner];
    // Existing administered districts remain authoritative; the surrounding
    // highlands, icefields and islands share the completed territorial map.
    const realm = direct && direct.alive !== false && w.lake[i] <= 0 ? direct : s.realms[this.territoryOwners?.[i]];
    const hovered = realm?.alive !== false && realm?.id === this.hoveredRealm;
    const political = this.layer === 'realms' || this.layer === 'diplomacy';
    if (w.lake[i] > 0 || !p) {
        // No demographic measurement is invented for an uninhabited cell.
        // Its natural surface still participates in the full country preview.
        const base = !p && !political && w.lake[i] <= 0 && w.ice[i] <= 120 ? colorMix(c, rgb('#b5b7a6'), .30) : c;
        if (!realm || realm.alive === false) return base;
        if (this.hoveredRealm != null)
            return hovered ? colorMix(c, rgb(realm.color), .34) : base;
        return political && realm.id === this.focusRealm
            ? colorMix(c, rgb(realm.color), .14) : base;
    }
    if (w.ice[i] > 120)
        return hovered ? colorMix(c, rgb(realm.color), .34)
            : political && this.hoveredRealm == null && realm?.id === this.focusRealm ? colorMix(c, rgb(realm.color), .14) : c;
    let paint, strength = .63;
    if (this.layer === 'faiths') {
        paint = rgb(FAITHS[cDominant(p.faith)].color);
        strength = .35 + .48 * Math.max(...p.faith);
    }
    else if (this.layer === 'peoples') {
        paint = rgb(PEOPLES[cDominant(p.people)].color);
        strength = .35 + .48 * Math.max(...p.people);
    }
    else if (this.layer === 'wealth') {
        paint = colorMix(rgb('#c7b88e'), rgb('#3f8f85'), clamp(p.dev / 2.5));
        strength = .72;
    }
    else if (this.layer === 'magic') {
        paint = colorMix(rgb('#e7d9c6'), rgb('#8665ab'), clamp(p.mana * (realm?.arcana || .4) / 2));
        strength = .80;
    }
    else {
        // A country is a line on this map, not paint. Every border already carries a
        // cased frontier line — dark casing, pale centre — and that is the whole of
        // it: any wash over the territory, even a soft band inside the border, buries
        // the relief the layer is drawn on. Faiths, peoples, wealth and magic keep
        // their full colour, because there the colour IS the measurement.
        // Hovering a name briefly shows its entire territory. Leaving restores
        // the faint wash of the selected realm without changing that selection.
        if (this.hoveredRealm != null)
            return hovered ? colorMix(c, rgb(realm.color), .34) : c;
        if (this.focusRealm == null || !realm || realm.id !== this.focusRealm)
            return c;
        return colorMix(c, rgb(realm.color), .14);
    }
    if (strength <= 0)
        return c;
    const measured = colorMix(c, paint, strength);
    return hovered ? colorMix(measured, rgb(realm.color), .34) : measured;
};
const priorVisible = AtlasRenderer.prototype.visible;
AtlasRenderer.prototype.visible = function (name) {
    const civil = ['realms', 'faiths', 'peoples', 'diplomacy', 'wealth', 'magic'].includes(this.layer);
    if (name === 'realmHover')
        return civil && this.hoveredRealm != null;
    if (name === 'settlements')
        return this.options.settlements !== false && (civil || this.layer === 'settlements' || this.layer === 'relief');
    if (name === 'frontiers')
        return this.options.frontiers !== false && (civil || this.layer === 'relief');
    if (name === 'tradeRoutes' || name === 'pactLines' || name === 'warLines')
        return this.layer === 'diplomacy';
    if (name === 'reeds')
        return this.layer === 'water' || this.layer === 'relief' || civil;
    if ((civil || this.layer === 'settlements') && ['trees', 'dunes', 'volcanoes', 'smoke', 'iceflow', 'icefloes'].includes(name)) {
        if (['volcanoes', 'smoke'].includes(name))
            return this.options.volcanoes;
        if (name === 'trees')
            return this.options.trees;
        return true;
    }
    return priorVisible.call(this, name);
};
Geometry.prototype.box = function (x, y, z, rx, rz, h, color) {
    const a = [x - rx, y, z - rz], b = [x + rx, y, z - rz], c = [x + rx, y, z + rz], d = [x - rx, y, z + rz], A = [x - rx, y + h, z - rz], B = [x + rx, y + h, z - rz], C = [x + rx, y + h, z + rz], D = [x - rx, y + h, z + rz];
    this.quad(a, A, B, b, color);
    this.quad(b, B, C, c, color);
    this.quad(c, C, D, d, color);
    this.quad(d, D, A, a, color);
    this.quad(A, D, C, B, colorScale(color, 1.07));
};
AtlasRenderer.prototype.buildCivilization = function () {
    const w = this.world, s = this.sim;
    if (!s)
        return;
    const towns = new Geometry(), borders = new Geometry(), routes = new Geometry(), pacts = new Geometry(), wars = new Geometry(), reeds = new Geometry();
    const capIDs = new Set(s.realms.filter(c => c.alive).map(c => c.capital)), townList = s.provinces.filter(p => p.settled).sort((a, b) => b.urbanPop - a.urbanPop);
    for (const p of townList) {
        const c = s.realms[p.owner], capital = capIDs.has(p.id) && this.layer !== 'settlements', sc = capital ? .80 : p.city ? .36 : .23, point = this.coord(p.x, p.y), [x, y, z] = point, wall = rgb('#e4d7b5'), roof = rgb('#716e73');
        if (capital && typeof LandmarkBinding !== 'undefined') {
            LandmarkBinding.worldSymbol(towns, w, s, p, x, y, z, sc);
            continue;
        }
        towns.box(x, y, z, .42 * sc, .38 * sc, .8 * sc, wall);
        const tower = (dx, dz, height, kind) => { towns.cone(x + dx * sc, y, z + dz * sc, .19 * sc, .19 * sc, height * sc, wall, 6); towns.cone(x + dx * sc, y + height * sc, z + dz * sc, .27 * sc, 0, .5 * sc, rgb(kind || '#647679'), 6); };
        if (capital && c.gov === 2) {
            tower(0, 0, 2.6, '#8a6bad');
            towns.blob(x, y + 3.3 * sc, z, .27 * sc, rgb('#bfa6dc'), 1.6);
            tower(-.53, .26, 1.5, '#8a6bad');
            tower(.53, .20, 1.3, '#8a6bad');
        }
        else if (capital && c.gov === 1) {
            towns.box(x, y, z, .30 * sc, .65 * sc, 1.1 * sc, wall);
            tower(0, -.40, 2.2, '#c2a365');
            towns.cone(x, y + 1.1 * sc, z + .3 * sc, .4 * sc, .10 * sc, .7 * sc, rgb('#c2a365'), 8);
        }
        else if (capital && c.archetype === 'labyrinth') {
            towns.box(x - .43 * sc, y, z, .18 * sc, .28 * sc, 1.25 * sc, wall);
            towns.box(x + .43 * sc, y, z, .18 * sc, .28 * sc, 1.25 * sc, wall);
            towns.box(x, y + 1.05 * sc, z, .61 * sc, .30 * sc, .25 * sc, wall);
            towns.box(x, y + .03 * sc, z + .02 * sc, .27 * sc, .04 * sc, .75 * sc, rgb('#625b64'));
        }
        else if (capital && c.archetype === 'forge') {
            towns.box(x, y, z, .58 * sc, .38 * sc, .8 * sc, rgb('#9f9c94'));
            tower(-.48, 0, 1.3);
            tower(.48, 0, 1.3);
        }
        else if (capital) {
            tower(-.40, -.30, 1.4);
            tower(.40, -.30, 1.4);
            tower(-.40, .30, 1.1);
            tower(.40, .30, 1.1);
            towns.cone(x, y + .8 * sc, z, .45 * sc, 0, .5 * sc, rgb('#a46e5d'), 4, .78);
        }
        else
            towns.cone(x, y + .8 * sc, z, .58 * sc, 0, .50 * sc, roof, 4, .78);
        // A flag records political control, not the inhabitants' faith or ancestry.
        if (capital) {
            const pole = x + .72 * sc, top = y + 2.1 * sc;
            towns.cone(pole, y, z, .026, .02, 2.1 * sc, rgb('#80745d'), 4);
            towns.tri([pole, top, z], [pole + .60 * sc, top - .1 * sc, z], [pole, top - .42 * sc, z], rgb(c.color));
        }
    }
    // Inland water shares the surrounding territory. Borders cross shared lakes
    // instead of disappearing at either shore; wholly domestic lakes have no seam.
    const territory = this.prepareTerritory();
    for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) {
            const i = y * GW + x;
            if (w.height[i] <= 0) continue;
            const a = territory ? territory[i] : w.lake[i] > 0 ? -1 : s.provinces[w.provinceId[i]]?.owner ?? -1;
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                if (x + dx >= GW || y + dy >= GH) continue;
                const j = i + dx + dy * GW;
                if (w.height[j] <= 0) continue;
                const b = territory ? territory[j] : w.lake[j] > 0 ? -1 : s.provinces[w.provinceId[j]]?.owner ?? -1;
                if (a === b || (a < 0 && b < 0)) continue;
                const cx = x + dx * .5, cy = y + dy * .5, ax = cx - dy * .51, ay = cy - dx * .51, bx = cx + dy * .51, by = cy + dx * .51;
                if (a < 0 || b < 0) {
                    // Short ochre dashes distinguish wilderness margins from
                    // the continuous pale border between two named realms.
                    const A = [lerp(ax, bx, .16), lerp(ay, by, .16)], B = [lerp(ax, bx, .84), lerp(ay, by, .84)];
                    borders.line(this.coord(A[0], A[1], this.ground(...A) + .12), this.coord(B[0], B[1], this.ground(...B) + .12), .09, rgb('#766750'));
                    continue;
                }
                borders.line(this.coord(ax, ay, this.ground(ax, ay) + .12), this.coord(bx, by, this.ground(bx, by) + .12), .13, rgb('#465457'));
                borders.line(this.coord(ax, ay, this.ground(ax, ay) + .14), this.coord(bx, by, this.ground(bx, by) + .14), .045, rgb('#f6ecce'));
            }
        }
    for (const r of s.routes) {
        const a = s.provinces[r.a], b = s.provinces[r.b];
        if (a.owner < 0 || b.owner < 0 || a.owner === b.owner)
            continue;
        const rel = s.relations[cPair(a.owner, b.owner)];
        if (!rel?.trade || warBetween(s, a.owner, b.owner))
            continue;
        for (let k = 1; k < r.path.length; k++) {
            if (k % 5 === 0 || k % 5 === 1)
                continue;
            const i = r.path[k - 1], j = r.path[k];
            routes.line(this.coord(i % GW, i / GW | 0, .10), this.coord(j % GW, j / GW | 0, .10), .045, rgb('#c5d9c6'));
        }
    }
    const link = (g, a, b, color) => {
        const A = s.provinces[s.realms[a]?.capital], B = s.provinces[s.realms[b]?.capital];
        if (!A || !B)
            return;
        let prev = null;
        for (let k = 0; k <= 54; k++) {
            const t = k / 54, x = lerp(A.x, B.x, t), y = lerp(A.y, B.y, t), p = this.coord(x, y, this.ground(x, y) + .7 + 2 * Math.sin(Math.PI * t));
            if (prev && k % 6 < 4)
                g.line(prev, p, .095, color);
            prev = p;
        }
    };
    for (const r of Object.values(s.relations))
        if (r.alliance && s.realms[r.a]?.alive && s.realms[r.b]?.alive)
            link(pacts, r.a, r.b, rgb('#bad8bf'));
    for (const war of s.wars)
        if (!war.ended)
            link(wars, war.a, war.b, rgb('#d48064'));
    for (let y = 2; y < GH - 2; y += 3)
        for (let x = 2; x < GW - 2; x += 3) {
            const i = y * GW + x;
            if (![18, 19, 20].includes(w.biome[i]))
                continue;
            const p = this.coord(x, y);
            for (let k = 0; k < 3; k++)
                reeds.cone(p[0] + k * .11, p[1], p[2] + (k % 2) * .17, .045, .01, .35 + (k % 2) * .1, rgb('#426f59'), 4);
        }
    this.upload('settlements', towns, true);
    this.upload('frontiers', borders, false, .8);
    this.upload('tradeRoutes', routes, false, .75, .65);
    this.upload('pactLines', pacts, false, .75, .75);
    this.upload('warLines', wars, false, .8, .9);
    this.upload('reeds', reeds, true);
    this.request();
};
AtlasRenderer.prototype.setCivilization = function (sim) { this.sim = sim; this.hoveredRealm = null; this.prepareTerritory(); this.buildTerrain(); this.buildCivilization(); this.request(); };
const geographyLayerBase = AtlasRenderer.prototype.setLayer;
AtlasRenderer.prototype.setLayer = function (layer) { geographyLayerBase.call(this, layer); if (this.sim)
    this.buildCivilization(); };
