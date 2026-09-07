"""Exercise the integrated sanctuary through actual OneMap controls, offline."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
O=R/'previews/sanctuary';O.mkdir(parents=True,exist_ok=True)
A=R/'artifacts';A.mkdir(exist_ok=True)
report={'checks':[], 'pageErrors':[], 'consoleErrors':[], 'network':[]}
def mark(name,data=True):
 report['checks'].append({'name':name,'data':data});print('PASS',name,flush=True)
def wait_world(p):
 p.wait_for_function('window.__ready&&!busy&&!simAdvancing&&!renderer.pending',timeout=180000)
 assert not p.evaluate('window.__error'),p.evaluate('window.__error')
def wait_city(p):
 p.wait_for_function("(window.__cityReady||window.__cityError)&&OneMap.scene==='city'",timeout=180000)
 assert not p.evaluate('window.__cityError'),p.evaluate('window.__cityError')
 p.wait_for_function('CityUI.renderer&&!CityUI.renderer.pending',timeout=180000)
def fp(p):
 return p.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim),year:sim.year,seed:world.params.seed})')
def regen(p,seed):
 p.locator('#forgeButton').click();p.locator('#seed').fill(seed);p.locator('#generate').click()
 p.wait_for_function('(s)=>world.params.seed===s&&!busy&&window.__ready',arg=seed,timeout=180000);wait_world(p)

def run():
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  ctx=b.new_context(viewport={'width':1600,'height':1050},device_scale_factor=1,accept_downloads=True);ctx.set_offline(True);p=ctx.new_page()
  p.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
  p.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' else None)
  p.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('https:','http:')) else None)
  p.set_content((R/'dist/telluric-onemap.html').read_text(),wait_until='load');wait_world(p)
  old=fp(p);count=p.evaluate('sim.realms.length');towns=p.evaluate('sim.provinces.filter(p=>p.city).length');assert(count,towns)==(38,96)
  report['renderer']='Software triangle z-buffer, Chromium; hardware GPU not tested'
  assert p.evaluate("OneMap.scene==='world' && renderer.visible('settlements') && renderer.visible('frontiers')")
  mark('Startup stays a single inhabited world map',{'realms':count,'towns':towns})
  # A user-visible menu enters an actual existing sacred town, not a model library.
  p.locator('#omMoreToggle').click();p.locator('[data-command=sanctuary]').click();wait_city(p)
  place=p.evaluate('({id:CityUI.activeId,name:CityUI.layout.name,hasSanctuary:CityUI.layout.buildings.some(b=>b.sacred),audit:CityUI.audit()})')
  assert place['hasSanctuary'];assert fp(p)==old
  mark('Visit a grand sanctuary opens a populated existing town without changing the world',place)
  p.screenshot(path=str(O/'moonport-world-entry.png'))
  # Search is another actual map entrance and confirms exact named town.
  p.locator('#omBack').click();wait_world(p)
  p.locator('#omSearchToggle').click();p.locator('#omSearch').fill('Silverford');p.locator('#omSearchResults .om-enter').first.click();wait_city(p)
  assert p.evaluate('CityUI.layout.name')=='Silverford'
  assert p.evaluate("Array.from(document.querySelectorAll('canvas')).filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0).map(e=>e.id)")==['cityCanvas']
  sig=p.evaluate("LandmarkCatalog.signature(TownCityBinding.resolve(world,sim,sim.provinces[CityUI.activeId],CityUI.layout,'temple'))")
  mark('Search enters Silverford with a grand sanctuary and one visible map')
  p.screenshot(path=str(O/'silverford-city.png'))
  p.evaluate('CityUI.renderer.focusBuilding(CityUI.layout.buildings.find(b=>b.sacred))');p.wait_for_function('!CityUI.renderer.pending',timeout=180000)
  p.screenshot(path=str(O/'silverford-close.png'))
  # Direct mesh hit on a roof/facade point. Do not infer selection solely from a label.
  hit=p.evaluate('''() => {const r=CityUI.renderer,b=CityUI.layout.buildings.find(b=>b.sacred);for(const y of [b.y+b.h*.45,b.y+b.h*.2,b.y+3]){const [x,sy]=r.screen(b.x,b.z,y-r.ground(b.x,b.z));const q=r.pick(x,sy);if(q?.id===b.id)return {x,y:sy,id:b.id};}return null;}''')
  assert hit, 'The sanctuary must be pickable in the town scene'
  p.mouse.click(hit['x'],hit['y']);p.wait_for_timeout(100)
  assert p.locator('#omSelection').is_visible()
  mark('In-town sanctuary has an inspectable building record and focus target',hit)
  # Enter its detailed model; verifies exact shared recipe signature.
  p.locator('#omSelectionBody [data-selection-action="0"]').click()
  p.wait_for_function("window.__landmarkReady&&OneMap.scene==='landmark'&&!LandmarkUI.renderer.pending",timeout=180000)
  assert p.evaluate('LandmarkCatalog.signature(LandmarkUI.recipe)')==sig
  assert p.evaluate('LandmarkUI.recipe.sacred')
  assert p.evaluate('LandmarkUI.model.stats.triangles')>200000
  assert fp(p)==old
  mark('Detailed view uses the exact same recipe and real geometry as the town',p.evaluate('LandmarkUI.model.stats'))
  p.screenshot(path=str(O/'sanctuary-detail.png'))
  p.locator('#omBack').click();wait_city(p);assert p.evaluate('CityUI.layout.name')=='Silverford'
  # Rotate/zoom in the actual scene, preserving model data.
  before=p.evaluate('({az:CityUI.renderer.azimuth,z:CityUI.renderer.zoom,fp:CityUI.layout.fingerprint})')
  canvas=p.locator('#cityCanvas');rect=canvas.bounding_box();cx=rect['width']*.4;cy=rect['height']*.55
  p.keyboard.down('Shift');p.mouse.move(cx,cy);p.mouse.down();p.mouse.move(cx+62,cy+20,steps=2);p.mouse.up();p.keyboard.up('Shift');p.wait_for_function('!CityUI.renderer.pending',timeout=180000)
  p.mouse.wheel(0,-90);p.wait_for_function('!CityUI.renderer.pending',timeout=180000)
  after=p.evaluate('({az:CityUI.renderer.azimuth,z:CityUI.renderer.zoom,fp:CityUI.layout.fingerprint})')
  assert after['fp']==before['fp'] and after['az']!=before['az']
  mark('Town camera rotates and zooms actual 3D geometry, not an illustration')
  # Existing annual simulation works with an open high-detail city.
  p.locator('#step1').click();p.wait_for_function('sim.year===401&&!simAdvancing',timeout=180000);wait_city(p)
  assert fp(p)['physical']==old['physical'];mark('Annual simulation continues from a sacred town without changing geography',401)
  p.locator('#omMoreToggle').click()
  with p.expect_download() as dl:p.locator('[data-command=save]').click()
  save=A/'sacred-world-save.json';dl.value.save_as(str(save));saved=fp(p)
  # Regenerate from the town must not leave stale models or lose civilizations.
  regen(p,'Sacred-world-regression-12')
  a=p.evaluate('generationReport(world,sim)');assert a['realms']>1 and a['towns']>1 and a['layer']=='realms'
  assert p.evaluate("OneMap.scene==='world'&&renderer.visible('settlements')&&renderer.visible('frontiers')")
  mark('Regenerate from a sacred town produces new visible countries and towns',a)
  p.screenshot(path=str(O/'regenerated-world.png'))
  p.locator('#importFile').set_input_files(str(save));p.wait_for_function("world.params.seed==='Aereth-47'&&sim.year===401&&!busy&&window.__ready",timeout=180000);wait_world(p)
  assert fp(p)==saved
  p.locator('#omSearchToggle').click();p.locator('#omSearch').fill('Silverford');p.locator('#omSearchResults .om-enter').first.click();wait_city(p)
  assert p.evaluate("LandmarkCatalog.signature(TownCityBinding.resolve(world,sim,sim.provinces[CityUI.activeId],CityUI.layout,'temple'))")==sig
  mark('Save/load restores the same world, year and in-town sanctuary recipe')
  p.locator('#omBack').click();wait_world(p)
  p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(300);wait_world(p)
  assert p.evaluate('document.documentElement.scrollWidth===innerWidth')
  mark('Single-map mobile shell has no horizontal overflow')
  assert not report['pageErrors'],report['pageErrors'];assert not report['consoleErrors'],report['consoleErrors'];assert not report['network'],report['network']
  mark('No JavaScript errors or external requests during offline integration test')
  b.close()
try:run()
finally:(R/'docs/SANCTUARY_BROWSER_RESULTS.json').write_text(json.dumps(report,indent=2))
