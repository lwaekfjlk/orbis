/** Minimal map chrome and simulation controls.
 * ContinuousMap delegates all town/building exploration to the original atlas
 * canvas. Legacy local-editor hooks remain for code compatibility, not navigation.
 */
window.OneMap = (() => {
    const E = id => document.getElementById(id);
    const menus = {search:'omSearchPanel', layers:'omLayersPanel', more:'omMorePanel'};
    let scene = 'world', menu = null, drawer = null, selection = null, initialized = false;
    let lastWorld = null, lastEvent = null, searchIndex = [], originalFocus = null, transitioning = false;
    const esc = value => escapeHTML(value);
    const activeRenderer = () => scene === 'landmark' ? LandmarkUI.renderer : scene === 'city' ? CityUI.renderer : renderer;
    const interactive = () => !busy && !simAdvancing && !transitioning && !!sim;
    const show = (id, yes) => E(id)?.classList.toggle('hidden', !yes);
    const announce = text => { E('omLive').textContent = text; };

    function init() {
        if (initialized) return;
        initialized = true;
        // Move live editor nodes into the one optional drawer, preserving handlers.
        const lm = document.querySelector('#landmarkDialog .lm-inspector');
        if (lm) E('omLandmarkDetail').appendChild(lm);
        const legend = E('legend');
        if (legend) E('omLayerLegend').appendChild(legend);
        E('map').tabIndex = 0;
        const labels={assembly:'Design',dossier:'Details',projects:'Build',journey:'Travel'};
        document.querySelectorAll('[data-city-tab]').forEach(b=>b.textContent=labels[b.dataset.cityTab]||b.textContent);
        setScene('world');
    }

    function bind() {
        for (const key of Object.keys(menus)) {
            E(`om${key[0].toUpperCase()+key.slice(1)}Toggle`).onclick=()=>toggleMenu(key);
        }
        E('omDrawerClose').onclick=()=>closeDrawer(true);
        E('omSelectionClose').onclick=clearSelection;
        E('omEvent').onclick=()=>openDrawer('history');
        E('omSearch').oninput=renderSearch;
        E('omSearch').addEventListener('keydown',e=>{
            if(e.key==='ArrowDown'){e.preventDefault();E('omSearchResults').querySelector('button')?.focus();}
            if(e.key==='Enter'){e.preventDefault();E('omSearchResults').querySelector('button')?.click();}
        });
        E('omHome').onclick=home;
        E('omBack').onclick=back;
        E('omZoomIn').onclick=()=>zoom(1.25);
        E('omZoomOut').onclick=()=>zoom(1/1.25);
        E('omFit').onclick=()=>{if(!interactive())return;const r=activeRenderer();r?.reset();if(scene==='world'){focusedContinent=null;legend();}clearSelection();};
        E('forgeButton').onclick=openRegenerate;
        E('closeForge').onclick=()=>closeRegenerate(true);
        E('omRandomSeed').onclick=()=>{E('seed').value=freshSeed();};
        E('omSaveBeforeGenerate').onclick=()=>{if(interactive())saveSimulation();};
        E('generate').onclick=async()=>{
            if(!interactive())return;
            const f=readForge();
            closeRegenerate();closeDrawer();closeMenus();clearSelection();
            const result = await buildWorld(f.params,f.options);
            if (result) {
                const note = result.realms
                    ? `World ready · ${result.realms} realms · ${result.towns} towns · Year ${result.year}.`
                    : result.settlements
                        ? `World ready · ${result.settlements} settlements. No states formed under these conditions.`
                        : 'World ready · No concentrated settlements formed under these conditions. Try different world settings.';
                toast(note); announce(note);
            } else announce('World generation failed. The previous world was kept when available.');
            E('map').focus({preventScroll:true});
        };
        E('forge').addEventListener('keydown',e=>{
            if(e.key==='Enter'&&e.target.id==='seed'){e.preventDefault();E('generate').click();}
        });
        E('closeNotes').onclick=()=>{E('notes').close();E('omMoreToggle').focus();};
        document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));
        E('omLayersPanel').addEventListener('click',e=>{
            const b=e.target.closest('[data-layer]');
            if(b){closeMenus();onWorldUpdate();}
        });
        E('moreLayer').addEventListener('change',()=>{closeMenus();onWorldUpdate();});
        document.querySelectorAll('[data-local-mode]').forEach(b=>b.onclick=()=>{
            if(scene!=='city'||!CityUI.renderer)return;
            document.querySelector(`[data-city-mode="${b.dataset.localMode}"]`)?.click();
            localControls();closeMenus();
        });
        E('omSetting').onclick=()=>{E('citySetting').click();closeMenus();};
        for(const [id,source] of [['omLocalRoofs','townRoofs'],['omLocalTrees','townTrees'],['omMonumentRoofs','lmRoofs'],['omMonumentExplode','lmExplode']]){
            E(id).onchange=()=>{E(source).checked=E(id).checked;E(source).dispatchEvent(new Event('change'));};
        }
        E('omLocalCamera').onchange=()=>{
            if(scene==='city'){E('cityCamera').value={relief:'relief',overhead:'overhead',low:'low'}[E('omLocalCamera').value];E('cityCamera').dispatchEvent(new Event('change'));}
            if(scene==='landmark'){E('lmCamera').value={relief:'perspective',overhead:'plan',low:'front'}[E('omLocalCamera').value];E('lmCamera').dispatchEvent(new Event('change'));}
        };
        // Menus never take ownership of map drag/zoom. Dismiss them on the next map action.
        for(const id of ['map','cityCanvas','lmCanvas']) E(id)?.addEventListener('pointerdown',()=>{closeMenus();closeRegenerate();});
        document.addEventListener('pointerdown',e=>{
            if(e.target.closest('.om-popover,.om-tools,.om-forge,#forgeButton,#notes'))return;
            closeMenus();
        });
        // Capture first: legacy world shortcuts must not also act on a local scene.
        document.addEventListener('keydown',keyboard,true);
        window.addEventListener('resize',()=>{requestAnimationFrame(()=>activeRenderer()?.request());});
        onPlayback();
    }

    function freshSeed(){
        const bytes=new Uint32Array(2);crypto.getRandomValues(bytes);
        return `World-${bytes[0].toString(36)}-${bytes[1].toString(36).slice(0,4)}`;
    }
    function closeMenus(){
        for(const [key,id] of Object.entries(menus)){show(id,false);E(`om${key[0].toUpperCase()+key.slice(1)}Toggle`)?.setAttribute('aria-expanded','false');}
        menu=null;
    }
    function toggleMenu(which){
        if(!interactive())return;
        const already=menu===which;closeMenus();closeDrawer();closeRegenerate();
        if(already)return;
        originalFocus=document.activeElement;menu=which;show(menus[which],true);
        E(`om${which[0].toUpperCase()+which.slice(1)}Toggle`).setAttribute('aria-expanded','true');
        if(which==='search'){renderSearch();E('omSearch').focus();}
        if(which==='layers')localControls();
    }
    function closeRegenerate(focus=false){
        if(E('forge').open)E('forge').close();
        if(focus)E('forgeButton').focus();
    }
    function openRegenerate(){
        if(!interactive())return;
        if(E('forge').open){closeRegenerate(true);return;}
        pause();closeMenus();closeDrawer();
        E('seed').value=freshSeed();
        E('historySeed').value=sim.options.historySeed||'First-dawn';
        const fields={plateInput:'plates',continentInput:'continents',islandInput:'islands',volcanoInput:'volcanism',temperatureInput:'temperature',aridityInput:'aridity'};
        for(const[id,key]of Object.entries(fields))E(id).value=world.params[key]??GEN_DEFAULTS[key];
        E('realmInput').value=sim.options.realms??18;E('conflictInput').value=sim.options.conflict??1;
        forgeOutputs();E('forge').show();E('seed').focus();E('seed').select();
    }
    function closeDrawer(focus=false){
        show('omDrawer',false);drawer=null;
        if(focus)(originalFocus?.isConnected?originalFocus:activeRenderer()?.canvas)?.focus({preventScroll:true});
    }
    function openDrawer(kind='detail'){
        if(!interactive())return;
        originalFocus=document.activeElement;closeMenus();closeRegenerate();
        drawer=kind;show('omDrawer',true);
        show('omDetails',kind==='detail');show('omHistory',kind==='history');show('omRealms',kind==='realms');
        E('omDrawerKicker').textContent=kind==='history'?'THE CHRONICLE':kind==='realms'?'CROWNS & COMMUNITIES':'SELECTED PLACE';
        E('omDrawerTitle').textContent=kind==='history'?`Year ${sim.year}`:kind==='realms'?'Realms':scene==='city'?CityUI.layout?.name||'Town':scene==='landmark'?LandmarkUI.recipe?.name||'Landmark':'Field notes';
        show('omWorldDetail',scene==='world');show('omCityDetail',scene==='city');show('omLandmarkDetail',scene==='landmark');
        E('omDrawerClose').focus({preventScroll:true});
    }
    function setScene(value){
        const changed=scene!==value;scene=value;document.body.dataset.scene=value;
        if(changed){closeMenus();closeDrawer();closeRegenerate();clearSelection();}
        show('omBack',value!=='world');
        E('omBack').title=value==='landmark'&&CityUI.activeId!==null?'Return to town':'Return to world';
        let title='The Manyfold World',sub=sim?`WORLD ATLAS · ${sim.realms.filter(c=>c.alive).length} REALMS · ${sim.provinces.filter(p=>p.city).length} TOWNS`:'WORLD ATLAS';
        if(value==='city'){
            title=CityUI.layout?.name||'Town';
            const p=sim?.provinces[CityUI.activeId];
            sub=p?`${sim.realms[p.owner]?.name||'FREE COMMUNITIES'} / TOWN`:'TOWN';
        }
        if(value==='landmark'){title=LandmarkUI.recipe?.name||'Landmark';sub='ARCHITECTURAL DETAIL';}
        E('omPlaceName').textContent=title;E('omPlaceName').title=title;E('omSceneLabel').textContent=sub;
        E('omHint').textContent=value==='landmark'?'DRAG TO ORBIT · SCROLL TO APPROACH · CLICK A PART':value==='city'?'DRAG TO EXPLORE · SHIFT-DRAG TO ORBIT · CLICK A BUILDING':'DRAG TO EXPLORE · SCROLL TO APPROACH · DOUBLE-CLICK A TOWN';
        localControls();
        // Resize only the newly active scene. The world camera itself is never reset on Back.
        if(changed)requestAnimationFrame(()=>{activeRenderer()?.resize();activeRenderer()?.request();});
    }
    function back(){
        if(!interactive())return;
        if(drawer||menu||E('forge').open){closeDrawer();closeMenus();closeRegenerate();return;}
        if(scene==='landmark')LandmarkUI.close();
        else if(scene==='city')CityUI.close();
        else clearSelection();
        activeRenderer()?.canvas.focus({preventScroll:true});
    }
    function home(){
        if(window.ContinuousMap?.active)return ContinuousMap.home();
        if(!interactive())return;
        LandmarkUI.close();CityUI.close();setScene('world');clearSelection();closeDrawer();closeMenus();
        focusedContinent=null;renderer.reset();renderer.canvas.focus({preventScroll:true});
    }
    function zoom(factor){
        if(window.ContinuousMap?.active)return ContinuousMap.zoomBy(factor);
        if(!interactive())return;
        const r=activeRenderer();if(!r)return;
        const [lo,hi]=scene==='world'?[.6,6]:scene==='city'?[.42,7]:[.45,5];
        r.zoom=clamp(r.zoom*factor,lo,hi);r.request();
    }
    function localControls(){
        if(!E('omWorldLayers'))return;
        show('omWorldLayers',scene==='world');show('omLocalLayers',scene!=='world');show('omLayerLegend',scene==='world');
        show('omCityViews',scene==='city');show('omLandmarkViews',scene==='landmark');
        if(scene==='city'){
            E('omLocalRoofs').checked=E('townRoofs').checked;E('omLocalTrees').checked=E('townTrees').checked;E('omLocalCamera').value=E('cityCamera').value==='overhead'?'overhead':E('cityCamera').value==='low'?'low':'relief';
            document.querySelectorAll('[data-local-mode]').forEach(b=>b.classList.toggle('active',b.dataset.localMode===CityUI.renderer?.mode));
        }
        if(scene==='landmark'){E('omMonumentRoofs').checked=E('lmRoofs').checked;E('omMonumentExplode').checked=E('lmExplode').checked;E('omLocalCamera').value=E('lmCamera').value==='plan'?'overhead':E('lmCamera').value==='front'?'low':'relief';}
    }
    function clearSelection(){selection=null;show('omSelection',false);}
    function selectionCard(kicker,title,text,buttons){
        E('omSelectionBody').innerHTML=`<small class="om-eyebrow">${esc(kicker)}</small><h3>${esc(title)}</h3><p>${esc(text)}</p><div class="om-actions">${buttons.map((b,i)=>`<button data-selection-action="${i}" class="${b.primary?'main':''}">${esc(b.label)}</button>`).join('')}</div>`;
        E('omSelectionBody').querySelectorAll('[data-selection-action]').forEach(b=>b.onclick=buttons[+b.dataset.selectionAction].run);
        show('omSelection',true);
    }
    function inspectWorld(i){
        if(!world||!sim||busy||scene!=='world'||i<0)return;
        const p=sim.provinces[world.provinceId[i]],f=(world.legends||[]).find(f=>f.i===i)||world.features.find(f=>f.i===i),b=world.basins?.[world.lakeId?.[i]],realm=p&&sim.realms[p.owner];
        if(world.height[i]<=0&&!f&&!b){clearSelection();return;}
        selection={kind:'world',i};
        const title=p?.settled?p.name:f?.name||b?.name||BIOME[world.biome[i]][0];
        const subtitle=f?.legend?f.text:[BIOME[world.biome[i]][0],`${world.temp[i].toFixed(1)} °C`,p?.settled?`${fmtPop(p.urbanPop)} town residents`:null].filter(Boolean).join(' · ');
        const buttons=[];
        if(p?.settled)buttons.push({label:'Zoom to town',primary:true,run:()=>enterTown(p.id)});
        buttons.push({label:'Details',run:()=>openDrawer('detail')});
        selectionCard(f?.legend?'LEGENDARY PLACE · '+f.kind:realm?.name||'NATURAL WORLD',title,subtitle,buttons);
    }
    function inspectBuilding(b){
        if(scene!=='city'||!b)return;selection={kind:'building',id:b.id};
        const buttons=[{label:'Details',run:()=>openDrawer('detail')}];
        if(['civic','temple','academy','harbor'].includes(b.type))buttons.unshift({label:'Explore landmark ↗',primary:true,run:()=>enterBuilding(b)});
        selectionCard(CityUI.layout?.name||'TOWN',b.name,CITY_TYPES[b.type]?.description||'A module in this town.',buttons);
    }
    function inspectPart(p){
        if(scene!=='landmark'||!p)return;selection={kind:'part',id:p.id};
        selectionCard(p.role||'ARCHITECTURAL PART',p.name,p.note||'Assembled from reusable building modules.',[{label:'Focus',primary:true,run:()=>LandmarkUI.renderer.focusPart(p.id)},{label:'Details',run:()=>openDrawer('detail')}]);
    }
    async function transition(action){
        if(!interactive())return;
        transitioning=true;pause();closeMenus();closeDrawer();show('omSceneLoading',true);onPlayback();
        await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,25)));
        try{action();}catch(e){console.error(e);toast(e.message);}finally{show('omSceneLoading',false);transitioning=false;onPlayback();}
    }
    function enterTown(id){if(window.ContinuousMap?.active)return ContinuousMap.focusTown(id);return transition(()=>CityUI.open(id));}
    function enterBuilding(b){return transition(()=>LandmarkUI.openBuilding(CityUI.activeId,b));}
    function renderSearch(){
        if(!sim)return;
        const q=E('omSearch').value.trim().toLowerCase();
        const results=(q?searchIndex.filter(s=>(s.name+' '+s.subtitle).toLowerCase().includes(q)):searchIndex.filter(s=>s.type==='town')).slice(0,9);
        E('omSearchResults').innerHTML=results.length?results.map((s,k)=>`<div class="om-result"><button data-search-hit="${k}" aria-label="Locate ${esc(s.name)}"><b>${esc(s.name)}</b><small>${esc(s.subtitle)}</small></button>${s.type==='town'||s.type==='site'?`<button class="om-enter" data-search-enter="${k}" aria-label="Approach ${esc(s.name)}">Zoom ↗</button>`:''}</div>`).join(''):'<p class="om-note">No matching place in this world.</p>';
        E('omSearchResults').querySelectorAll('[data-search-hit]').forEach(b=>b.onclick=()=>locate(results[+b.dataset.searchHit]));
        E('omSearchResults').querySelectorAll('[data-search-enter]').forEach(b=>b.onclick=()=>{const s=results[+b.dataset.searchEnter];if(s.type==='town')enterTown(s.id);else if(window.ContinuousMap?.active)ContinuousMap.focusSite(s.id);else transition(()=>LandmarkUI.openSite(s.id));});
    }
    function locate(item){
        if(!interactive()||!item)return;
        LandmarkUI.close();CityUI.close();setScene('world');closeMenus();closeDrawer();
        if(item.type==='continent'){focusContinent(item.id);return;}
        renderer.focus(item.x,item.y);renderer.zoom=3.2;
        if(item.type==='realm')selectRealm(item.id);else inspectCell(item.i);
        renderer.request();E('map').focus({preventScroll:true});
    }
    function onWorldUpdate(){
        if(!sim||!world)return;
        if(lastWorld!==world){lastWorld=world;clearSelection();closeMenus();closeDrawer();lastEvent=null;}
        const towns=sim.provinces.filter(p=>p.settled).sort((a,b)=>b.urbanPop-a.urbanPop);
        searchIndex=[...towns.map(p=>({type:'town',id:p.id,i:p.i,x:p.x,y:p.y,name:p.name,subtitle:`${TownCatalog.native(p,world)==='basilica'?'Grand sanctuary · ':''}${p.settlementType} · ${sim.realms[p.owner]?.name||'Free communities'}`})),...world.continents.map(c=>({...c,type:'continent',subtitle:'Continent'})),...sim.realms.filter(c=>c.alive).map(c=>{const p=sim.provinces[c.capital];return{type:'realm',id:c.id,i:p.i,x:p.x,y:p.y,name:c.title,subtitle:'Realm · '+fmtPop(c.population)+' residents'};}),...LandmarkUI.registry.map(s=>({...s,type:'site',subtitle:'3D landmark'})),...world.features.map(f=>({...f,type:'feature',subtitle:f.kind||'Landscape'})),...(world.legends||[]).map(f=>({...f,type:'feature',subtitle:'Legendary place · '+f.kind}))];
        const latest=sim.events.slice().reverse().find(e=>e.type!=='founding'&&e.year>400);
        show('omEvent',!!latest&&sim.year>400);
        if(latest){E('omEventText').textContent=`${latest.year} · ${latest.text}`;if(latest!==lastEvent)lastEvent=latest;}
        if(drawer==='history')E('omDrawerTitle').textContent=`Year ${sim.year}`;
        if(selection?.kind==='world')inspectWorld(selection.i);
        if(menu==='search')renderSearch();
        E('omHome').title=`World seed: ${world.params.seed} · Whole world`;
        setScene(scene);onPlayback();
    }
    function onPlayback(){
        if(!E('play'))return;
        const blocked=busy||simAdvancing||transitioning;
        E('play').setAttribute('aria-pressed',String(playing));E('play').setAttribute('aria-label',playing?'Pause simulation':'Play simulation');
        E('play').textContent=playing?'Ⅱ Pause':'▶ Play';
        for(const id of ['play','step1','step10','step50','forgeButton'])E(id).disabled=blocked||!sim;
        E('forgeButton').textContent=busy?'Generating…':simAdvancing?'Advancing…':'↻ Regenerate';
        E('omYearHost').title=simAdvancing?'Advancing history':playing?'History is running':'Simulation paused';
    }
    function onBusy(value){document.body.dataset.working=String(value);if(value){closeMenus();closeDrawer();clearSelection();}onPlayback();}
    function onAdvancing(value){onPlayback();if(!value&&sim)announce(`Year ${sim.year}. ${playing?'Simulation running.':'Simulation paused.'}`);}
    async function command(action){
        if(!interactive())return;closeMenus();
        if(action==='sanctuary'){const place=LandmarkUI.registry.find(r=>r.recipe.sacred);if(place)enterTown(place.provinceId);else toast('No town in this world currently has a buildable grand-sanctuary precinct. Other cities remain available.');return;}
        if(action==='history'||action==='realms'){openDrawer(action);return;}
        if(action==='details'){openDrawer('detail');return;}
        if(action==='save'){saveSimulation();return;}
        if(action==='load'){pause();E('importFile').value='';E('importFile').click();return;}
        if(action==='image'){if(scene==='city')E('citySavePNG').click();else if(scene==='landmark')E('lmSavePNG').click();else savePNG();return;}
        if(action==='model'){if(scene==='city')E('citySaveGLB').click();else if(scene==='landmark')E('lmExportGLB').click();else E('saveGLB').click();return;}
        if(action==='reset'){
            pause();
            if(confirm('Restart at year 400 on the same landscape? This replaces the current history. Save first to keep it.')){LandmarkUI.close();CityUI.close();resetHistory();clearSelection();}
            return;
        }
        if(action==='notes'){pause();E('notes').showModal();}
    }
    function keyboard(e){
        if(e.key==='Escape'){
            if(E('notes').open)return;
            e.preventDefault();e.stopImmediatePropagation();
            if(E('forge').open){closeRegenerate(true);return;}
            if(menu){const m=menu;closeMenus();E(`om${m[0].toUpperCase()+m.slice(1)}Toggle`).focus();return;}
            if(drawer){closeDrawer(true);return;}
            if(selection){clearSelection();return;}
            back();return;
        }
        if(e.target.closest('input,select,textarea,[contenteditable=true]')||E('notes').open)return;
        if(e.key==='/'){e.preventDefault();e.stopImmediatePropagation();toggleMenu('search');return;}
        if(e.code==='Space'&&!e.target.closest('button,summary')){e.preventDefault();e.stopImmediatePropagation();if(interactive())togglePlay();return;}
        if(['+','=','-'].includes(e.key)&&!e.target.closest('button')){e.preventDefault();e.stopImmediatePropagation();zoom(e.key==='-'?1/1.2:1.2);}
        if(e.key.toLowerCase()==='h'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();home();}
    }
    return {init,bind,setScene,inspectWorld,inspectBuilding,inspectPart,onWorldUpdate,onPlayback,onBusy,onAdvancing,enterTown,openDrawer,closeDrawer,openRegenerate,home,back,locate,clearSelection,get scene(){return scene;},get panel(){return drawer;},get activeRenderer(){return activeRenderer();}};
})();
