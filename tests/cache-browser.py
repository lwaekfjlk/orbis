from playwright.sync_api import sync_playwright
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1];report={}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1100,'height':780});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.set_content((R/'dist/telluric-onemap.html').read_text(),wait_until='load');p.wait_for_function('window.__ready',timeout=120000)
 print('World ready',flush=True);p.evaluate('CityUI.open(179)');p.wait_for_function('window.__cityReady&&!CityUI.renderer.pending',timeout=120000)
 print('City ready',flush=True);p.evaluate('window.__savedMesh=CityUI.renderer.meshes.buildings;window.__savedPhys=physicalFingerprint(world)')
 p.locator('#step1').click();p.wait_for_function('sim.year===401&&!simAdvancing',timeout=120000)
 assert p.evaluate('CityUI.renderer.meshes.buildings===window.__savedMesh');assert p.evaluate('physicalFingerprint(world)===window.__savedPhys')
 report['timelineReusesGeometry']=True;print('Timeline cache passed',flush=True)
 p.evaluate('(()=>{const c=CityUI.layout,r=CityUI.renderer,p=sim.provinces[c.provinceId];c.environment.signature+="-cache-invalidation-test";r.setCity(c,p,sim.realms[p.owner],sim.cityState?.[p.id]||{})})()');p.wait_for_function('!CityUI.renderer.pending',timeout=120000)
 assert p.evaluate('CityUI.renderer.meshes.buildings!==window.__savedMesh');report['environmentInvalidatesGeometry']=True
 assert not errors;report['pageErrors']=errors
 b.close()
(R/'docs/FINAL_SMOKE.json').write_text(json.dumps(report,indent=2));print(report)
