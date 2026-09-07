"""Run the offline bundle in memory; no network navigation or external assets.
The optional inherited tests for modal city scenes are superseded by this suite.
"""
from pathlib import Path
import json, os, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'previews/continuous';OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[], 'errors':[], 'requests':[], 'renderer':'software', 'load_method':'bundled HTML in an about:blank document'}
def mark(name,data=True):
 report['checks'].append({'name':name,'data':data});print('PASS',name,json.dumps(data)[:250],flush=True)
def stable(p):p.wait_for_function('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',timeout=240000)
def snapshot(p):return p.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim),year:sim.year})')
def shots(p,name):
 stable(p);p.screenshot(path=str(OUT/(name+'.png')))
def no_jump(p):
 return p.evaluate('({canvas:renderer.canvas.id,same:renderer.canvas===window.__originalCanvas,scene:OneMap.scene,openCity:document.getElementById("cityDialog").open,openMonument:document.getElementById("landmarkDialog").open})')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
 ctx=browser.new_context(viewport={'width':1480,'height':980},device_scale_factor=1,accept_downloads=True)
 page=ctx.new_page();page.on('pageerror',lambda e:(report['errors'].append(str(e)),print('ERROR',e,flush=True)))
 page.on('request',lambda r:report['requests'].append(r.url))
 page.set_content((ROOT/'dist/telluric-onemap.html').read_text(),wait_until='load',timeout=180000)
 stable(page);page.evaluate('window.__originalCanvas=renderer.canvas')
 start=snapshot(page);mark('Initial geography, towns and polities load',page.evaluate('window.__generationReport'))
 shots(page,'world')
 # Actual search controls, then a camera approach rather than a scene switch.
 page.locator('#omSearchToggle').click();page.locator('#omSearch').fill('Glassbeck')  # province 507; renamed from 'Stonefall 5' by the district-naming pass
 page.locator('[data-search-enter]').first.click();page.wait_for_function('ContinuousMap.layer.models.has(507)',timeout=240000);stable(page)
 check=no_jump(page);assert check=={'canvas':'map','same':True,'scene':'world','openCity':False,'openMonument':False};mark('Search zooms to Glassbeck without replacing the map',check)
 assert snapshot(page)==start;mark('Exploration leaves geography, population and politics unchanged')
 mark('Glassbeck inherits a dry lake basin and real glacial foothills',page.evaluate('ContinuousMap.layer.models.get(507).city.siteEnvironment.label'))
 shots(page,'stonefall-town')
 page.locator('#cmContext').click();stable(page);shots(page,'stonefall-setting')
 assert abs(page.evaluate('renderer.zoom')-10)<1e-6;mark('Wider setting is only a continuous camera pullback')
 # Scroll close. Camera/world/renderer identities must remain unchanged.
 page.mouse.move(740,470);page.mouse.wheel(0,-780);page.wait_for_function('renderer.zoom>20',timeout=20000);stable(page)
 assert page.evaluate('renderer.zoom')>20;assert no_jump(page)['same'];mark('Mouse wheel crosses regional/town detail thresholds in place',page.evaluate('renderer.zoom'))
 # Real rendered building picking by casting a ray at its visible roof.
 hit=page.evaluate('''()=>{const m=ContinuousMap.layer.models.get(507);for(const b of m.city.buildings){const a=m.frame.anchors.get(b.id),pos=[a.x,a.y+(m.heights[b.id]||b.h)*a.scale*.70,a.z],q=project4(renderer.mvp,pos),x=(q[0]/q[3]*.5+.5)*renderer.width,y=(.5-q[1]/q[3]*.5)*renderer.height;if(x<80||x>renderer.width-80||y<170||y>renderer.height-240)continue;const h=ContinuousMap.layer.pick(x,y);if(h&&h.model.p.id===507)return{x,y,id:h.building.id};}return null;}''')
 assert hit, 'No visible building could be picked'
 page.mouse.click(hit['x'],hit['y']);page.wait_for_selector('#cmFocusBuilding');mark('A building is selectable on the world canvas',hit)
 page.locator('#cmFocusBuilding').click();stable(page);assert no_jump(page)['scene']=='world';mark('Closer focuses the same in-place mesh, not a monument dialog')
 shots(page,'stonefall-building')
 page.locator('#cmShowDetails').click();page.wait_for_selector('#cmTownGLB');mark('Details open only a small side drawer')
 page.locator('#omDrawerClose').click()
 # Sacred city retains its surrounding coast/terrain and same model recipe. The
 # pilgrimage town is looked up rather than hardcoded: which province earns a grand
 # sanctuary moves whenever settlement support or the tradition rules change.
 sacredId=page.evaluate('''(()=>{const p=sim.provinces.filter(p=>p.city&&TownCatalog.native(p,world)==='basilica'&&(p.detailSupport??p.urbanSupport)>=6500).sort((a,b)=>b.urbanPop-a.urbanPop)[0];return p?p.id:null;})()''')
 assert sacredId is not None, 'no pilgrimage town large enough for a grand sanctuary'
 page.evaluate('(id)=>ContinuousMap.focusTown(id)',sacredId);stable(page);page.wait_for_function(f'ContinuousMap.layer.models.has({sacredId})',timeout=240000)
 shots(page,'sanctuary-town')
 sacred=page.evaluate('(id)=>ContinuousMap.layer.models.get(id).city.buildings.find(b=>b.sacred)?.id',sacredId)
 assert sacred;page.evaluate('([p,b])=>ContinuousMap.focusBuilding(p,b)',[sacredId,sacred]);stable(page);shots(page,'sanctuary-temple')
 mark('Existing grand sanctuary stays in the actual town during zoom',no_jump(page))
 assert snapshot(page)==start;mark('Repeated city/building zooms do not mutate the world')
 # Population/year changes are still the original simulation.
 page.locator('#step1').click();stable(page);assert page.evaluate('sim.year')==401
 mark('Annual simulation runs while looking at an embedded sanctuary')
 # Third locality exercises eviction and real lake shores.
 page.evaluate('''(()=>{const p=sim.provinces.filter(p=>p.city&&p.siteLake>.25).sort((a,b)=>b.siteLake-a.siteLake)[0];window.__lakeId=p.id;return ContinuousMap.focusTown(p.id,24);})()''')
 stable(page);shots(page,'lakeshore-town')
 count=page.evaluate('ContinuousMap.layer.models.size');assert count<=2;mark('Local mesh cache remains bounded',count)
 assert no_jump(page)['same'];mark('Lakeshore town preserves the same canvas and surrounding water')
 # Cancelable regeneration; a committed regeneration must remove stale local models.
 page.locator('#forgeButton').click();page.locator('#seed').fill('Continuous-ridge-17');page.locator('#generate').click()
 stable(page);assert page.evaluate('world.params.seed')=='Continuous-ridge-17';assert page.evaluate('sim.realms.length')>0
 assert page.evaluate('ContinuousMap.layer.models.size')==0
 assert no_jump(page)['same'];mark('Regenerate replaces world data, keeps canvas, removes stale towns',page.evaluate('window.__generationReport'))
 shots(page,'regenerated')
 # Save/load current simulation in memory using the application's own JSON schema.
 saved=page.evaluate('JSON.stringify(makeSave())')
 page.evaluate('advance(1)');stable(page)
 page.evaluate('(text)=>loadSimulation(new File([text],"world.json",{type:"application/json"}))',saved);stable(page)
 assert page.evaluate('sim.year')==400;mark('Existing save/load works with the continuous view')
 # A new seed must stream its own native city, never old scene geometry.
 pid=page.evaluate('sim.provinces.filter(p=>p.city).sort((a,b)=>b.urbanPop-a.urbanPop)[0].id')
 page.evaluate('(id)=>ContinuousMap.focusTown(id)',pid);stable(page)
 assert page.evaluate('ContinuousMap.report().worldSeed')=='Continuous-ridge-17';mark('Newly generated cities reference the new geography')
 # One mobile view, no separate scene.
 page.set_viewport_size({'width':430,'height':900});stable(page);shots(page,'mobile')
 assert no_jump(page)['same'];mark('Mobile viewport retains the one-map view')
 worker_used=page.evaluate('!!ContinuousMap.layer.worker')
 before=page.evaluate('physicalFingerprint(world)')
 page.evaluate('rerollSocieties()');stable(page)
 assert page.evaluate('physicalFingerprint(world)')==before
 assert no_jump(page)['same'];mark('Recasting societies on the same terrain invalidates city and worker caches')
 # Roads, quays and the walking crowd. Fingerprints must survive all of it.
 page.set_viewport_size({'width':1480,'height':980});page.evaluate('ContinuousMap.home()');stable(page)
 roads=page.evaluate('renderer.roadStats')
 assert roads and roads['roads']>10 and roads['ports']>0
 assert page.evaluate("renderer.visible('roads')") and page.evaluate("renderer.visible('ports')")
 mark('The world atlas carries a road and port network',roads)
 shots(page,'roads-world')
 wet=page.evaluate('''(()=>{const p=sim.provinces.filter(p=>p.settled&&p.urbanPop>=650&&p.harbor>.4).sort((a,b)=>b.urbanPop-a.urbanPop).find(p=>generateCity(world,sim,p.id).port);if(!p)throw Error('No town with a surveyed waterfront');window.__portId=p.id;return ContinuousMap.focusTown(p.id,30);})()''')
 page.wait_for_function('ContinuousMap.layer.models.has(window.__portId)',timeout=240000);stable(page)
 port=page.evaluate('ContinuousMap.layer.models.get(window.__portId).city.stats.port')
 assert port and port['jetties']>0;mark('A harbour town has a built waterfront',port)
 assert page.evaluate("!!renderer.meshes['cm:'+window.__portId+':port']?.count")
 assert page.evaluate("renderer.visible('roadsNear')") and not page.evaluate("renderer.visible('roads')")
 mark('The cartographic road hands over to the ground-seated one inside a town')
 shots(page,'port-town')
 # The crowd has to be present AND moving, and must not drive a shadow rebuild.
 page.wait_for_function('window.__folk&&window.__folk.residents>0',timeout=60000)
 folk=page.evaluate('window.__folk');assert folk['residents']>0;mark('Townsfolk populate the streets',folk)
 moved=page.evaluate('''async()=>{const at=()=>window.__folk.clock;const a=at();
  await new Promise(r=>setTimeout(r,900));return {a,b:at(),walking:window.__folk.walking,software:window.__folk.software};}''')
 if moved['software'] or not moved['walking']:
  mark('Figures hold position where a frame is expensive',moved)
 else:
  assert moved['b']>moved['a'];mark('Figures walk on their own clock',moved)
 assert page.evaluate('renderer.dirtyShadow')==False;mark('A crowd rebuild leaves the shadow map alone')
 assert snapshot(page)==page.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim),year:sim.year})')
 assert page.evaluate('sim.roads===undefined');mark('Roads, quays and figures add nothing to the simulation state')
 page.evaluate("document.getElementById('folk').click();document.getElementById('roads').click()");stable(page)
 assert not page.evaluate("renderer.visible('folk')") and not page.evaluate("renderer.visible('roadsNear')")
 mark('Both toggles switch the new layers off')
 page.evaluate("document.getElementById('folk').click();document.getElementById('roads').click()");stable(page)
 report['final']=page.evaluate('ContinuousMap.report()');report['worker']=worker_used;report['error']=page.evaluate('window.__continuousError||null')
 report['roads']=page.evaluate('renderer.roadStats');report['folk']=page.evaluate('window.__folk')
 assert not report['errors'];assert report['error'] is None
 assert not [u for u in report['requests'] if u.startswith(('http:','https:'))]
 mark('No page errors or external asset requests; mesh worker active',report['worker'])
 (ROOT/'docs/CONTINUOUS_BROWSER_RESULTS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 browser.close()
