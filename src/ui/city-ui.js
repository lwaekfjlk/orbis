/** Drill-down controller. Lazy city generation and a bounded 8-scene layout cache. */
window.CityUI = (() => {
    let cr = null, activeId = null, layout = null, tab = 'dossier', selectedBuilding = null, lastFocus = null, cache = new Map(), labelNodes = [], journey = null, previousWorld = null;
    const E = id => document.getElementById(id), esc = s => escapeHTML(s);
    function key(p) { return `sacred-v1/${world.params.seed}/${sim.physicalHash||''}/env-${CityEnvironment.version}/${p.i}/${p.detailSupport ?? p.urbanSupport}/${TownCatalog.signature(TownCatalog.resolve(world,sim,p))}${p.highCitadel?'/high/'+JSON.stringify(p.highCitadel):''}`; }
    function getLayout(p) { const k = key(p); if (cache.has(k)) {
        const value = cache.get(k);
        cache.delete(k);
        cache.set(k, value);
        return value;
    } const c = generateCity(world, sim, p.id); cache.set(k, c); while (cache.size > 8)
        cache.delete(cache.keys().next().value); return c; }
    function open(id) {
        if(window.ContinuousMap?.active)return ContinuousMap.focusTown(id);
        if (busy || !sim)
            return;
        const p = sim.provinces[Number(id)];
        if (!p?.settled) {
            toast('Select a village or town. Rural districts do not receive invented cities.');
            return;
        }
        pause();
        lastFocus = document.activeElement;
        try {
            layout = getLayout(p);
            activeId = p.id;
            selectedBuilding = null;
            journey = null;
            tab = 'dossier';
            if (!E('cityDialog').open)
                E('cityDialog').show();
            window.OneMap?.setScene('city');
            if (!cr) {
                cr = createCityRenderer(E('cityCanvas'), positionLabels);
                bindCamera();
            }
            cr.mode = 'beauty';
            cr.setCity(layout, p, sim.realms[p.owner], sim.cityState?.[p.id] || {});
            cr.resize();
            cr.reset();
            E('cityCamera').value = 'relief';
            render();
            E('cityCanvas').focus({preventScroll:true});
            window.OneMap?.setScene('city');
            window.__cityReady = true;
            window.__cityError = null;
        }
        catch (e) {
            window.__cityError = e.message;
            console.error(e);
            toast('City view: ' + e.message);
            E('cityDialog').close();
            activeId = null;
            window.OneMap?.setScene('world');
        }
    }
    function close() { if (!E('cityDialog')?.open)
        return; E('cityDialog').close(); activeId = null; selectedBuilding = null; window.__cityReady = false; if (lastFocus?.isConnected)
        lastFocus.focus(); window.OneMap?.setScene(window.LandmarkUI?.isOpen ? 'landmark':'world'); }
    function onWorldUpdate() {
        if (!world || !sim)
            return;
        const worldReplaced = previousWorld !== world;
        if (worldReplaced) {
            cache.clear();
            previousWorld = world;
        }
        refreshPicker();
        if (activeId !== null && E('cityDialog').open) {
            const p = sim.provinces[activeId];
            if (!p) {
                close();
                return;
            }
            layout=getLayout(p);
            cr.setCity(layout, p, sim.realms[p.owner], sim.cityState?.[p.id] || {});
            render();
        }
        const p = sim.provinces[world.provinceId[selectedCell]];
        offerCity(p);
    }
    function refreshPicker() {
        const el = E('cityPicker');
        if (!el)
            return;
        const keep = el.value;
        el.innerHTML = sim.provinces.filter(p => p.settled).sort((a, b) => b.urbanPop - a.urbanPop).map(p => `<option value="${p.id}">${esc(p.name)} · ${fmtPop(p.urbanPop)} · ${esc(LandmarkBinding.highCitadelLabel(p) || (p.harbor > .3 ? 'Coastal' : p.siteLake > .25 ? 'Lakeshore' : p.altitude > 1400 ? 'Highland' : p.aridity < .65 ? 'Dryland' : 'Inland'))}</option>`).join('');
        if ([...el.options].some(o => o.value === keep))
            el.value = keep;
    }
    function offerCity(p) {
        E('enterSelectedCity')?.remove();
        const offer = E('cityOffer');
        if (!offer)
            return;
        if (!p?.settled) {
            offer.classList.add('hidden');
            return;
        }
        offer.classList.remove('hidden');
        offer.innerHTML = `<strong>${esc(p.name)}</strong><span>Enter city →</span>`;
        offer.onclick = () => open(p.id);
        const button = document.createElement('button');
        button.id = 'enterSelectedCity';
        button.className = 'enter-city-btn';
        button.textContent = `Explore ${p.name} →`;
        button.onclick = () => open(p.id);
        E('inspector').appendChild(button);
    }
    function render() {
        if (activeId === null)
            return;
        const p = sim.provinces[activeId], realm = sim.realms[p.owner], continent = world.landmasses.find(c => c.id === p.landmass);
        E('cityTitle').textContent = p.name;
        E('cityMapName').textContent = p.name;
        E('cityYear').textContent = `YEAR ${sim.year} AC`;
        E('cityBreadcrumb').innerHTML = `WORLD / ${esc(continent?.name || 'REGION')} / <b>${esc(realm?.name || 'FREE COMMUNITIES')}</b>`;
        E('cityMapSubtitle').textContent = `${LandmarkBinding.highCitadelLabel(p)||layout.siteEnvironment.label}${p.highCitadel?' · '+Math.round(p.highCitadel.elevation).toLocaleString()+' m':''} · ${layout.stats.modules} compounds`;
        E('cityProvenance').textContent = `WORLD CELL ${p.i} · ENV ${layout.environment.signature} · ${cr.software ? 'CANVAS' : 'WEBGL2'}`;
        document.querySelectorAll('[data-city-tab]').forEach(b => b.classList.toggle('active', b.dataset.cityTab === tab));
        document.querySelectorAll('[data-city-mode]').forEach(b => b.classList.toggle('active', b.dataset.cityMode === cr.mode));
        E('cityDistricts').innerHTML = layout.districts.map(d => `<button class="district-chip" data-district="${d.id}"><strong><i style="background:${CITY_TYPES[d.type].color}"></i>${esc(d.name)}</strong><small>${d.buildings} COMPOUNDS & LANDMARKS</small></button>`).join('');
        E('cityDistricts').querySelectorAll('[data-district]').forEach(b => b.onclick = () => { const d = layout.districts[+b.dataset.district]; cr.target = [d.x, cr.ground(d.x, d.z), d.z]; cr.zoom = 2.5; cr.request(); const building = layout.buildings.find(x => x.district === d.id && x.landmark) || layout.buildings.find(x => x.district === d.id); if (building)
            select(building); });
        renderPanel();
        makeLabels();
    }
    function select(b) { selectedBuilding = b; tab = 'dossier'; cr.selectBuilding(b); render(); window.OneMap?.inspectBuilding(b); }
    function recompose(design={}) {
        if(activeId===null||busy)return;
        const p=sim.provinces[activeId],old=sim.townRecipes?.[activeId];
        try {
            const recipe=TownCatalog.resolve(world,sim,p,design),before=physicalFingerprint(world),settlements=settlementFingerprint(sim);
            const next=generateCity(world,sim,activeId,recipe);
            if(physicalFingerprint(world)!==before||settlementFingerprint(sim)!==settlements)throw Error('Design changed its parent world.');
            sim.townRecipes=sim.townRecipes||{};sim.townRecipes[activeId]=recipe;
            layout=next;cache.clear();cache.set(key(p),layout);selectedBuilding=null;
            cr.setCity(layout,p,sim.realms[p.owner],sim.cityState?.[p.id]||{});cr.reset();tab='assembly';render();
            toast('Whole town recomposed. Terrain, population and country borders are unchanged.');
        } catch(e){console.error(e);toast('Town composition: '+e.message);if(old)sim.townRecipes[activeId]=old;}
    }
    function settingPanel(p){
        const e=layout.siteEnvironment,g=layout.environment;
        return `<section class="town-setting-card"><div class="overline">GEOGRAPHY LOCKED · WORLD CELL ${p.i}</div><h3>${esc(LandmarkBinding.highCitadelLabel(p)||e.label)}</h3><p>Town site: ${BIOME[e.biome][0]} · ${e.temperature.toFixed(1)} °C · ${esc(e.climateBand||'')}.<br>Surrounding relief: ${Math.round(e.minElevation).toLocaleString()}–${Math.round(e.maxElevation).toLocaleString()} model m.${e.glacialFoothills?'<br>Glacier-bearing slopes are inherited from the atlas; the town floor is not automatically snow-covered.':''}</p><div class="city-facts"><span>Climate source</span><b>Each world sample</b><span>Ice / biome data</span><b>Inherited, not template colors</b><span>Roofs, walls &amp; planting</span><b>Adapted per block to its own cell</b><span>Environment hash</span><b>${g.signature}</b></div><button id="cityShowSetting">Town + surroundings ↗</button> <button id="cityLocateSource">Locate on atlas</button>${layout.townRecipe.compatibilityNote?`<p>${esc(layout.townRecipe.compatibilityNote)}</p>`:''}</section>`;
    }
    function assemblyPanel(p,el) {
        const t=layout.highCitadel?{...layout.townProfile,name:LandmarkBinding.highCitadelLabel(p),description:layout.highCitadel.kind==='dragon'?'A small royal aerie of dark stone, winged roofs and guarded mountain courts.':'A small pilgrimage settlement of pale stone, cloistered courts and a summit sanctuary.'}:layout.townProfile,r=layout.townRecipe;
        el.innerHTML=`${settingPanel(p)}<div class="overline">TOWN → DISTRICTS → COMPOUNDS</div><h2>${esc(t.name)}</h2><p class="lead">${esc(t.description)}</p><div class="town-type-grid">${(layout.highCitadel?TownCatalog.styles.filter(a=>a.id==='mountain'):TownCatalog.styles).map(a=>`<button data-town-style="${a.id}" class="${a.id===t.id?'active':''}" ${TownCatalog.allowed(p,world,a.id)?'':'disabled'} title="${esc(TownCatalog.allowed(p,world,a.id)?a.description:'This site lacks the required geography.')}" ><span>${esc(a.short)}</span><small>${esc(a.plan.toUpperCase())}</small></button>`).join('')}</div><div class="city-metrics"><div><b>${layout.stats.modules}</b><small>ORDINARY COMPOUNDS</small></div><div><b>${layout.stats.landmarks}</b><small>PUBLIC ANCHORS</small></div></div><label class="town-label" for="townSeed">Composition seed</label><input id="townSeed" value="${esc(r.seed)}" maxlength="120" spellcheck="false"><button id="townRecompose" class="enter-city-btn">Recompose town · same land</button><p class="city-note">This is a visual planning change, not an economic event. Country borders, water, terrain and population are read-only.</p><h3>Assembly recipe</h3><div class="city-facts"><span>Street grammar</span><b>${esc(t.plan)}</b><span>Ordinary module family</span><b>${esc(t.kit)}</b><span>Urban material</span><b>${esc(t.material)}</b><span>Roof language</span><b>${esc(t.roof)}</b><span>Street-connected blocks</span><b>${layout.connectors.length} / ${layout.stats.buildings}</b></div><h3>Explore the districts</h3><div class="city-landmark-list">${layout.districts.map(d=>`<button data-town-district="${d.id}">${esc(d.name)} · ${d.buildings} modules ↗</button>`).join('')}</div><div class="town-recipe-actions"><button id="townSaveRecipe">Save recipe</button><button id="townImportRecipe">Load recipe</button></div><input type="file" id="townRecipeInput" accept="application/json,.json" hidden><p class="city-note">One module can contain several houses, a shared court, a workshop and a street socket. Models are schematic; no new residents or landforms are created.</p>`;
        E('cityShowSetting').onclick=()=>{E('cityContext').checked=true;cr.frameSetting()};
        E('cityLocateSource').onclick=()=>{close();setLayer('relief');renderer.focus(p.x,p.y);renderer.zoom=9;inspectCell(p.i);renderer.request()};
        el.querySelectorAll('[data-town-style]').forEach(b=>b.onclick=()=>recompose({style:b.dataset.townStyle}));
        el.querySelectorAll('[data-town-district]').forEach(b=>b.onclick=()=>{const d=layout.districts[+b.dataset.townDistrict];cr.target=[d.x,cr.ground(d.x,d.z),d.z];cr.zoom=2.5;cr.request()});
        E('townRecompose').onclick=()=>{let seed=E('townSeed').value.trim()||r.seed;if(seed===r.seed)seed=seed.replace(/\/revision-\d+$/,'')+'/revision-'+(1+(Number(seed.match(/revision-(\d+)$/)?.[1])||0));recompose({seed})};
        E('townSaveRecipe').onclick=()=>saveBlob(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}),`town-${t.id}-${p.id}.recipe.json`);
        E('townImportRecipe').onclick=()=>E('townRecipeInput').click();
        E('townRecipeInput').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>100000)throw Error('Recipe file is too large.');const rr=TownCatalog.validate(JSON.parse(await f.text()));recompose({style:rr.style,seed:rr.seed,variety:rr.variety});}catch(err){toast(err.message)}};
    }
    function renderPanel() {
        if (activeId === null)
            return;
        const p = sim.provinces[activeId], c = sim.realms[p.owner], s = sim.cityState?.[activeId] || { levels: {}, projects: [], events: [] }, el = E('cityDossier');
        if (tab === 'assembly') { assemblyPanel(p,el); return; }
        if (tab === 'projects') {
            el.innerHTML = `<div class="overline">PUBLIC WORKS / ${sim.year}</div><h2>Make a difference.</h2><p>Projects spend the current ruler's treasury and finish as years advance. No terrain or new water is added.</p><div class="city-metrics"><div><b>${c ? c.treasury.toFixed(1) : '—'}</b><small>REALM TREASURY</small></div><div><b>${s.projects.filter(p => p.status === 'building').length}</b><small>UNDER CONSTRUCTION</small></div></div>` + Object.entries(CITY_PROJECTS).map(([k, d]) => { const q = cityProjectQuote(sim, p.id, k), pending = s.projects.find(p => p.key === k && p.status === 'building'); return `<section class="project-card"><h3>${esc(d.name)}</h3><div class="project-meta">${d.years} YEARS · LEVEL ${s.levels[k] || 0}/${d.limit}${q.cost ? ' · ' + q.cost.toFixed(1) + ' TREASURY' : ''}</div><p>${esc(d.description)}</p>${pending ? `<p>Completes in ${pending.due} · scaffolding is visible on the map.</p><div class="project-progress"><span style="width:${cityClamp((sim.year - pending.started) / (pending.due - pending.started) * 100, 0, 100)}%"></span></div>` : `<button data-project="${k}" ${q.ok ? '' : 'disabled'} title="${esc(q.reason)}">${q.ok ? 'Commission project' : esc(q.reason)}</button>`}</section>`; }).join('') + '<h3>Local record</h3>' + s.events.slice(-6).reverse().map(e => `<div class="city-event"><b>${e.year}</b> ${esc(e.text)}</div>`).join('');
            el.querySelectorAll('[data-project]').forEach(b => b.onclick = () => { const result = startCityProject(sim, world, p.id, b.dataset.project); toast(result.message); refreshAll(); });
            return;
        }
        if (tab === 'journey') {
            el.innerHTML = `<div class="overline">ROUTES, NOT STRAIGHT LINES</div><h2>Leave the city.</h2><p>Travel through the existing settlement network. Closed war frontiers cannot be crossed. Costs are model indices, not days.</p><select class="city-journey-select" id="cityDestination" aria-label="Travel destination">${sim.provinces.filter(q => q.city && q.id !== p.id).sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y)).map(q => `<option value="${q.id}">${esc(q.name)} · ${esc(sim.realms[q.owner]?.name || 'Free communities')}</option>`).join('')}</select><button id="planJourney" class="enter-city-btn">Find a route</button><div id="journeyResult"></div><p class="city-note">Route endpoints refer to the live world graph. Individual road paving and local building interiors are not simulated.</p>`;
            E('planJourney').onclick = () => { const to = +E('cityDestination').value; journey = planJourney(sim, p.id, to); E('journeyResult').innerHTML = journey.ok ? `<h3>${journey.cost.toFixed(1)} travel-cost units</h3>${journey.nodes.map((i, k) => `<div class="journey-stop"><b>${k + 1}. ${esc(sim.provinces[i].name)}</b><br>${esc(sim.provinces[i].settlementType)}${k ? ' · ' + esc(journey.segments[k - 1].kind) + ' connection' : ''}</div>`).join('')}<button id="visitDestination" class="enter-city-btn">Enter destination →</button>` : `<p>${esc(journey.reason)}</p>`; if (journey.ok)
                E('visitDestination').onclick = () => open(to); };
            return;
        }
        const b = selectedBuilding;
        el.innerHTML = `${b ? `<div class="building-card"><div class="overline">SELECTED TOWN MODULE / ${esc(b.id)}</div><h3>${esc(b.name)}</h3><p>${esc(CITY_TYPES[b.type]?.description || (b.type === 'granary' ? 'Stores part of the already allocated food surplus. Expand its stores from Projects.' : 'Collects and distributes water from the accessible local supply.'))}</p><div class="city-facts"><span>Precinct</span><b>${esc(layout.districts[b.district].name)}</b><span>Form</span><b>${b.landmark ? 'Public landmark' : esc(b.module)}</b><span>Street socket</span><b>${b.streetSocket??'Unconnected'}</b></div></div>` : ''}<div class="overline">${esc(p.settlementType)} / FIELD DOSSIER</div><h2>${esc(p.name)}</h2>${placeVitalsHTML(PlaceVitals.city(sim,p))}${placeNameOriginHTML(p)}<p class="lead">${esc(p.siteReason)}</p><div class="city-metrics"><div><b>${fmtPop(p.urbanPop)}</b><small>URBAN RESIDENTS</small></div><div><b>${fmtPop(p.ruralPop)}</b><small>RURAL HINTERLAND</small></div><div><b>${p.dev.toFixed(2)}</b><small>DEVELOPMENT INDEX</small></div><div><b>${Math.round(p.unrest)}</b><small>UNREST / 100</small></div></div><div class="city-facts"><span>Ruler</span><b>${esc(c?.name || 'Local communities')}</b><span>Local climate</span><b>${world.temp[p.i].toFixed(1)} °C</b><span>Freshwater access</span><b>${p.fresh.toFixed(2)}</b><span>Food support budget</span><b>${fmtPop(p.urbanSupport)}</b><span>Local majority tradition</span><b>${esc(FAITHS[cDominant(p.faith)].name)}</b></div><h3>People & traditions</h3>${mixtureHTML(p.people, PEOPLES)}<h3>Landmarks</h3><div class="city-landmark-list">${layout.buildings.filter(b => b.landmark).map(b => `<button data-landmark="${b.id}">${esc(b.name)} ↗</button>`).join('')}</div><p class="city-note">Every rendered house is a representative building, not one household. Street patterns and names are procedural detail; demographic totals and resources come from the parent simulation.</p>`;
        if (b && ['civic','temple','academy','harbor'].includes(b.type)) {
            const card=el.querySelector('.building-card'), enter=document.createElement('button');
            enter.className='city-monument-prompt'; enter.id='openBuildingMonument'; enter.textContent=b.highRole?'Focus this building →':'Enter architectural model →';
            enter.onclick=()=>window.LandmarkUI?.openBuilding(activeId,b); card.appendChild(enter);
        }
        el.querySelectorAll('[data-landmark]').forEach(btn => {
            const b=layout.buildings.find(b=>b.id===btn.dataset.landmark);
            if (['civic','temple','academy','harbor'].includes(b.type)) {
                btn.textContent=b.name+(b.highRole?' · Focus →':' · Explore 3D →');
                btn.onclick=()=>window.LandmarkUI?.openBuilding(activeId,b);
            } else btn.onclick=()=>{select(b);cr.focusBuilding(b)};
        });
    }
    function makeLabels() {
        if (!cr || !layout)
            return;
        E('cityLabels').innerHTML = '';
        labelNodes = [];
        for (const b of layout.buildings.filter(b => b.landmark)) {
            const button = document.createElement('button');
            button.className = 'city-label';
            button.textContent = b.name;
            button.onclick = () => { select(b); cr.focusBuilding(b); };
            button.ondblclick = () => window.LandmarkUI?.openBuilding(activeId,b);
            E('cityLabels').appendChild(button);
            labelNodes.push({ button, b });
        }
        positionLabels();
    }
    function positionLabels() {
        if (!layout || !cr || !E('cityDialog').open)
            return;
        E('cityLabels').classList.toggle('hidden', !E('cityNames').checked);
        const boxes = [];
        for (const { button, b } of labelNodes) {
            const [x, y] = cr.screen(b.x, b.z, (cr.landmarkHeights?.[b.id] || b.h) + 2), rect = { x: x - 70, y: y - 20, w: 140, h: 23 };
            const hidden = x < 70 || x > cr.width - 60 || y < 65 || y > cr.height - 20 || boxes.some(a => a.x < rect.x + rect.w && a.x + a.w > rect.x && a.y < rect.y + rect.h && a.y + a.h > rect.y);
            button.style.display = hidden ? 'none' : 'block';
            button.style.left = x + 'px';
            button.style.top = y + 'px';
            if (!hidden)
                boxes.push(rect);
        }
    }
    function bindCamera() {
        const canvas = E('cityCanvas');
        let drag = null, pointers = new Map(), pinch = null;
        canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, rotate: e.shiftKey || e.button === 2, moved: 0 }; if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cr.zoom };
        } E('cityTooltip').classList.add('hidden'); });
        canvas.addEventListener('pointermove', e => {
            if (pointers.has(e.pointerId))
                pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 2 && pinch) {
                const [a, b] = [...pointers.values()];
                cr.zoom = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d), .42, 7);
                cr.request();
                return;
            }
            if (drag) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
                if (drag.rotate) {
                    cr.azimuth -= dx * .007;
                    cr.elevation = clamp(cr.elevation + dy * .005, .48, 1.55);
                    cr.request();
                }
                else
                    cr.pan(dx, dy);
                drag.x = e.clientX;
                drag.y = e.clientY;
                return;
            }
            const rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, b = cr.pick(x, y), tip = E('cityTooltip');
            tip.classList.toggle('hidden', !b);
            if (b) {
                tip.textContent = b.name;
                tip.style.left = clamp(x + 15, 0, cr.width - 220) + 'px';
                tip.style.top = (y + 12) + 'px';
            }
        });
        canvas.addEventListener('pointerup', e => { pointers.delete(e.pointerId); if (drag && drag.moved < 4 && !pinch) {
            const rect = canvas.getBoundingClientRect(), b = cr.pick(e.clientX - rect.left, e.clientY - rect.top);
            if (b)
                select(b);
        } if (!pointers.size) {
            drag = null;
            pinch = null;
        } });
        canvas.addEventListener('pointercancel', () => { drag = null; pointers.clear(); pinch = null; });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('wheel', e => { e.preventDefault(); cr.zoom = clamp(cr.zoom * Math.exp(-e.deltaY * .0011), .42, 7); cr.request(); }, { passive: false });
        canvas.addEventListener('dblclick', e => { const rect = canvas.getBoundingClientRect(), b = cr.pick(e.clientX - rect.left, e.clientY - rect.top); if (b) {
            select(b);
            cr.focusBuilding(b);
        } });
        canvas.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-'].includes(e.key)) {
            e.preventDefault();
            if (e.key === '+')
                cr.zoom = clamp(cr.zoom * 1.15, .42, 7);
            else if (e.key === '-')
                cr.zoom = clamp(cr.zoom / 1.15, .42, 7);
            else
                cr.pan(e.key === 'ArrowLeft' ? 25 : e.key === 'ArrowRight' ? -25 : 0, e.key === 'ArrowUp' ? 25 : e.key === 'ArrowDown' ? -25 : 0);
            cr.request();
        } });
    }
    async function image() { if (!cr || !layout)
        return; cr.render(); const c = E('cityCanvas'); c.toBlob(b => { if (b)
        saveBlob(b, `${layout.name.replace(/[^\w-]/g, '-')}-city-${sim.year}.png`); }, 'image/png'); }
    function init() {
        const toolbar = document.createElement('div');
        toolbar.className = 'explore-strip';
        toolbar.innerHTML = '<span class="overline">EXPLORE A WHOLE TOWN</span><select id="cityPicker" aria-label="Choose a settlement"></select><button id="visitCity" class="visit">Enter city ↗</button><button id="visitCoast">Coastal</button><button id="visitLake">Lakeshore</button><span class="hint">Double-click a town on the map · zoom into individual buildings</span>';
        E('stage').before(toolbar);
        const offer = document.createElement('button');
        offer.id = 'cityOffer';
        offer.className = 'city-offer hidden';
        E('stage').appendChild(offer);
        E('visitCity').onclick = () => open(+E('cityPicker').value);
        E('visitCoast').onclick = () => { const p = sim?.provinces.filter(p => p.city).sort((a, b) => b.harbor - a.harbor)[0]; if (p)
            open(p.id); };
        E('visitLake').onclick = () => { const p = sim?.provinces.filter(p => p.city).sort((a, b) => b.siteLake - a.siteLake)[0]; if (p)
            open(p.id); };
        E('map').addEventListener('dblclick', e => {
            if (busy || !sim)
                return;
            const rect = E('map').getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top;
            let nearest = null, dist = 24;
            for (const p of sim.provinces) {
                if (!p.settled)
                    continue;
                const [x, y] = renderer.screen(p.x, p.y, .8), d = Math.hypot(x - sx, y - sy);
                if (d < dist) {
                    dist = d;
                    nearest = p;
                }
            }
            if (nearest)
                open(nearest.id);
            else {
                const i = renderer.pick(sx, sy), p = sim.provinces[world.provinceId[i]];
                if (p?.settled)
                    open(p.id);
                else
                    toast('Zoom toward a town marker, or use Find a place.');
            }
        });
        E('labels').addEventListener('dblclick', e => {
            const button = e.target.closest('.maplabel');
            const item = labelItems.find(item => item.element === button);
            const province = item && sim?.provinces[world.provinceId[item.feature.i]];
            if (province?.settled) { e.preventDefault(); open(province.id); }
        });
        E('cityBack').onclick = close;
        E('cityDialog').addEventListener('cancel', e => { e.preventDefault(); close(); });
        E('cityStep1').onclick = () => advance(1);
        E('cityStep10').onclick = () => advance(10);
        document.querySelectorAll('[data-city-tab]').forEach(b => b.onclick = () => { tab = b.dataset.cityTab; render(); });
        document.querySelectorAll('[data-city-mode]').forEach(b => b.onclick = () => { cr.mode = b.dataset.cityMode; const p = sim.provinces[activeId]; cr.setCity(layout, p, sim.realms[p.owner], sim.cityState?.[p.id] || {}); render(); });
        E('cityNames').onchange = positionLabels;
        E('townRoofs').onchange=()=>{cr.showRoofs=E('townRoofs').checked;cr.dirtyShadow=true;cr.request()};
        E('cityContext').onchange=()=>{cr.showContext=E('cityContext').checked;cr.dirtyShadow=true;cr.request()};
        E('citySetting').onclick=()=>{E('cityContext').checked=true;cr.frameSetting()};
        E('townTrees').onchange=()=>{cr.showTrees=E('townTrees').checked;cr.dirtyShadow=true;cr.request()};
        E('cityCamera').onchange = () => { cr.elevation = { relief: .98, overhead: 1.55, low: .55 }[E('cityCamera').value]; cr.request(); };
        E('cityReset').onclick = () => cr.reset();
        E('cityZoomIn').onclick = () => { cr.zoom = clamp(cr.zoom * 1.25, .42, 7); cr.request(); };
        E('cityZoomOut').onclick = () => { cr.zoom = clamp(cr.zoom / 1.25, .42, 7); cr.request(); };
        E('citySavePNG').onclick = image;
        E('citySaveGame').onclick = saveSimulation;
        E('citySavePlan').onclick = () => { const data = { format: 'telluric-city-plan', version: 1, source: layout.source, fingerprint: layout.fingerprint, provinceId: activeId, year: sim.year, city: layout, state: sim.cityState?.[activeId] || {}, note: 'One representative building can stand for many residents.' }; saveBlob(new Blob([JSON.stringify(data, (_k, v) => ArrayBuffer.isView(v) ? Array.from(v) : typeof v === 'function' ? undefined : v, 2)], { type: 'application/json' }), `orbis-city-${activeId}.json`); };
        E('citySaveGLB').onclick = () => saveBlob(new Blob([exportGeometryGLB(cr.meshes, { city: layout.name, fingerprint: layout.fingerprint, note: 'Schematic city coordinates. Re-light the scene in your 3D editor.' })], { type: 'model/gltf-binary' }), `orbis-city-${activeId}.glb`);
        E('cityCanvas').addEventListener('webglcontextlost', e => { e.preventDefault(); toast('City graphics context lost. Save the world and reload.'); });
    }
    return { init, open, close, recompose, onWorldUpdate, offerCity, getLayout, get activeId() { return activeId; }, get layout() { return layout; }, get renderer() { return cr; }, setTab(value) { tab = value; render(); }, selectBuilding(id) { const b = layout?.buildings.find(b => b.id === id); if (b)
            select(b); }, audit: () => layout ? auditCity(layout) : null };
})();
