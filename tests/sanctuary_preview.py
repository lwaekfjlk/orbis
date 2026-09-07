from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time
R=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page(viewport={'width':1600,'height':1050},device_scale_factor=1);p.on('pageerror',lambda e:print('PAGE ERROR',e,flush=True))
 p.set_content((R/'dist/telluric-onemap.html').read_text(),wait_until='load');p.wait_for_function('window.__ready||window.__error',timeout=150000)
 print('World ready',p.evaluate('sim.realms.length'),flush=True)
 p.evaluate('CityUI.open(213)');p.wait_for_function('window.__cityReady||window.__cityError',timeout=150000)
 print('city ready',p.evaluate('({err:window.__cityError,buildings:CityUI.layout.buildings.length,tri:Object.values(CityUI.renderer.meshes).reduce((n,m)=>n+m.count/3,0)})'),flush=True)
 p.wait_for_function('!CityUI.renderer.pending',timeout=180000)
 p.screenshot(path=str(R/'previews/sanctuary/silverford-city.png'))
 p.evaluate('CityUI.renderer.focusBuilding(CityUI.layout.buildings.find(b=>b.sacred))');p.wait_for_function('!CityUI.renderer.pending',timeout=180000)
 p.screenshot(path=str(R/'previews/sanctuary/silverford-close.png'))
 print('screenshots done',flush=True)
 b.close()
