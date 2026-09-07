/** City scenes reuse the tested world renderer/shadow pipeline, including Canvas fallback. */
function cityBox(g, x, y, z, w, h, d, c) {
    const a = [x - w / 2, y, z - d / 2], b = [x + w / 2, y, z - d / 2], q = [x + w / 2, y, z + d / 2], r = [x - w / 2, y, z + d / 2], up = p => [p[0], p[1] + h, p[2]];
    g.quad(a, b, up(b), up(a), c);
    g.quad(b, q, up(q), up(b), c);
    g.quad(q, r, up(r), up(q), c);
    g.quad(r, a, up(a), up(r), c);
    g.quad(up(a), up(b), up(q), up(r), c);
}
function cityRoof(g, b, c) {
    const { x, z, w, d } = b, y = b.y + b.h, peak = y + Math.min(w, d) * .43;
    const a = [x - w * .57, y, z - d * .57], q = [x + w * .57, y, z - d * .57], r = [x + w * .57, y, z + d * .57], s = [x - w * .57, y, z + d * .57], A = [x, peak, z - d * .57], B = [x, peak, z + d * .57];
    g.quad(a, A, B, s, c);
    g.quad(A, q, r, B, c);
    g.tri(a, q, A, c);
    g.tri(s, B, r, c);
}
function createCityRenderer(canvas, onChange, config = {}) {
    // Mesh-only collection does not allocate a canvas or a rendering context.
    const r = config.collectOnly ? {
        meshes: {}, software: false, request(){},
        clear(){this.meshes={};},
        upload(name,g,shadow=true,unlit=0,alpha=1){
            this.meshes[name]={vertices:new Float32Array(g.data),count:g.data.length/9,shadow,unlit,alpha};
        }
    } : installDepthRasterizer(new AtlasRenderer(canvas, onChange));
    r.mode = 'beauty';
    r.city = null;
    r.layer = 'city';
    // Software rendering also needs an explicit light-space projection.
    r.lightVP = mul4(ortho(-110, 110, -87, 87, 1, 380), lookAt([-110, 170, -82], [0, 0, 0], [0, 1, 0]));
    r.zoom = 1;
    r.target = [0, 0, 0];
    r.elevation = .76;
    r.azimuth = -.17;
    r.relief = 1;
    r.backgroundColor=rgb('#748e8e');r.renderQuality=1.25;
    for(const e of ['pointerdown'])canvas?.addEventListener(e,()=>{r.interacting=true});
    for(const e of ['pointerup','pointercancel'])canvas?.addEventListener(e,()=>{r.interacting=false;r.request()});
    r.showRoofs = true; r.showTrees = true; r.showContext=true;
    r.visible=name=>(name!=='roofs'||r.showRoofs)&&(name!=='trees'||r.showTrees)&&(!name.startsWith('context')||r.showContext)&&(name!=='townSlab'||!r.showContext);
    r.ground = function (x, z) { if (!this.city)
        return 0; const c = this.city, xx = cityClamp((x / c.width + .5) * (c.n - 1), 0, c.n - 1), yy = cityClamp((z / c.depth + .5) * (c.n - 1), 0, c.n - 1), a = Math.floor(xx), b = Math.floor(yy), u = xx - a, v = yy - b, at = (i, j) => c.height[Math.min(j, c.n - 1) * c.n + Math.min(i, c.n - 1)]; return lerp(lerp(at(a, b), at(a + 1, b), u), lerp(at(a, b + 1), at(a + 1, b + 1), u), v); };
    r.coord = function (x, z, h = null) { return [x, h ?? this.ground(x, z), z]; };
    r.screen = function (x, z, dh = 0) { if (!this.mvp)
        return [-1000, -1000]; const p = project4(this.mvp, [x, this.ground(x, z) + dh, z]); return [(p[0] / p[3] * .5 + .5) * this.width, (.5 - p[1] / p[3] * .5) * this.height]; };
    r.reset = function () { this.zoom = 1.20; this.target = this.city ? [this.city.market.x, 2, this.city.market.z] : [0, 0, 0]; const e=this.city?.siteEnvironment,dx=(e?.peak.x||0)-(this.province?.x||0),dy=(e?.peak.y||0)-(this.province?.y||0);this.azimuth=e?.mountainous?Math.atan2(-dx,-dy)-.25:-.38;this.elevation=.76;const b=this.city?.buildings.find(b=>b.sacred);if(b){this.target=[(b.x+this.city.market.x)*.45,b.y+11,(b.z+this.city.market.z)*.45];this.elevation=.66;this.azimuth=-(b.angle||0)-.45;this.zoom=1.14;}this.request(); };
    r.frameSetting=function(){this.reset();this.zoom=.68;this.target=[0,5,0];this.elevation=1.04;this.showContext=true;this.dirtyShadow=true;this.request();};
    r.focusBuilding = function (b) { const h=this.landmarkHeights?.[b.id]||b.h;this.target = [b.x, b.y + (b.sacred?h*.37:1), b.z]; this.zoom = b.sacred?1.65:3.4; this.elevation=b.sacred?.58:this.elevation;this.azimuth=b.sacred?-.38-(b.angle||0):this.azimuth;this.request(); };
    r.frameSanctuary=function(){const b=this.city?.buildings.find(b=>b.sacred);if(b){this.focusBuilding(b);this.zoom=1.0;this.target[1]=b.y+12;this.request();}};
    r.pick = function (sx, sy) {
        if (!this.city)
            return null;
        this.updateCamera();
        const nx = (sx / this.width * 2 - 1) * this.halfW, ny = (1 - sy / this.height * 2) * this.halfH, origin = this.target.map((v, i) => v + this.right[i] * nx + this.up[i] * ny - this.dir[i] * 180);
        let nearest = null, tmin = Infinity;
        for (const b of this.city.buildings) {
            const lo = [b.x - b.w / 2, b.y, b.z - b.d / 2], hi = [b.x + b.w / 2, b.y + (this.landmarkHeights?.[b.id] || (b.h + Math.max(b.w, b.d) * .55)), b.z + b.d / 2];
            let t0 = 0, t1 = Infinity;
            for (let a = 0; a < 3; a++) {
                if (Math.abs(this.dir[a]) < 1e-8) {
                    if (origin[a] < lo[a] || origin[a] > hi[a])
                        t1 = -1;
                    continue;
                }
                const x = (lo[a] - origin[a]) / this.dir[a], y = (hi[a] - origin[a]) / this.dir[a];
                t0 = Math.max(t0, Math.min(x, y));
                t1 = Math.min(t1, Math.max(x, y));
            }
            if (t0 <= t1 && t0 < tmin) {
                tmin = t0;
                nearest = b;
            }
        }
        return nearest;
    };
    r.selectBuilding = function (b) { this.selectedBuilding = b?.id || null; const g = new Geometry(); if (b) {
        const col = rgb('#ecd18a'), off = .32, y = b.y + .14;
        const pts = [[b.x - b.w / 2 - off, y, b.z - b.d / 2 - off], [b.x + b.w / 2 + off, y, b.z - b.d / 2 - off], [b.x + b.w / 2 + off, y, b.z + b.d / 2 + off], [b.x - b.w / 2 - off, y, b.z + b.d / 2 + off]];
        for (let k = 0; k < 4; k++)
            g.line(pts[k], pts[(k + 1) % 4], .15, col);
    } this.upload('selectedLot', g, false, 1); this.request(); };
    r.setCity = function (c, p, realm, state = {}) {
        const sceneKey=c.fingerprint+'/'+c.environment.signature+'/'+c.context.signature+'/'+this.mode+'/'+(realm?.id??-1)+'/'+JSON.stringify([(typeof window!=='undefined'?window.sim?.landmarkRecipes:null)||{},state.levels||{},(state.projects||[]).filter(p=>p.status==='building').map(p=>[p.key,p.due])]);
        if(sceneKey===this.geometryKey){this.cityState=state;return;}
        this.geometryKey=null;
        this.clear();
        this.city = c;
        const sacredScene=c.buildings.some(b=>b.sacred),angle=c.buildings.find(b=>b.sacred)?.angle||0;
        this.antialiasScale=sacredScene?1.40:1;this.contactShadows=sacredScene;
        const sx=-.60,sz=.80;this.sunDirection=sacredScene?[sx*Math.cos(angle)-sz*Math.sin(angle),1, sx*Math.sin(angle)+sz*Math.cos(angle)]:[-.65,1,-.48];
        this.lightVP=mul4(ortho(-112,112,-92,98,1,430),lookAt(this.sunDirection.map((v,j)=>v*160+(j===1?12:0)),[0,12,0],[0,1,0]));
        this.landmarkHeights = {};
        this.province = p;
        this.realm = realm;
        this.cityState = state;
        this.world = null;
        const terrain = new Geometry(), sea = new Geometry(), roads = new Geometry(), buildings = new Geometry(), roofs = new Geometry(), details = new Geometry(), trees = new Geometry(), farms = new Geometry(), walls = new Geometry(), port = new Geometry();
        const dry = c.siteEnvironment.aridity<.6&&c.siteEnvironment.temperature>=16;
        const colorAt=(grid,ids)=>{const col=[0,0,0];for(const i of ids)for(let j=0;j<3;j++)col[j]+=grid.color[i*3+j]/ids.length;return col;};
        const elevation = (x, z) => this.ground(x, z);
        for (let y = 0; y < c.n - 1; y++)
            for (let x = 0; x < c.n - 1; x++) {
                const k = y * c.n + x, k1 = k + 1, k2 = k + c.n, k3 = k2 + 1, pts = [k, k1, k2, k3].map(i => { const q = c.xy(i); return [q.x, c.height[i], q.z]; }), wet = c.water[k] + c.water[k1] + c.water[k2] + c.water[k3] >= 2;
                const ids=[k,k1,k2,k3],col=wet?CityEnvironment.waterColor(c.waterKind[ids.find(i=>c.water[i])]||3):colorAt(c.environment,ids);
                const g=wet?sea:terrain;
                g.tri(pts[0],pts[2],pts[1],col);g.tri(pts[1],pts[2],pts[3],col);
            }
        // Context is not a template backdrop: sample the same parent world at
        // the same scale, with an exact shared inner edge. No new mountains.
        const contextTerrain=new Geometry(),contextWater=new Geometry(),contextSides=new Geometry(),townSlab=new Geometry();
        const outer=c.context;
        for(let y=0;y<outer.n-1;y++)for(let x=0;x<outer.n-1;x++){
            if(x>=outer.innerStart&&x<outer.innerEnd&&y>=outer.innerStart&&y<outer.innerEnd)continue;
            const k=y*outer.n+x,ids=[k,k+1,k+outer.n,k+outer.n+1],pts=ids.map(i=>{const q=outer.xy(i);return[q.x,outer.height[i],q.z];}),wet=ids.filter(i=>outer.water[i]).length>=2;
            const col=wet?CityEnvironment.waterColor(outer.waterKind[ids.find(i=>outer.water[i])]):colorAt(outer,ids),g=wet?contextWater:contextTerrain;
            g.tri(pts[0],pts[2],pts[1],col);g.tri(pts[1],pts[2],pts[3],col);
        }
        const sides=(grid,dest)=>{
            const slabY=Math.min(...grid.height)-2.8;
            for(const[start,step]of [[0,1],[grid.n*(grid.n-1),1],[0,grid.n],[grid.n-1,grid.n]])for(let k=0;k<grid.n-1;k++){
                const i=start+k*step,j=i+step,a=grid.xy(i),b=grid.xy(j);
                dest.quad([a.x,grid.height[i],a.z],[b.x,grid.height[j],b.z],[b.x,slabY,b.z],[a.x,slabY,a.z],rgb('#9e9c91'));
            }
        };
        sides(outer,contextSides);sides(c,townSlab);
        this.upload('contextTerrain',contextTerrain,true);this.upload('contextWater',contextWater,false,.4);this.upload('contextSides',contextSides,true);this.upload('townSlab',townSlab,true);
        for (const road of c.roads) {
            const width = (c.townProfile?.width || 1) * (road.kind === 'arterial' ? .67 : road.kind === 'street' ? .5 : .37);
            for (let k = 1; k < road.points.length; k++) {
                const a = road.points[k - 1], b = road.points[k], bridge = a.bridge || b.bridge, Y = (a.y + b.y) * .5 + (bridge ? .48 : 0);
                roads.line([a.x, a.y + (bridge ? .48 : 0), a.z], [b.x, b.y + (bridge ? .48 : 0), b.z], bridge ? width + .18 : width, rgb(bridge ? '#8f8879' : '#d8c6a2'));
                if (bridge && k % 2 === 0)
                    cityBox(details, a.x, Y - 1.6, a.z, .3, 1.6, .3, rgb('#bab9a6'));
            }
        }
        for (const f of c.farms) {
            const colors = ['#b8b87d', '#bfb789', '#9ca678'];
            farms.quad([f.x - f.w / 2, f.y + .04, f.z - f.d / 2], [f.x + f.w / 2, f.y + .04, f.z - f.d / 2], [f.x + f.w / 2, f.y + .04, f.z + f.d / 2], [f.x - f.w / 2, f.y + .04, f.z + f.d / 2], rgb(colors[Math.floor(hash2(f.x, f.z, c.seed) * 3)]));
            for (let z = -f.d / 2; z < f.d / 2; z += .85)
                farms.line([f.x - f.w / 2, f.y + .07, f.z + z], [f.x + f.w / 2, f.y + .07, f.z + z], .035, rgb('#7f926b'));
        }
        const body = rgb(dry ? '#d9c6a3' : '#e4dacc'), roofColors = dry ? ['#ab8167', '#bd9974', '#baa383'] : ['#995f49', '#ab7558', '#ad8867', '#777f77'];
        for (const b0 of c.buildings) {
            const b = { ...b0 };
            if (b.type === 'granary' && state.levels?.granary)
                b.h += state.levels.granary * .7;
            if (b.type === 'academy' && state.levels?.academy)
                b.h += state.levels.academy;
            const foundation=Math.max(.08,b.y-(b.foundationBed??b.y)+.05);
            const fcol=rgb(ArtisanCityKit.palettes[c.townProfile.id].wall);
            cityBox(buildings,b.x,b.y-foundation,b.z,b.w*.98,foundation,b.d*.98,colorScale(fcol,.82));
            const district = c.districts[b.district], tint = this.mode === 'districts' ? rgb(CITY_TYPES[district.type].color) : b.type === 'academy' ? rgb('#c9c9d4') : body;
            const color = colorScale(tint, .93 + hash2(b.x, b.z, c.seed + 1) * .12), roof = rgb(roofColors[Math.floor(hash2(b.x, b.z, c.seed) * roofColors.length)]);
            if (b.landmark && ['civic','temple','academy'].includes(b.type) && typeof LandmarkBinding !== 'undefined' && window.world && window.sim) {
                const recipe=TownCityBinding.resolve(window.world, window.sim, p, c, b.type);
                const monument=TownCityBinding.miniature(recipe,b);
                for (const value of monument.body.data) details.data.push(value);
                for (const value of monument.roof.data) roofs.data.push(value);
                this.landmarkHeights[b.id]=monument.height;
                continue;
            }
            const compound = ArtisanCityKit.compound(b,c,p,realm);
            if(this.mode==='districts') { const tint=rgb(CITY_TYPES[district.type].color);for(const mesh of [compound.body,compound.roof])for(let i=0;i<mesh.data.length;i+=9)for(let k=0;k<3;k++)mesh.data[i+6+k]=mesh.data[i+6+k]*.45+tint[k]*.55; }
            if(this.mode==='blocks') {
                const col=rgb(CITY_TYPES[district.type].color),yy=b.y+.15;
                for(const [a,z] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
                  const B=a===z?[a,-z]:[-a,z];details.line([b.x+a*b.w/2,yy,b.z+z*b.d/2],[b.x+B[0]*b.w/2,yy,b.z+B[1]*b.d/2],.07,col);
                }
                if(b.streetSocket!=null){const q=c.xy(b.streetSocket);details.cone(q.x,elevation(q.x,q.z)+.12,q.z,.26,.26,.12,rgb('#d4ad63'),8);}
            }
            for (const value of compound.body.data) buildings.data.push(value);
            for (const value of compound.roof.data) roofs.data.push(value);
            this.landmarkHeights[b.id]=compound.height;
        }
        // Every valid compound connector runs to an existing road, rather than
        // stopping at an unexplained gap. Its water/collision tests run in generation.
        for(const q of c.connectors||[]) roads.line([q.a.x,elevation(q.a.x,q.a.z)+.11,q.a.z],[q.b.x,elevation(q.b.x,q.b.z)+.11,q.b.z],.22,rgb('#d6c6a6'));
        // Public squares, tents and market stalls belong to the market neighborhood.
        const m = c.market;
        for (let k = 0; k < 10; k++) {
            const a = k / 10 * 6.283, x = m.x + Math.cos(a) * 3.4, z = m.z + Math.sin(a) * 3.4;
            if (c.water[c.index(x, z)])
                continue;
            const y = elevation(x, z);
            cityBox(details, x, y, z, .95, .75, .8, rgb('#a18b66'));
            cityBox(details, x, y + .92, z, 1.25, .12, 1.05, rgb(k % 2 ? '#c3a16d' : '#9eb6a3'));
        }
        for (const p of c.piers) {
            port.line([p.a.x, p.y, p.a.z], [p.b.x, p.y, p.b.z], .7, rgb('#9c977d'));
            for (let t = 0; t <= 1; t += .25) {
                const x = lerp(p.a.x, p.b.x, t), z = lerp(p.a.z, p.b.z, t);
                cityBox(port, x, p.y - 1.4, z, .16, 1.7, .16, rgb('#797d67'));
            }
        }
        // The working waterfront. Its footprint was validated against real shore, dry
        // ground and the existing compounds during generation; nothing is placed here.
        if (c.port) {
            const kit = ArtisanCityKit.palettes[c.townProfile.id], stone = rgb(kit.wall), timber = rgb(kit.wood);
            const deckCol = colorScale(stone, .93), hullCol = colorScale(timber, 1.05), sailCol = rgb(kit.trim);
            for (const q of c.port.quays) {
                port.line([q.a.x, q.y, q.a.z], [q.b.x, q.y, q.b.z], q.width, deckCol);
                for (const e of [q.a, q.b])
                    cityBox(port, e.x, q.y - 1.5, e.z, .34, 1.5, .34, colorScale(stone, .80));
            }
            for (const j of c.port.jetties) {
                port.line([j.a.x, j.y, j.a.z], [j.b.x, j.y, j.b.z], j.width, timber);
                for (let t = .15; t <= 1; t += .28) {
                    const x = lerp(j.a.x, j.b.x, t), z = lerp(j.a.z, j.b.z, t);
                    cityBox(port, x, j.y - 1.8, z, .13, 1.8, .13, colorScale(timber, .84));
                }
            }
            for (const b of c.port.bollards)
                port.cone(b.x, b.y, b.z, .16, .13, .42, colorScale(stone, .74), 5);
            for (const m of c.port.moorings) {
                const ca = Math.cos(m.angle), sa = Math.sin(m.angle);
                const at = (u, v, h) => [m.x + u * ca - v * sa, m.y + h, m.z + u * sa + v * ca];
                const bow = at(m.length * .5, 0, .30), stern = at(-m.length * .5, 0, .22);
                for (const side of [-1, 1]) {
                    const gunwale = at(0, side * m.beam * .5, .34), keel = at(0, side * m.beam * .18, -.16);
                    port.tri(bow, gunwale, keel, hullCol);
                    port.tri(stern, keel, gunwale, hullCol);
                    port.tri(bow, keel, gunwale, hullCol);
                }
                port.quad(at(m.length * .42, -m.beam * .42, .34), at(m.length * .42, m.beam * .42, .34), at(-m.length * .42, m.beam * .42, .30), at(-m.length * .42, -m.beam * .42, .30), colorScale(timber, .92));
                if (m.kind === 'boat') {
                    port.cone(m.x, m.y + .34, m.z, .07, .05, m.length * .95, timber, 4);
                    port.tri([m.x, m.y + .34 + m.length * .95, m.z], at(m.length * .40, 0, .34 + m.length * .48), [m.x, m.y + .52, m.z], sailCol);
                }
            }
            for (const s of c.port.sheds) {
                cityBox(port, s.x, s.y, s.z, s.w, s.h, s.d, colorScale(stone, .96));
                port.cone(s.x, s.y + s.h, s.z, Math.max(s.w, s.d) * .56, 0, Math.min(s.w, s.d) * .30, rgb(kit.roof), 4, s.angle);
            }
            for (const cr of c.port.cranes) {
                port.cone(cr.x, cr.y, cr.z, .22, .16, cr.h, timber, 5);
                const tipX = cr.x + Math.cos(cr.angle) * cr.h * .62, tipZ = cr.z + Math.sin(cr.angle) * cr.h * .62;
                port.line([cr.x, cr.y + cr.h, cr.z], [tipX, cr.y + cr.h * .72, tipZ], .10, timber);
                port.line([tipX, cr.y + cr.h * .72, tipZ], [tipX, cr.y + cr.h * .30, tipZ + .02], .05, colorScale(timber, .8));
            }
            if (c.port.beacon) {
                const b = c.port.beacon;
                port.cone(b.x, b.y, b.z, .95, .55, b.h, stone, 8);
                port.cone(b.x, b.y + b.h, b.z, .62, .48, .55, rgb(kit.metal), 8);
                port.cone(b.x, b.y + b.h + .55, b.z, .55, 0, .60, rgb(kit.roof), 8);
            }
        }
        // Defensive circuits are built around the actual urban footprint, with
        // explicit road openings, gatehouses and waterfront breaks.
        const defense=ArtisanCityKit.fortificationMeshes(c,p);
        for(const x of defense.body.data)walls.data.push(x);
        for(const x of defense.roof.data)roofs.data.push(x);
        for (const t of c.trees) {
            details.cone(t.x, t.y, t.z, .12, .1, t.h * .65, rgb('#827b5c'), 5);
            if (t.kind === 'pine') {
                trees.cone(t.x, t.y + .65, t.z, .95, 0, t.h, rgb('#54786a'), 6);
            }
            else {
                trees.blob(t.x, t.y + t.h * .7, t.z, 1.05, rgb('#70947b'), t.h * .35);
                trees.blob(t.x + .25, t.y + t.h * .95, t.z - .3, .7, rgb('#84a181'), .9);
            }
        }
        // Scaffolding is stateful: project completion removes it on the next refresh.
        for (const proj of state.projects || []) {
            if (proj.status !== 'building')
                continue;
            const b = c.buildings.find(b => b.type === (proj.key === 'waterworks' ? 'well' : proj.key === 'harbor' ? 'harbor' : proj.key === 'festival' ? 'market' : proj.key)) || c.buildings[0];
            if (!b)
                continue;
            for (const dx of [-1, 1])
                for (const dz of [-1, 1])
                    cityBox(details, b.x + dx * (b.w / 2 + .35), b.y, b.z + dz * (b.d / 2 + .35), .12, b.h + 1, .12, rgb('#aa916e'));
            details.line([b.x - b.w / 2 - .35, b.y + b.h, b.z + b.d / 2 + .35], [b.x + b.w / 2 + .35, b.y + b.h, b.z + b.d / 2 + .35], .09, rgb('#ae946a'));
        }
        this.upload('terrain', terrain, true);
        this.upload('water', sea, false, .4);
        this.upload('farms', farms, false);
        this.upload('streets', roads, false);
        this.upload('cityWalls', walls, true);
        this.upload('port', port, true);
        this.upload('buildings', buildings, true);
        this.upload('roofs', roofs, true);
        this.upload('details', details, true);
        this.upload('trees', trees, true);
        this.geometryKey=sceneKey;
        this.request();
    };
    r.exportScene = function () {
        const geometry = { format: 'telluric-city-geometry', version: 1, city: r.city.name, seed: r.city.seed, meshes: {} };
        for (const [k, m] of Object.entries(r.meshes))
            if (k !== 'selectedLot')
                geometry.meshes[k] = { interleaved: Array.from(m.vertices), stride: 9, attributes: ['position:3', 'normal:3', 'color:3'] };
        return geometry;
    };
    return r;
}
