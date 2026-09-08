/** Camera-only exploration: towns and buildings never replace the world canvas. */
window.ContinuousMap = (() => {
 const E=id=>document.getElementById(id);let layer=null,ruins=null,enabled=false,animation=0,lastCamera='',lastWorld=null,selection=null,pins=[],lastPins='',shadowCenter='',moving=false;
 const ready=()=>enabled&&world&&sim&&!busy&&!simAdvancing;
 /* WALKING FIGURES.
  * A frame with a moving crowd costs a mesh rebuild plus a full redraw. That is cheap on
  * WebGL2 and expensive on the Canvas software rasterizer, which re-rasterizes the whole
  * town every frame, so there the crowd is built once and holds position instead. The
  * same applies when the reader has asked the system for reduced motion: the streets are
  * still populated, nobody walks. Nothing about the simulation depends on this clock.
  */
 const reducedMotion=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 let clock=0,lastTick=0,walking=false,staticTimer=0;
 const animating=()=>ready()&&renderer.options.folk!==false&&renderer.zoom>=AtlasSpace.TOWN_ZOOM&&!renderer.software&&!reducedMotion()&&document.visibilityState!=='hidden';
 function startFolk(){if(walking||!animating())return;walking=true;lastTick=performance.now();requestAnimationFrame(tickFolk);}
 function tickFolk(now){
  if(!animating()){walking=false;return;}
  // ~24fps. A walking crowd does not read any better at 60, and the spare frames belong
  // to panning and to town meshes still streaming in.
  if(now-lastTick>=40){clock+=Math.min(.25,(now-lastTick)/1000);lastTick=now;renderer.buildFolk(clock);renderer.request();}
  requestAnimationFrame(tickFolk);
 }
 // A still crowd still has to be re-culled when the camera moves, but rebuilding it
 // inline would force a second full redraw per pan step — which is exactly the cost the
 // software path was spared the ticker to avoid. Settle first, like the town streamer.
 function restFolk(){if(walking||!renderer.buildFolk)return;clearTimeout(staticTimer);staticTimer=setTimeout(()=>{if(!walking&&ready()){renderer.buildFolk(clock);renderer.request();}},150);}
 function init(){if(enabled||!renderer)return;enabled=true;document.body.classList.add('continuous-map');
  layer=new ContinuousCityLayer(renderer);ruins=new ContinuousRuinLayer(renderer,layer);renderer.continuousLayer=layer;renderer.continuousModels=layer.models;renderer.continuousRoofs=true;
  renderer.ground=function(x,y){return this.world?layer.ground(x,y):0;};
  renderer.buildTerrain=function(){return layer.buildTerrain();};
  installDepthRasterizer(renderer);renderer.renderQuality=1;renderer.backgroundColor=rgb('#79999d');renderer.lightVP=mul4(ortho(-115,115,-90,90,1,420),lookAt([-110,170,-82],[0,0,0],[0,1,0]));
  const visible=renderer.visible;renderer.visible=function(name){const site=ruins.visible(name);if(site!==null)return site;const v=layer.visible(name);return v===null?visible.call(this,name):v;};
  const prior=renderer.onChange;renderer.onChange=()=>{onCamera();prior();};
  const el=document.createElement('div');el.id='cmLabels';E('stage').appendChild(el);
  const note=document.createElement('div');note.id='cmStatus';note.setAttribute('role','status');E('omChrome').appendChild(note);
  const btn=document.createElement('button');btn.id='cmContext';btn.className='cm-context glass';btn.textContent='Wider setting';btn.title='Pull back in the same map';btn.onclick=wider;E('omChrome').appendChild(btn);
  layer.onChange=()=>{window.__continuous=layer.report();renderer.buildNearRoads?.();renderer.buildFolk?.(clock);updateTitle();makePins();positionPins();};
  ruins.onChange=()=>{window.__ruins=ruins.report();refreshRuinSelection();updateTitle();};
  bindCamera();
  E('omFit').onclick=()=>ready()&&home();E('omHome').onclick=()=>ready()&&home();
  E('camera').onchange=()=>{if(!ready())return;cancel();renderer.elevation={relief:1.19,overhead:1.555,diorama:.65}[E('camera').value];renderer.request();};
  E('resetView').onclick=home;E('zoomIn').onclick=()=>zoomBy(1.25);E('zoomOut').onclick=()=>zoomBy(.8);
  E('cmLabels').addEventListener('pointerdown',e=>e.stopPropagation());
  const more=E('omWorldLayers');const roofs=document.createElement('label');roofs.className='om-check';roofs.innerHTML='<input type="checkbox" id="cmRoofs" checked>Building roofs';more.appendChild(roofs);E('cmRoofs').onchange=()=>{renderer.continuousRoofs=E('cmRoofs').checked;renderer.dirtyShadow=true;renderer.request();};
  // A backgrounded tab must not keep rebuilding a crowd nobody is looking at.
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')startFolk();});
 }
 function beforeWorldBuild(){cancel();ruins?.reset();window.__ruinReady=false;window.__ruinFocus=null;if(layer)layer.reset(null,null);lastWorld=null;lastCamera='';selection=null;lastPins='';clock=0;walking=false;clearTimeout(staticTimer);E('cmLabels')?.replaceChildren();}
 function onWorldUpdate(){if(!enabled||!world||!sim)return;layer.bind(world,sim);ruins.bind(world,sim,LandmarkUI.registry.filter(s=>s.dragonRuins));if(lastWorld!==world){lastWorld=world;selection=null;shadowCenter='';lastPins='';}
  makePins();updateTitle();renderer.request();layer.cameraChanged();ruins.cameraChanged();if(selection&&OneMap.panel==='detail'){if(selection.ruin)ruinDetails(selection.model,selection.part,false);else details(selection.model,selection.building,false);}
 }
 function refreshRuinSelection(){
  if(!selection?.ruin)return;const current=ruins.models.get(selection.model.id);
  if(current&&current!==selection.model){const part=selection.part?current.parts.find(p=>p.id===selection.part.id)||null:null;if(E('omSelection').classList.contains('hidden'))selection={ruin:true,model:current,part};else selectRuin({model:current,part});}
  if(OneMap.panel==='detail')ruinDetails(selection.model,selection.part,false);
 }
 function updateTitle(){if(!enabled||!world||!sim)return;const r=renderer,a=AtlasSpace.grid(r.target[0],r.target[2]);
  const nearest=[...layer.models.values()].sort((x,y)=>Math.hypot(x.p.x-a[0],x.p.y-a[1])-Math.hypot(y.p.x-a[0],y.p.y-a[1]))[0];const near=r.zoom>=AtlasSpace.TOWN_ZOOM*1.04&&nearest&&Math.hypot(nearest.p.x-a[0],nearest.p.y-a[1])<13;
  const nearbyRuin=r.zoom>=AtlasSpace.TOWN_ZOOM?[...ruins.models.values()].find(m=>Math.hypot(m.site.x-a[0],m.site.y-a[1])<2):null;
  E('cmContext').style.display=r.zoom>AtlasSpace.TOWN_ZOOM*1.04?'block':'none';
  E('cmStatus').textContent=nearbyRuin?`${nearbyRuin.site.name} · Ancient dragon ruins · ${Math.round(world.height[nearbyRuin.site.i]).toLocaleString()} m`:layer.loading?`Assembling ${layer.preparing||'nearby town'} · the map remains here`:near?`${nearest.p.name} · ${LandmarkBinding.highCitadelLabel(nearest.p)||nearest.city.siteEnvironment.label} · ${Math.round(nearest.city.siteEnvironment.minElevation).toLocaleString()}–${Math.round(nearest.city.siteEnvironment.maxElevation).toLocaleString()} model m`:`${sim.realms.filter(c=>c.alive).length} realms · ${sim.provinces.filter(p=>p.settled).length} towns · scroll towards a town`;
  E('omHint').textContent='SCROLL TO APPROACH · SHIFT-DRAG TO ORBIT · CLICK A BUILDING';
  document.body.dataset.detail=r.zoom>=AtlasSpace.TOWN_ZOOM?'local':'atlas';
  window.__ruins=ruins.report();
  window.__continuousCamera={zoom:r.zoom,target:r.target.slice(),canvas:r.canvas.id,scene:OneMap.scene};
  window.__folk={...(r.folkStats||{}),walking,software:!!r.software,reducedMotion:reducedMotion(),roads:r.roadStats||null};
 }
 function onCamera(){if(!enabled||!world||busy)return;const sig=[renderer.zoom.toFixed(4),...renderer.target.map(a=>a.toFixed(5)),renderer.azimuth.toFixed(4),renderer.elevation.toFixed(4),renderer.width,renderer.height].join('/');if(sig!==lastCamera){lastCamera=sig;layer.cameraChanged();ruins.cameraChanged();restFolk();}
  startFolk();
  const at=AtlasSpace.grid(renderer.target[0],renderer.target[2]),nearRuin=renderer.zoom>=AtlasSpace.DETAIL_ZOOM?[...ruins.models.values()].find(m=>Math.hypot(m.site.x-at[0],m.site.y-at[1])<2):null;
  const nearHigh=!nearRuin&&renderer.zoom>=AtlasSpace.DETAIL_ZOOM?[...layer.models.values()].find(m=>m.p.highCitadel&&Math.hypot(m.p.x-at[0],m.p.y-at[1])<2):null;
  const siteBounds=nearRuin?.bounds||(nearHigh?layer.townView(nearHigh)?.bounds:null);
  if(siteBounds){
   // Give these tiny sites a shadow field fitted to their actual buildings.
   // A normal town's field leaves only a few texels across each stone or roof.
   const b=siteBounds,t=b.min.map((v,i)=>(v+b.max[i])*.5),extent=Math.max(.35,...b.max.map((v,i)=>(v-b.min[i])*1.5)),key=(nearRuin?'ruin/'+nearRuin.id:'high/'+nearHigh.p.id)+'/'+extent.toFixed(5)+'/'+t.map(v=>v.toFixed(5)).join('/');
   if(key!==shadowCenter){shadowCenter=key;renderer.lightVP=mul4(ortho(-extent,extent,-extent,extent,1,100),lookAt([t[0]-18,t[1]+28,t[2]-20],t,[0,1,0]));renderer.dirtyShadow=true;renderer.request();}
  }
  else if(renderer.zoom>=AtlasSpace.TOWN_ZOOM*1.67){const q=renderer.target.map(v=>Math.round(v*1.5)/1.5),key=q.join('/');if(key!==shadowCenter){shadowCenter=key;const t=q,eye=[t[0]-18,t[1]+28,t[2]-20];renderer.lightVP=mul4(ortho(-9,9,-9,9,1,100),lookAt(eye,t,[0,1,0]));renderer.dirtyShadow=true;renderer.request();}}
  else if(shadowCenter!=='world'){shadowCenter='world';renderer.lightVP=mul4(ortho(-115,115,-90,90,1,420),lookAt([-110,170,-82],[0,0,0],[0,1,0]));renderer.dirtyShadow=true;renderer.request();}
  positionPins();updateTitle();
 }
 function cancel(){animation++;moving=false;}
 function animate(target,zoom,elevation=renderer.elevation,duration=850,azimuth=renderer.azimuth){cancel();const token=animation,r=renderer,start={target:r.target.slice(),zoom:r.zoom,elevation:r.elevation,azimuth:r.azimuth},time=performance.now();azimuth=start.azimuth+Math.atan2(Math.sin(azimuth-start.azimuth),Math.cos(azimuth-start.azimuth));moving=true;
  return new Promise(resolve=>{function frame(now){if(token!==animation||busy){if(token===animation)moving=false;resolve(false);return;}const t=clamp((now-time)/duration),a=t*t*(3-2*t);r.target=start.target.map((v,i)=>lerp(v,target[i],a));r.zoom=Math.exp(lerp(Math.log(start.zoom),Math.log(zoom),a));r.elevation=lerp(start.elevation,elevation,a);r.azimuth=lerp(start.azimuth,azimuth,a);r.request();if(t<1)requestAnimationFrame(frame);else{moving=false;layer.cameraChanged();resolve(true);}}requestAnimationFrame(frame);});
 }
 // Show two facades and the roof. In mountains keep the peak behind the town:
 // a fixed compass bearing can put the entire town behind a foreground hillside.
 function townBearing(p){const e=CityEnvironment.profile(world,p),az=e.mountainous?Math.atan2(-(e.peak.x-p.x),-(e.peak.y-p.y)):Math.PI+.45,axis=Math.round(az/(Math.PI/2))*Math.PI/2,offset=az-axis;return Math.abs(offset)<.4?axis+(offset<-.0001?-.45:.45):az;}
 function townObscured(m){
  const r=renderer,homes=m.city.buildings.filter(b=>!b.landmark),step=Math.max(1,Math.floor(homes.length/24));let sampled=0,hidden=0;r.updateCamera();
  for(let i=0;i<homes.length;i+=step){const b=homes[i],a=m.frame.anchors.get(b.id);if(!a)continue;const point=[a.x,a.y+(m.heights[b.id]||b.h)*a.scale*.8,a.z],q=project4(r.mvp,point),x=(q[0]/q[3]*.5+.5)*r.width,y=(.5-q[1]/q[3]*.5)*r.height;if(x<0||x>r.width||y<0||y>r.height)continue;
   const floor=AtlasSpace.pickGround(r,x,y);sampled++;if(floor&&dot(sub(floor.point,point),r.dir)<-.025)hidden++;
  }return sampled>0&&hidden/sampled>.12;
 }
 async function focusTown(id,zoom=AtlasSpace.DETAIL_ZOOM*1.44){if(!ready())return null;const p=sim.provinces[+id];if(!p?.settled)return null;OneMap.closeDrawer();OneMap.closeMenus();OneMap.clearSelection();layer.focusId=p.id;
  if(p.highCitadel){
   cancel();const request=animation,focusWorld=world,model=await layer.ensure(p.id);if(!model||request!==animation||world!==focusWorld||!ready())return null;
   let view=layer.townView(model);if(!view)return null;if(arguments.length>1)view.zoom=Math.min(view.zoom,zoom);
   let flight=animate(view.target,view.zoom,view.elevation,850,view.azimuth),token=animation;
   if(!await flight||animation!==token||world!==focusWorld||!ready())return null;
   if(townObscured(model)){view=layer.townView(model,1.08);flight=animate(view.target,view.zoom,view.elevation,280,view.azimuth);token=animation;if(!await flight||animation!==token||world!==focusWorld||!ready())return null;}
   window.__cityReady=true;window.__cityError=null;window.__continuousFocus=p.id;updateTitle();return model;
  }
  const focusWorld=world,target=AtlasSpace.point(world,p.x,p.y,renderer.relief);target[1]+=.15;const az=townBearing(p),flight=animate(target,zoom,.72,1000,az),flightToken=animation;
  const model=await layer.ensure(p.id),arrived=await flight;
  if(!arrived||animation!==flightToken||world!==focusWorld||!ready())return null;
  if(!model){toast('This location has no buildable detailed layout. The original terrain is unchanged.');return null;}
  if(townObscured(model)){const correction=animate(target,zoom,.94,280,az),token=animation;if(!await correction||animation!==token||world!==focusWorld||!ready())return null;}
  window.__cityReady=true;window.__cityError=null;window.__continuousFocus=p.id;updateTitle();return model;
 }
 async function focusBuilding(pid,bid){if(!ready())return;const p=sim.provinces[pid];if(!p)return;cancel();const token=animation,focusWorld=world;layer.focusId=pid;const m=await layer.ensure(pid);if(!m||animation!==token||world!==focusWorld||!ready())return;const b=typeof bid==='string'?m.city.buildings.find(a=>a.id===bid):bid;const chosen=b||m.city.buildings.find(b=>b.sacred)||m.city.buildings.find(b=>b.landmark);if(!chosen)return;const a=m.frame.anchors.get(chosen.id);const h=(m.heights[chosen.id]||chosen.h)*a.scale;
  const excavation=m.excavations?.find(h=>h.buildingId===chosen.id),depth=excavation?Math.max(0,a.y-excavation.floorY):0;
  const size=Math.max(chosen.w*m.frame.sx,chosen.d*m.frame.sz,h+depth),aspect=renderer.width/renderer.height;
  const fit=Math.max(49,94/aspect)*1.25/Math.max(.05,size);
  const zoom=clamp(fit,AtlasSpace.DETAIL_ZOOM,AtlasSpace.MAX_ZOOM);
  const az=renderer.zoom<AtlasSpace.TOWN_ZOOM?townBearing(p):renderer.azimuth;
  select({model:m,building:chosen,anchor:a});return animate([a.x,a.y+(h-depth)*.35,a.z],zoom,excavation?1.16:.70,850,az);
 }
 async function focusSite(id){const site=LandmarkUI.registry.find(s=>s.id===id);if(!site)return;if(site.highCitadel)return focusTown(site.provinceId);if(site.dragonRuins)return focusRuin(site);if(site.provinceId!=null){const m=await focusTown(site.provinceId);if(m){const b=m.city.buildings.find(b=>b.id===(site.buildingId||site.recipe.buildingId))||m.city.buildings.find(b=>b.sacred&&site.recipe.sacred)||m.city.buildings.find(b=>b.type===(site.recipe.kind||'temple'))||m.city.buildings.find(b=>b.landmark);if(b)return focusBuilding(site.provinceId,b.id);}}else return animate(AtlasSpace.point(world,site.x,site.y,renderer.relief),30,.94);}
 async function focusRuin(site){
  if(!ready())return null;OneMap.closeDrawer();OneMap.closeMenus();OneMap.clearSelection();selection=null;layer.focusId=null;layer.select(null);
  cancel();const token=animation,expectedWorld=world;window.__ruinReady=false;
  const m=await ruins.ensure(site.id);if(!m||token!==animation||world!==expectedWorld||!ready())return null;
  const v=ruins.view(m);if(!v)return null;
  const flight=animate(v.target,v.zoom,v.elevation,900,v.azimuth),flightToken=animation;
  if(!await flight||flightToken!==animation||world!==expectedWorld||!ready())return null;
  const mounted=ruins.models.get(site.id)||m;window.__ruinReady=true;window.__ruinFocus=site.id;window.__ruins=ruins.report();selectRuin({model:mounted,part:null});updateTitle();return mounted;
 }
 function focusRuinPart(m,part){if(!ready())return;m=ruins.models.get(m.id)||m;if(part)part=m.parts.find(p=>p.id===part.id)||null;const v=ruins.view(m,part);if(!v)return;selectRuin({model:m,part});return animate(v.target,v.zoom,v.elevation,700,v.azimuth);}
 function selectRuin({model:m,part=null}){
  OneMap.clearSelection();selection={ruin:true,model:m,part};layer.focusId=null;layer.select(null);
  E('omSelection').classList.remove('hidden');
  E('omSelectionBody').innerHTML=`<span class="om-site-mark">${AtlasMarks.markup('dragon-ruin',{size:30})}</span><small class="om-eyebrow">ANCIENT DRAGON RUINS</small><h3>${escapeHTML(part?.name||m.site.name)}</h3><p>${escapeHTML(part?.note||m.recipe.provenance||'Broken dragon monuments remain above the surrounding landscape.')}</p><div class="om-actions"><button id="cmFocusRuin">Closer</button><button id="cmRuinDetails">Details</button><button id="cmRuinContext">Wider setting</button></div>`;
  E('cmFocusRuin').onclick=()=>focusRuinPart(m,part);E('cmRuinDetails').onclick=()=>ruinDetails(m,part);E('cmRuinContext').onclick=wider;
 }
 function ruinDetails(m,part=null,open=true){
  if(!m)return;m=ruins.models.get(m.id)||m;if(part)part=m.parts.find(p=>p.id===part.id)||null;if(open)OneMap.openDrawer('detail');const site=m.site,status=PoliticalLand.status(world,sim,site.i);
  E('omDrawerTitle').textContent=part?.name||site.name;
  E('inspector').innerHTML=`<div class="overline">ANCIENT DRAGON RUINS</div><h2>${escapeHTML(site.name)}</h2><p class="identity">${escapeHTML(m.recipe.provenance||'Weathered traces of an older dragon realm.')}</p><div class="metrics"><div><b>${Math.round(world.height[site.i]).toLocaleString()} m</b><small>ELEVATION</small></div><div><b>${m.parts.filter(p=>p.role!=='foundation').length}</b><small>SURVIVING FRAGMENTS</small></div></div><p>${escapeHTML(status.label)}</p>${part?`<h3>${escapeHTML(part.name)}</h3><p>${escapeHTML(part.note||'An ancient surviving structure.')}</p>`:''}<div class="inspectbuttons"><button id="cmRuinWhole">View the whole ruin</button><button id="cmRuinGLB">Export ruin GLB</button></div><h3>Explore the remains</h3><div class="cm-ruin-part-list">${m.parts.filter(p=>p.role!=='foundation').map(p=>`<button data-ruin-part="${escapeHTML(p.id)}">${escapeHTML(p.name)} ↗</button>`).join('')}</div>`;
  E('cmRuinWhole').onclick=()=>focusRuinPart(m,null);
  E('cmRuinGLB').disabled=!ruins.models.has(m.id);
  E('cmRuinGLB').onclick=()=>{const mounted=ruins.models.get(m.id);if(!mounted)return;const meshes={};for(const name of mounted.meshNames)if(renderer.meshes[name])meshes[name]=renderer.meshes[name];saveBlob(new Blob([exportGeometryGLB(meshes,{name:site.name,kind:'dragon-ruin',seed:world.params.seed,cell:site.i,crs:'TELLURIC_RECTANGULAR_ATLAS'})],{type:'model/gltf-binary'}),site.name+'-ruin.glb');};
  E('inspector').querySelectorAll('[data-ruin-part]').forEach(b=>b.onclick=()=>focusRuinPart(m,m.parts.find(p=>p.id===b.dataset.ruinPart)));
 }
 function wider(){if(!ready())return;if(selection?.ruin)return animate(AtlasSpace.point(world,selection.model.site.x,selection.model.site.y,renderer.relief),12,1.02);const id=layer.focusId,m=layer.models.get(id);if(m){const a=AtlasSpace.point(world,m.p.x,m.p.y,renderer.relief);a[1]+=.2;return animate(a,10,1.02);}return animate(renderer.target.slice(),Math.max(1,renderer.zoom*.45),1.02);}
 // Match AtlasRenderer.reset(): coming back to the whole world restores the north-up
 // heading as well. Without it a mountainous town's approach angle — focusTown turns the
 // camera toward the peak — or any shift-drag rotate survives the trip home, and the
 // atlas stays skewed with no way to straighten it except reloading.
 const HOME_AZIMUTH=.018,HOME_ELEVATION=1.19;
 function home(){if(!ready())return;OneMap.clearSelection();OneMap.closeDrawer();selection=null;layer.focusId=null;layer.select(null);return animate([0,0,0],1,HOME_ELEVATION,1000,HOME_AZIMUTH);}
 function zoomBy(factor,sx=renderer.width/2,sy=renderer.height/2){if(!ready())return;cancel();const r=renderer,before=AtlasSpace.pickGround(r,sx,sy);r.zoom=clamp(r.zoom*factor,.6,AtlasSpace.MAX_ZOOM);r.updateCamera();const after=before?AtlasSpace.pickGround(r,sx,sy):null;if(before&&after){r.target[0]+=before.point[0]-after.point[0];r.target[2]+=before.point[2]-after.point[2];}r.request();}
 function select(hit){OneMap.clearSelection();selection=hit;layer.focusId=hit.model.p.id;layer.select(hit);const b=hit.building,m=hit.model;E('omSelection').classList.remove('hidden');E('omSelectionBody').innerHTML=`<small class="om-eyebrow">${escapeHTML(m.p.name)} / ${escapeHTML(m.city.siteEnvironment.label)}</small><h3>${escapeHTML(b.name)}</h3><p>${escapeHTML(CITY_TYPES[b.type]?.description||'An assembled part of this town.')}</p><div class="om-actions"><button id="cmFocusBuilding">Closer</button><button id="cmShowDetails">Details</button><button id="cmShowContext">Wider setting</button></div>`;E('cmFocusBuilding').onclick=()=>focusBuilding(m.p.id,b.id);E('cmShowDetails').onclick=()=>details(m,b);E('cmShowContext').onclick=wider;}
 /* THE SAGA PANEL.
  * Somebody who lives in the town tells you its history: their face, their office, and
  * five chapters in their own voice, each with the model fact it was composed from
  * underneath. Two things in it are interaction points rather than text — the place a
  * chapter is about, and the other towns the chronicle ties this one to. Following either
  * is how a reader gets from one telling to the telling that argues with it.
  */
 const NUMERAL=['I','II','III','IV','V','VI','VII'];
 function sagaHTML(p){
  if(typeof Saga==='undefined')return '';
  const g=Saga.of(world,sim,p);
  if(!g)return '';
  const n=g.narrator,face=typeof Portrait!=='undefined'?Portrait.svg(n.people,n.seed,{size:104}):'';
  const chapters=g.chapters.map((c,k)=>`<section class="cm-chapter"><h4><i>${NUMERAL[k]||k+1}</i>${escapeHTML(c.heading)}</h4><p>${escapeHTML(c.text)}</p>`+
   (c.anchor?`<button class="cm-saga-link" data-saga-place="${c.anchor.x}|${c.anchor.y}">Go and see ${escapeHTML(c.anchor.name)} ↗</button>`:'')+
   `<small class="cm-basis">${escapeHTML(c.basis)}</small></section>`).join('');
  const told=g.links.length?`<h4 class="cm-elsewhere">They tell it differently over there</h4>`+g.links.map(l=>
   `<button class="cm-saga-link" data-saga-town="${l.province}">${escapeHTML(l.name)} · ${escapeHTML(l.relation)} ↗</button><small class="cm-basis">${escapeHTML(l.record)}</small>`).join(''):'';
  return `<h3>Somebody who lives here</h3><div class="cm-saga">`+
   `<div class="cm-teller"><div class="cm-teller-face">${face}</div>`+
   `<div class="cm-teller-who"><b>${escapeHTML(n.name)} ${escapeHTML(n.rank)}</b>`+
   `<small>${escapeHTML(PEOPLES[n.people].name)} · ${escapeHTML(n.office)} of ${escapeHTML(p.name)}</small>`+
   `<em>${escapeHTML(g.title)}</em></div></div>`+
   chapters+told+
   `<p class="smallnote">The narrator is invented; everything they tell you is composed from this world's own state — the district's live people and faith mixtures, its chronicle, and the physical fields beneath it. The line under each chapter is the fact it was built from. No people is cast as an enemy: an adversary here is a state, a disaster or a place, and both sides of a war tell it as their own.</p></div>`;
 }
 function bindSaga(host,p){
  host.querySelectorAll('[data-saga-town]').forEach(el=>el.onclick=async()=>{
   const id=+el.dataset.sagaTown,q=sim.provinces[id];
   if(!q?.settled)return;
   const model=await focusTown(id);
   if(model)details(model);
  });
  host.querySelectorAll('[data-saga-place]').forEach(el=>el.onclick=()=>{
   const [x,y]=el.dataset.sagaPlace.split('|').map(Number);
   OneMap.closeDrawer();
   animate(AtlasSpace.point(world,x,y,renderer.relief),12,1.02,1100);
  });
 }
 function details(m,b=null,open=true){if(!m)return;if(open)OneMap.openDrawer('detail');const p=sim.provinces[m.p.id],e=m.city.siteEnvironment;E('omDrawerTitle').textContent=b?.name||p.name;  E('inspector').innerHTML=`<div class="overline">SAME MAP · WORLD CELL ${p.i}</div><h2>${escapeHTML(p.name)}</h2><p class="identity">${escapeHTML(LandmarkBinding.highCitadelLabel(p)||e.label)}${p.highCitadel?' · '+Math.round(p.highCitadel.elevation).toLocaleString()+' m':''}. These slopes, lake shores, glaciers and river valleys are the parent world's own geography. No replacement scenery is loaded.</p><div class="metrics"><div><b>${fmtPop(p.urbanPop)}</b><small>TOWN POPULATION</small></div><div><b>${e.temperature.toFixed(1)}°</b><small>SITE TEMPERATURE</small></div><div><b>${Math.round(e.minElevation)}–${Math.round(e.maxElevation)}</b><small>SURROUNDING ELEVATION</small></div><div><b>${m.city.stats.modules}</b><small>BUILDING COMPOUNDS</small></div></div><div class="inspectbuttons"><button id="cmPullBack">Wider setting</button><button id="cmTownGLB">Export town GLB</button></div>${sagaHTML(p)}<h3>Landmarks in this city</h3><div class="cm-building-list">${m.city.buildings.filter(b=>b.landmark).map(b=>`<button data-cm-building="${b.id}">${escapeHTML(b.name)} ↗</button>`).join('')}</div><h3>Public works</h3><div class="cm-building-list">${Object.entries(CITY_PROJECTS).map(([k,d])=>{const q=cityProjectQuote(sim,p.id,k);return `<button data-cm-project="${k}" ${q.ok?'':'disabled'} title="${escapeHTML(q.reason)}">${d.name}${q.ok?' · '+q.cost.toFixed(1):''}</button>`;}).join('')}</div><p class="smallnote">The camera stays in the atlas. Architecture is synthetic, relief and building scales are exaggerated; detailed residents and interiors are not simulated.</p>`;
  E('cmPullBack').onclick=wider;E('cmTownGLB').onclick=()=>{const meshes={};for(const name of m.meshNames)if(renderer.meshes[name]&&!name.endsWith(':silhouettes'))meshes[name]=renderer.meshes[name];meshes.rivers=RiverDetail.townMesh(layer,m);saveBlob(new Blob([exportGeometryGLB(meshes,{city:p.name,crs:'TELLURIC_RECTANGULAR_ATLAS',note:'Town structures in original atlas coordinates; surrounding world terrain is not included in this town-only export.'})],{type:'model/gltf-binary'}),p.name+'-atlas-town.glb');};
  E('inspector').querySelectorAll('[data-cm-building]').forEach(el=>el.onclick=()=>focusBuilding(p.id,el.dataset.cmBuilding));bindSaga(E('inspector'),p);E('inspector').querySelectorAll('[data-cm-project]').forEach(el=>el.onclick=async()=>{pause();const result=startCityProject(sim,world,p.id,el.dataset.cmProject);toast(result.message);refreshAll();await layer.ensure(p.id);details(layer.models.get(p.id));});
 }
 function makePins(){if(!enabled||!world||!sim)return;
  // World labels retain every settlement through the camera transition and
  // expose the same town focus action. This overlay adds only building names.
  const sig=world.params.seed+'/'+[...layer.models.values()].map(m=>m.p.id+':'+m.key).join('/');if(sig===lastPins)return;lastPins=sig;const node=E('cmLabels');node.replaceChildren();pins=[];
  for(const m of layer.models.values())for(const b of m.city.buildings.filter(b=>b.landmark)){const a=m.frame.anchors.get(b.id),h=(m.heights[b.id]||b.h)*a.scale,button=document.createElement('button');button.className='cm-pin cm-building-pin';button.textContent=b.name;button.onclick=()=>{select({model:m,building:b,anchor:a});focusBuilding(m.p.id,b.id);};node.appendChild(button);pins.push({button,point:[a.x,a.y+h+.012,a.z],model:m,building:b});}
 }
 function positionPins(){if(!enabled||!world)return;const r=renderer,show=r.zoom>=AtlasSpace.TOWN_ZOOM&&E('names').checked;E('cmLabels').style.display=show?'block':'none';if(!show)return;const boxes=[];
  // Previously culled pins need a box before measuring. Batch all writes, then
  // all reads, so the bundled lettering participates in the collision layout.
  for(const v of pins)v.button.style.display='block';
  const measured=pins.map(v=>({...v,w:v.button.offsetWidth,h:v.button.offsetHeight}));
  for(const v of measured){const point=v.point,q=project4(r.mvp,point),x=(q[0]/q[3]*.5+.5)*r.width,y=(.5-q[1]/q[3]*.5)*r.height,box={x:x-v.w/2-4,y:y-v.h-3,w:v.w+8,h:v.h+6};let valid=box.x>8&&box.x+box.w<r.width-8&&box.y>105&&y<r.height-140&&r.zoom>=AtlasSpace.DETAIL_ZOOM*1.11;if(valid&&boxes.some(a=>box.x<a.x+a.w&&box.x+box.w>a.x&&box.y<a.y+a.h&&box.y+box.h>a.y))valid=false;
   // Do not put labels through an intervening mountain face.
   if(valid){const floor=AtlasSpace.pickGround(r,x,y);if(floor){const d=dot(sub(floor.point,point),r.dir);if(d<-.035)valid=false;}}
   v.button.style.display=valid?'block':'none';v.button.style.left=x+'px';v.button.style.top=y+'px';if(valid)boxes.push(box);
  }
 }
 function bindCamera(){const c=E('map'),pointers=new Map();let drag=null,pinch=null;const rect=()=>c.getBoundingClientRect();
  c.addEventListener('contextmenu',e=>e.preventDefault());c.addEventListener('pointerdown',e=>{if(!ready())return;cancel();renderer.interacting=true;c.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),zoom:renderer.zoom};if(drag)drag.moved=99;return;}drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:0,rotate:e.shiftKey||e.button===2};});
  c.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()];renderer.zoom=clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.d),.6,AtlasSpace.MAX_ZOOM);renderer.request();return;}if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy));if(drag.rotate){renderer.azimuth-=dx*.006;renderer.elevation=clamp(renderer.elevation+dy*.006,.42,1.555);renderer.request();}else renderer.pan(dx,dy);drag.x=e.clientX;drag.y=e.clientY;});
  const end=e=>{pointers.delete(e.pointerId);if(drag&&drag.moved<4&&!pinch){const a=rect(),x=e.clientX-a.left,y=e.clientY-a.top,h=layer.pick(x,y),site=ruins.pick(x,y);if(site)selectRuin(site);else if(h)select(h);else{selection=null;layer.select(null);const at=AtlasSpace.pickGround(renderer,x,y);if(at)inspectCell(at.i);}}if(!pointers.size){drag=null;pinch=null;renderer.interacting=false;renderer.request();}};
  c.addEventListener('pointerup',end);c.addEventListener('pointercancel',()=>{pointers.clear();drag=null;pinch=null;renderer.interacting=false;renderer.request();});E('stage').addEventListener('wheel',e=>{e.preventDefault();const a=rect();zoomBy(Math.exp(-e.deltaY*.0012),e.clientX-a.left,e.clientY-a.top);},{passive:false});
  c.addEventListener('dblclick',e=>{if(!ready())return;e.stopImmediatePropagation();const a=rect(),x=e.clientX-a.left,y=e.clientY-a.top,h=layer.pick(x,y),site=ruins.pick(x,y);if(site){focusRuinPart(site.model,site.part);return;}if(h){focusBuilding(h.model.p.id,h.building.id);return;}const at=AtlasSpace.pickGround(renderer,x,y);if(!at)return;const nearby=sim.provinces.filter(p=>p.settled).map(p=>({p,d:Math.hypot(p.x-at.x,p.y-at.y)})).sort((a,b)=>a.d-b.d)[0];if(nearby?.d<5)focusTown(nearby.p.id);else animate(at.point,Math.min(180,renderer.zoom*2),renderer.elevation);},true);
 }
 return{init,onWorldUpdate,beforeWorldBuild,focusTown,focusBuilding,focusSite,focusRuinPart,ruinDetails,zoomBy,wider,home,cancel,details,select,get ruinLayer(){return ruins;},get layer(){return layer;},get active(){return enabled;},get moving(){return moving;},get walking(){return walking;},get clock(){return clock;},report:()=>layer?.report()};
})();
