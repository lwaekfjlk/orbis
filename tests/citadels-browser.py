"""Actual offline browser regression. Not an image-generation preview."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time
R=Path(__file__).resolve().parents[1];O=R/'previews/citadels';O.mkdir(parents=True,exist_ok=True)
report={'checks':[], 'errors':[], 'scenes':[], 'renderer':'','network':[]}
def mark(name,details=True):report['checks'].append({'name':name,'details':details});print('PASS',name,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=b.new_context(viewport={'width':1440,'height':1000},offline=True,device_scale_factor=1)
 p=context.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
 p.set_content((R/'dist/telluric-onemap.html').read_text(),wait_until='load');p.wait_for_function('window.__ready||window.__error',timeout=120000)
 assert p.evaluate('window.__ready&&!window.__error');mark('Existing 38-country world remains visible')
 original=p.evaluate('({p:physicalFingerprint(world),s:settlementFingerprint(sim),t:politicalFingerprint(sim),year:sim.year})')
 report['renderer']=p.evaluate('renderer.software?"Canvas depth-buffer fallback":"WebGL2"')
 for id,name in [(179,'highland'),(385,'courtyard'),(112,'woodland'),(191,'arcane')]:
  if p.evaluate('OneMap.scene')!='world':p.evaluate('CityUI.close()')
  p.evaluate('(id)=>CityUI.open(id)',id);p.wait_for_function('window.__cityReady||window.__cityError',timeout=120000);assert p.evaluate('!window.__cityError')
  p.wait_for_function('!CityUI.renderer.pending',timeout=120000)
  info=p.evaluate('({id:CityUI.layout.provinceId,name:CityUI.layout.name,style:CityUI.layout.townRecipe.style,footprints:CityUI.layout.buildings.length,walls:CityUI.layout.defenses.walls.length,gates:CityUI.layout.defenses.gates.length,gateApproaches:CityUI.layout.defenses.approachCount,citadel:!!CityUI.layout.buildings.find(b=>b.precinct),triangles:Object.values(CityUI.renderer.meshes).reduce((a,b)=>a+b.count/3,0),audit:auditCity(CityUI.layout)})')
  assert info['audit']['nonfinite']==info['audit']['overlaps']==info['audit']['wetBuildings']==0
  assert p.evaluate('({p:physicalFingerprint(world),s:settlementFingerprint(sim),t:politicalFingerprint(sim),year:sim.year})')==original
  report['scenes'].append(info);mark('Same-world '+name+' city renders without mutating simulation',info)
  p.screenshot(path=str(O/(name+'.png')))
  if name=='highland':
   bid=p.evaluate('CityUI.layout.buildings.find(b=>b.precinct).id');p.evaluate('(id)=>CityUI.selectBuilding(id)',bid)
   assert p.locator('#omSelection').is_visible();mark('Actual citadel can be selected from map')
   p.evaluate('(()=>{let b=CityUI.layout.buildings.find(b=>b.precinct),r=CityUI.renderer;r.target=[b.x,b.y+5,b.z];r.zoom=3.35;r.elevation=.68;r.azimuth=-.35;r.request()})()')
   p.wait_for_function('!CityUI.renderer.pending',timeout=120000);p.screenshot(path=str(O/'citadel-detail.png'))
   p.evaluate('LandmarkUI.openCity(CityUI.activeId,"civic")');p.wait_for_function('window.__landmarkReady||window.__landmarkError',timeout=120000);assert p.evaluate('!window.__landmarkError');p.wait_for_function('!LandmarkUI.renderer.pending',timeout=120000)
   assert p.evaluate('LandmarkUI.model.recipe.artisan===true');mark('Building drill-down shares artisan model recipe')
   p.locator('#omBack').click();p.wait_for_function('OneMap.scene==="city"');p.locator('#omBack').click();p.wait_for_function('OneMap.scene==="world"')
 if p.evaluate('OneMap.scene')=='city':p.evaluate('CityUI.close()')
 p.locator('#step1').click();p.wait_for_function('sim.year===401&&!simAdvancing',timeout=120000);assert p.evaluate('physicalFingerprint(world)')==original['p'];mark('Time advances without new terrain')
 p.locator('#forgeButton').click();p.locator('#seed').fill('Citadel-regression-11');p.locator('#generate').click();p.wait_for_function('window.__ready&&!busy&&world.params.seed==="Citadel-regression-11"',timeout=120000)
 assert p.evaluate('sim.realms.length>0&&renderer.visible("settlements")&&renderer.visible("frontiers")');mark('Regenerate still retains visible civilizations')
 p.screenshot(path=str(O/'regenerated.png'))
 assert not report['errors'],report['errors'];assert not report['network'];mark('No application errors or network requests')
 (R/'docs/CITADEL_BROWSER_RESULTS.json').write_text(json.dumps(report,indent=2))
 b.close()
