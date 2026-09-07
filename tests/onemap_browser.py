"""End-to-end OneMap UI checks. Playwright is a test-only dependency.
Run: npm run build && python tests/onemap_browser.py
Uses embedded HTML offline. Does not rely on file:// browser permissions.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, time
R=Path(__file__).resolve().parents[1]
OUT=R/'previews/onemap';OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[], 'pageErrors':[], 'externalRequests':[], 'renderer':'', 'notes':'Screenshots come from the actual offline application.'}
def mark(name,data=True):report['checks'].append({'name':name,'result':data});print('PASS',name,flush=True)
def env(p):return p.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim),year:sim.year})')
def camera(p):return p.evaluate('({target:renderer.target.slice(),zoom:renderer.zoom,azimuth:renderer.azimuth,elevation:renderer.elevation})')
def geom(p,id):return p.locator('#'+id).bounding_box()
def wait(p):p.wait_for_function('!busy&&!simAdvancing&&!renderer.pending',timeout=120000)
def visible_canvases(p):return p.evaluate('Array.from(document.querySelectorAll("canvas")).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden"&&getComputedStyle(e).display!=="none"&&e.checkVisibility({checkVisibilityCSS:true})}).map(e=>e.id)')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=b.new_context(viewport={'width':1536,'height':960},device_scale_factor=1,accept_downloads=True)
 context.set_offline(True);p=context.new_page()
 p.on('pageerror',lambda e:(report['pageErrors'].append(str(e)),print('ERROR',e,flush=True)))
 p.on('request',lambda r:report['externalRequests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
 p.set_content((R/'dist/telluric-onemap.html').read_text(),wait_until='load')
 p.wait_for_function('window.__ready||window.__error',timeout=120000)
 assert p.evaluate('window.__ready&&!window.__error');wait(p)
 assert p.evaluate("currentLayer==='realms'&&sim.realms.length>0&&renderer.visible('settlements')&&renderer.visible('frontiers')&&renderer.meshes.settlements.count>0")
 report['renderer']=p.evaluate('renderer.software?"Canvas software fallback":"WebGL2"')
 assert geom(p,'map')=={'x':0,'y':0,'width':1536,'height':960}
 assert p.evaluate('document.documentElement.scrollHeight===innerHeight&&document.documentElement.scrollWidth===innerWidth')
 assert visible_canvases(p)==['map'],visible_canvases(p)
 assert not p.locator('#omDrawer').is_visible() and not p.locator('#forge').is_visible()
 mark('Full-viewport map, no dashboard or page scroll, one visible map',geom(p,'map'))
 p.screenshot(path=str(OUT/'world.png'))
 baseline=env(p)
 p.locator('#step10').click();p.wait_for_function('sim.year===410&&!simAdvancing');assert env(p)['physical']==baseline['physical'];mark('Advance ten years without changing geography')
 p.locator('#play').click();p.wait_for_function('sim.year>=411');p.locator('#play').click();assert not p.evaluate('playing');year=p.evaluate('sim.year');p.wait_for_timeout(1500);assert p.evaluate('sim.year')==year;mark('Play / pause stops at the current year')
 # Layers stay on the same viewport; the old full dashboard never appears.
 p.locator('#omLayersToggle').click();p.locator('#omLayersPanel [data-layer=realms]').click();wait(p);assert p.evaluate('currentLayer')=='realms';assert not p.locator('#omLayersPanel').is_visible();mark('Political map without a side dashboard')
 p.screenshot(path=str(OUT/'realms.png'))
 p.locator('#omLayersToggle').click();p.locator('#omLayersPanel [data-layer=relief]').click()
 p.locator('#omSearchToggle').click();p.locator('#omSearch').fill('Stonefall');assert 'Stonefall 5' in p.locator('#omSearchResults').inner_text();p.screenshot(path=str(OUT/'search.png'))
 cam=camera(p);physical=env(p)['physical']
 p.locator('#omSearchResults .om-enter').first.click();p.wait_for_function('window.__cityReady||window.__cityError',timeout=120000);assert p.evaluate('!window.__cityError');p.wait_for_function('!CityUI.renderer.pending')
 assert p.evaluate('OneMap.scene')=='city';assert visible_canvases(p)==['cityCanvas'];assert geom(p,'cityCanvas')==geom(p,'map');assert not p.locator('#omDrawer').is_visible();assert p.locator('#play').is_visible();assert env(p)['physical']==physical
 mark('Town drill-down occupies the same viewport with shared time controls',p.evaluate('CityUI.layout.name'))
 p.screenshot(path=str(OUT/'city.png'))
 y=p.evaluate('sim.year');p.locator('#step1').click();p.wait_for_function('(y)=>sim.year===y+1&&!simAdvancing',arg=y);mark('Advance history while looking at the town')
 # Change overlays, not the geography. Include the recent mountain/salt-lake fix.
 signature=p.evaluate('CityUI.layout.environment.signature');p.locator('#omLayersToggle').click();p.locator('#omSetting').click();p.wait_for_function('!CityUI.renderer.pending');assert p.evaluate('CityUI.layout.environment.signature')==signature
 p.screenshot(path=str(OUT/'town-setting.png'))
 mark('Inherited town setting is preserved')
 # Open a genuine city building, then the actual 3D model, not the template gallery.
 building=p.evaluate('CityUI.layout.buildings.find(b=>b.type==="civic").id');p.evaluate('(id)=>CityUI.selectBuilding(id)',building)
 p.locator('#omSelection [data-selection-action="0"]').click();p.wait_for_function('window.__landmarkReady||window.__landmarkError',timeout=60000);assert p.evaluate('!window.__landmarkError');p.wait_for_function('!LandmarkUI.renderer.pending')
 assert p.evaluate('OneMap.scene')=='landmark';assert visible_canvases(p)==['lmCanvas'];assert geom(p,'lmCanvas')==geom(p,'map');assert not p.locator('.lm-library').is_visible();mark('Landmark in same viewport, no asset-library dashboard')
 p.screenshot(path=str(OUT/'landmark.png'))
 p.evaluate('LandmarkUI.selectPart(LandmarkUI.model.parts.find(p=>p.role!=="site").id)');assert p.locator('#omSelection').is_visible();p.locator('#omSelection [data-selection-action="1"]').click();assert p.locator('#omDrawer').is_visible();assert not p.locator('#omWorldDetail').is_visible();p.screenshot(path=str(OUT/'landmark-detail.png'));p.locator('#omDrawerClose').click();p.locator('#omSelectionClose').click();mark('Part detail opens only after explicit selection')
 p.locator('#omBack').click();assert p.evaluate('OneMap.scene')=='city';p.locator('#omBack').click();assert p.evaluate('OneMap.scene')=='world';assert visible_canvases(p)==['map'];assert camera(p)==cam;mark('Back restores the exact world camera')
 # Details and Chronicle are optional, and closing them never reframes the map.
 p.locator('#omMoreToggle').click();p.locator('[data-command=history]').click();assert p.locator('#omDrawer').is_visible();p.screenshot(path=str(OUT/'history.png'));p.locator('#omDrawerClose').click()
 # Save a genuine running timeline via the menu and reuse the downloaded file.
 p.locator('#omMoreToggle').click()
 with p.expect_download() as d:p.locator('[data-command=save]').click()
 save=R/'artifacts/onemap-resume.json';d.value.save_as(save);saved=env(p);mark('Save simulation from the map menu')
 # Regeneration is never a side effect of opening or cancelling its drawer.
 p.locator('#forgeButton').click();assert p.locator('#forge').is_visible();newseed=p.locator('#seed').input_value();assert newseed!=p.evaluate('world.params.seed');assert env(p)==saved;p.evaluate('document.getElementById("toast").classList.add("hidden")');fbox=geom(p,'forge');gbox=geom(p,'generate');assert gbox['x']>=fbox['x'] and gbox['x']+gbox['width']<=fbox['x']+fbox['width'];assert p.evaluate('document.getElementById("forge").scrollWidth===document.getElementById("forge").clientWidth');p.screenshot(path=str(OUT/'regenerate.png'));p.locator('#closeForge').click();assert env(p)==saved;mark('Regenerate drawer proposes a new seed; cancel preserves all state')
 # A successful full regeneration, followed by an actual load of the save.
 p.locator('#forgeButton').click();p.locator('#seed').fill('OneMap-regression-10');p.locator('#generate').click();p.wait_for_function('window.__ready&&world.params.seed==="OneMap-regression-10"&&!busy',timeout=120000);assert p.evaluate("sim.realms.length>0&&sim.provinces.some(p=>p.city)&&renderer.sim===sim&&renderer.visible('settlements')&&renderer.visible('frontiers')&&labelItems.some(x=>x.feature.capital&&x.element.style.opacity==='1')");assert p.evaluate('sim.year')==400;assert env(p)['physical']!=saved['physical'];assert not p.locator('#omDrawer').is_visible();mark('Generate replaces the world and starts at year 400')
 p.locator('#importFile').set_input_files(str(save));p.wait_for_function('(h)=>window.__ready&&!busy&&sim.physicalHash===h',arg=saved['physical'],timeout=120000);assert env(p)==saved,(env(p),saved);mark('Load restores physical, settlement, political and year fingerprints')
 # Narrow viewport: default map only, controls stay within screen and clickable.
 p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(600);wait(p)
 assert p.evaluate('document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight')
 assert geom(p,'map')=={'x':0,'y':0,'width':390,'height':844}
 for id in ['play','step1','step10','forgeButton','omSearchToggle','omLayersToggle','omMoreToggle']:
  box=geom(p,id);assert box and box['x']>=0 and box['x']+box['width']<=390,(id,box)
 p.screenshot(path=str(OUT/'mobile.png'))
 p.locator('#omSearchToggle').click();p.locator('#omSearch').fill('Stonefall');p.locator('#omSearchResults .om-enter').first.click();p.wait_for_function('window.__cityReady',timeout=90000);p.wait_for_function('!CityUI.renderer.pending');assert visible_canvases(p)==['cityCanvas'];p.screenshot(path=str(OUT/'mobile-town.png'));p.locator('#omBack').click()
 mark('390px mobile layout and town navigation without horizontal scrolling')
 assert not report['pageErrors'],report['pageErrors'];assert not report['externalRequests'],report['externalRequests'];mark('Zero application errors and zero network requests')
 (R/'docs/ONEMAP_BROWSER_RESULTS.json').write_text(json.dumps(report,indent=2))
 b.close()
print('ALL PASSED',len(report['checks']),flush=True)
