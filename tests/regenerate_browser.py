"""Regressions for the terrain-only Regenerate bug. Test-only: pip install playwright.
Run after npm run build: python tests/regenerate_browser.py
Optional: TELLURIC_GPU=1 exercises Chromium SwiftShader WebGL2 (not a hardware GPU).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
R=Path(__file__).resolve().parents[1]
OUT=R/'previews/regenerate';OUT.mkdir(parents=True,exist_ok=True)
ART=R/'artifacts';ART.mkdir(parents=True,exist_ok=True)
report={'checks':[], 'pageErrors':[], 'unexpectedConsoleErrors':[], 'externalRequests':[], 'generations':[]}

def mark(name,data=True):
 report['checks'].append({'name':name,'result':data});print('PASS',name,flush=True)
def wait(p):
 p.wait_for_function('window.__ready && !busy && !simAdvancing && !renderer.pending',timeout=180000)
def fingerprint(p):
 return p.evaluate('({physical:physicalFingerprint(world),settlements:settlementFingerprint(sim),politics:politicalFingerprint(sim),year:sim.year,seed:world.params.seed})')
def audit(p):
 wait(p)
 a=p.evaluate('''() => ({...generationReport(world,sim), software:!!renderer.software,
  labels:labelItems.filter(x=>x.feature.realm!=null && x.element.style.opacity==='1').length,
  checks:auditCivilization(sim,world),scene:OneMap.scene,
  domRealms:document.querySelectorAll('#realmList [data-realm]').length,
  onlyMap:Array.from(document.querySelectorAll('canvas')).filter(e=>e.checkVisibility({checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0).map(e=>e.id)})''')
 assert a['realms']>1 and a['towns']>1,a
 assert a['rendererBound'] and a['layer']=='realms',a
 assert a['settlementsVisible'] and a['frontiersVisible'],a
 assert a['settlementVertices']>0 and a['frontierVertices']>0,a
 assert a['labels']>0 and a['domRealms']==a['realms'],a
 assert a['scene']=='world' and a['onlyMap']==['map'],a
 for k in ['invalidOwners','badPop','badShares','badCapitals','waterClaims','routeErrors']:assert a['checks'][k]==0,(k,a)
 assert a['checks']['finiteRealms'],a
 assert not p.locator('#loading').is_visible()
 return a

def regen(p,seed=None,extra=None):
 p.locator('#forgeButton').click()
 if seed:p.locator('#seed').fill(seed)
 seed=p.locator('#seed').input_value()
 if extra:
  p.evaluate('(fields)=>{for(const [id,v] of Object.entries(fields))document.getElementById(id).value=v;forgeOutputs()}',extra)
 p.locator('#generate').click()
 p.wait_for_function('(seed)=>window.__error || (window.__ready && !busy && world.params.seed===seed)',arg=seed,timeout=180000)
 assert not p.evaluate('window.__error'),p.evaluate('window.__error')
 a=audit(p);assert a['year']==400
 report['generations'].append(a);return a

with sync_playwright() as pw:
 args=['--no-sandbox','--disable-dev-shm-usage']
 if os.environ.get('TELLURIC_GPU')=='1':args+=['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=args)
 ctx=b.new_context(viewport={'width':1440,'height':900},device_scale_factor=1,accept_downloads=True)
 ctx.set_offline(True);p=ctx.new_page()
 p.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 p.on('console',lambda m:report['unexpectedConsoleErrors'].append(m.text) if m.type=='error' and 'REGRESSION_INJECTED' not in m.text else None)
 p.on('request',lambda r:report['externalRequests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
 p.set_content((R/'dist/telluric-onemap.html').read_text(),wait_until='load')
 p.wait_for_function('window.__ready || window.__error',timeout=180000)
 assert not p.evaluate('window.__error'),p.evaluate('window.__error')
 a=audit(p);report['renderer']='Canvas software fallback' if a['software'] else 'WebGL2 via Chromium SwiftShader'
 mark('Initial map visibly includes countries, towns, borders and clickable country labels',a)
 saved=fingerprint(p);p.locator('#forgeButton').click();p.locator('#closeForge').click();assert fingerprint(p)==saved
 mark('Opening and cancelling Regenerate do not mutate world or history')
 # Reproduce precisely the legacy diagnosis: diagnostic view / hidden overlays retained.
 p.locator('#omLayersToggle').click();p.locator('#moreLayer').select_option('plates')
 p.evaluate("['frontiers','settlements','names'].forEach(id=>{const e=document.getElementById(id);e.checked=false;e.dispatchEvent(new Event('change'))})")
 a=regen(p,'OneMap-regression-10');assert a['realms']==36 and a['towns']==92
 mark('Regenerate from plate view with all civilization overlays off restores living world',a)
 p.screenshot(path=str(OUT/'regenerated-world.png'))
 # Plain landscape can be used without making cities disappear.
 p.locator('#omLayersToggle').click();p.locator('#omLayersPanel [data-layer=relief]').click();wait(p)
 assert p.evaluate("renderer.visible('settlements') && renderer.visible('frontiers')")
 assert p.evaluate("labelItems.some(x=>sim.provinces.some(p=>p.settled&&p.i===x.feature.i))")
 mark('Natural landscape retains settlement symbols, names and optional borders')
 # Actual random seed button workflow, followed by a fixed repeat.
 random_a=regen(p);mark('A randomly proposed seed still produces a visible civilization',random_a)
 a=regen(p,'Regen-Civilization-02');fp=fingerprint(p);mark('Consecutive regeneration has new model references, not stale civilization',a)
 a2=regen(p,'Regen-Civilization-02');assert fingerprint(p)==fp;mark('Same seed rebuilds the same geography, settlements and states')
 # No artificial kingdom quotas are introduced under different permitted settings.
 a=regen(p,'Regen-Cold-03',{'temperatureInput':'-5','continentInput':'8'});mark('Cold eight-province world retains visible geography-first civilization',a)
 # Enter a newly generated town through actual search UI; check correct world binding.
 town=p.evaluate('sim.provinces.find(p=>p.city&&p.owner>=0).name');seed=p.evaluate('world.params.seed')
 p.locator('#omSearchToggle').click();p.locator('#omSearch').fill(town)
 p.locator('#omSearchResults .om-enter').first.click();p.wait_for_function('window.__cityReady || window.__cityError',timeout=180000)
 assert not p.evaluate('window.__cityError'),p.evaluate('window.__cityError')
 p.wait_for_function('!CityUI.renderer.pending',timeout=180000)
 assert p.evaluate('CityUI.layout.source.worldSeed')==seed
 assert p.evaluate('OneMap.scene')=='city';mark('Newly generated city can be entered and uses the new world, not a cached old town')
 a=regen(p,'Regen-From-Town-04',{'temperatureInput':'0','continentInput':'6'});mark('Regenerate from a city returns to the populated world viewport',a)
 p.locator('#step10').click();p.wait_for_function('sim.year===410&&!simAdvancing',timeout=180000);a=audit(p);mark('History advances normally after repeated regeneration',a['year'])
 # Save / load via the actual download and file-input controls.
 p.locator('#omMoreToggle').click()
 with p.expect_download() as download:p.locator('[data-command=save]').click()
 save=ART/'regenerate-resume.json';download.value.save_as(str(save));fp=fingerprint(p)
 regen(p,'Regen-After-Save-05')
 p.locator('#importFile').set_input_files(str(save));p.wait_for_function('(seed)=>!busy&&world.params.seed===seed&&sim.year===410',arg=fp['seed'],timeout=180000)
 audit(p);assert fingerprint(p)==fp;mark('Save from a regenerated world reloads its civilization and year')
 # Fault injection is isolated to this browser context; no test hooks in production.
 old=fingerprint(p);p.evaluate("()=>{window.__oldCreate=createCivilization;createCivilization=()=>{throw Error('REGRESSION_INJECTED civilization failure')}}")
 p.locator('#forgeButton').click();p.locator('#seed').fill('Injected-Failure');p.locator('#generate').click();p.wait_for_function('window.__error && !busy',timeout=180000)
 p.evaluate('()=>{createCivilization=window.__oldCreate;delete window.__oldCreate}');audit(p);assert fingerprint(p)==old
 mark('Civilization generation error preserves the previous complete map and timeline')
 # Also fail after model generation, during a mesh rebuild; restoration must be atomic.
 p.evaluate("()=>{window.__oldMesh=renderer.buildCivilization;renderer.buildCivilization=function(){renderer.buildCivilization=window.__oldMesh;delete window.__oldMesh;throw Error('REGRESSION_INJECTED render attachment failure')}}")
 p.locator('#forgeButton').click();p.locator('#seed').fill('Injected-Render-Failure');p.locator('#generate').click();p.wait_for_function('window.__error && !busy',timeout=180000)
 audit(p);assert fingerprint(p)==old;mark('Mesh attachment failure also rolls back to previous population, borders and history')
 a=regen(p,'Regen-Recovery-06');mark('A new attempt succeeds after failure without reloading the application',a)
 p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(400);wait(p)
 assert p.evaluate('document.documentElement.scrollWidth===innerWidth')
 for id in ['play','step1','step10','forgeButton']:
  q=p.locator('#'+id).bounding_box();assert q and q['x']>=0 and q['x']+q['width']<=391,(id,q)
 mark('Single-map mobile UI and controls remain usable')
 p.screenshot(path=str(OUT/'mobile-regenerated.png'))
 assert not report['pageErrors'],report['pageErrors']
 assert not report['unexpectedConsoleErrors'],report['unexpectedConsoleErrors']
 assert not report['externalRequests'],report['externalRequests']
 mark('No unexpected JavaScript errors or external requests')
 suffix='GPU' if os.environ.get('TELLURIC_GPU')=='1' else 'SOFTWARE'
 (R/f'docs/REGENERATE_BROWSER_{suffix}.json').write_text(json.dumps(report,indent=2))
 print('ALL PASSED',len(report['checks']),flush=True);b.close()
