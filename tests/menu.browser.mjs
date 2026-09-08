// Real production events on the source app (run npm run dev first). Optional
// TELLURIC_MENU_URL, PLAYWRIGHT_MODULE, CHROMIUM_PATH and TELLURIC_MENU_OUTPUT
// select the local server, browser runtime and evidence directory.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.TELLURIC_MENU_OUTPUT||join(tmpdir(),'telluric-menu-qa');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'telluric-menu-browser-'));
const child=spawn(process.env.CHROMIUM_PATH||chromium.executablePath(),['--headless','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',detached:true});
child.unref();let browser;
try{
 let port;
 for(let k=0;k<100&&!port;k++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await new Promise(r=>setTimeout(r,100));}}
 assert(port,'Chromium did not start');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[],failures=[],checks=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:180000});
 await page.goto(process.env.TELLURIC_MENU_URL||'http://127.0.0.1:5173',{waitUntil:'load',timeout:180000});
 await stable();
 const panel=page.locator('#omLayersPanel'),toggle=page.locator('#omLayersToggle');
 let viewport;
 const remainsOpen=async action=>{
  const visible=await panel.isVisible(),expanded=await toggle.getAttribute('aria-expanded');
  checks.push({viewport,action,visible,expanded});
  console.log(`${viewport}: ${action} — panel ${visible?'open':'closed'}`);
  if(!visible||expanded!=='true')failures.push(`${viewport}: ${action} unexpectedly dismissed the layers panel`);
  // Continue through every input on both screen sizes, even on a failing build.
  if(!visible)await toggle.click();
 };
 const closed=async action=>{
  assert.equal(await panel.isVisible(),false,`${viewport}: ${action} must dismiss the panel`);
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  checks.push({viewport,action,visible:false,expanded:'false'});
 };
 for(const size of[{width:1480,height:980},{width:430,height:900},{width:320,height:844}]){
  viewport=`${size.width}x${size.height}`;
  await page.setViewportSize(size);await page.waitForFunction(w=>renderer.width===w,size.width);await stable();
  const header=await page.evaluate(()=>{
   const brand=document.getElementById('omHome'),github=document.getElementById('omGitHub'),tools=document.querySelector('.om-tools');
   const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
   const hit=e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));};
   return{text:brand.innerText,brand:box(brand),github:box(github),tools:box(tools),href:github.href,target:github.target,rel:github.rel,brandHit:hit(brand),githubHit:hit(github),viewportWidth:innerWidth};
  });
  assert.equal(header.text,'TELLURIC');assert.equal(header.href,'https://github.com/lwaekfjlk/telluric');assert.equal(header.target,'_blank');assert(header.rel.includes('noopener'));
  assert(header.brandHit&&header.githubHit,'both brand and GitHub must receive their own pointer input');
  assert(header.brand.x>=0&&header.github.x+header.github.width<=size.width,'branding must fit the narrow header');
  assert(header.github.x+header.github.width<=header.tools.x||header.github.y+header.github.height<=header.tools.y,'branding and map tools must not overlap');
  checks.push({viewport,action:'brand and GitHub visible, separate hit targets',...header});
  await toggle.click();await remainsOpen('toggle open');
  const bounds=await panel.boundingBox();
  assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width&&bounds.y+bounds.height<=size.height,'the whole layer panel must be reachable');
  await panel.locator('.om-eyebrow').first().click();await remainsOpen('panel interior click');
  await panel.click({position:{x:10,y:25}});await remainsOpen('panel padding click');
  for(const layer of['relief','faiths','realms']){
   await panel.locator(`[data-layer="${layer}"]`).click();await stable();
   assert.equal(await page.evaluate('currentLayer'),layer);assert.equal(await page.evaluate('renderer.layer'),layer);
   assert.equal(await panel.locator(`[data-layer="${layer}"]`).getAttribute('aria-selected'),'true');
   await remainsOpen(`layer ${layer}`);
  }
  await page.locator('#moreLayer').click();await remainsOpen('native select popup open');
  await page.keyboard.press('Enter');await remainsOpen('native select popup committed');
  await page.locator('#moreLayer').selectOption('water');await stable();
  assert.equal(await page.locator('#moreLayer').inputValue(),'water');assert.equal(await page.evaluate('renderer.layer'),'water');
  await remainsOpen('more-layer water selection');
  await page.locator('#moreLayer').selectOption('plates');await stable();
  assert.equal(await page.evaluate('renderer.layer'),'plates');await remainsOpen('more-layer change event');
  for(const id of['frontiers','roads','rivers','trees']){
   const box=page.locator('#'+id),before=await box.isChecked();
   await box.locator('..').click();await stable();
   assert.equal(await box.isChecked(),!before);assert.equal(await page.evaluate(id=>renderer.options[id],id),!before);
   await remainsOpen(`${id} checkbox label`);
   await box.locator('..').click();await stable();
  }
  for(const camera of['overhead','relief']){
   await page.locator('#camera').selectOption(camera);await stable();
   assert.equal(await page.locator('#camera').inputValue(),camera);await remainsOpen(`camera ${camera}`);
  }
  await page.evaluate(()=>OneMap.onWorldUpdate());await remainsOpen('same-world update');
  await panel.locator('[data-layer="realms"]').click();await stable();await remainsOpen('return to realms');
  await page.screenshot({path:join(out,`layers-${viewport}.png`)});
  await toggle.click();await closed('toggle closed');
  await toggle.click();await page.keyboard.press('Escape');await closed('Escape');
  assert.equal(await page.evaluate('document.activeElement.id'),'omLayersToggle','Escape returns focus to the trigger');
  await toggle.click();await page.mouse.click(size.width/2,size.height*.75);await stable();await closed('outside map click');
  await toggle.click();await page.locator('#omSearchToggle').click();
  await closed('switch to search');assert.equal(await page.locator('#omSearchPanel').isVisible(),true);
  assert.equal(await page.evaluate('document.activeElement.id'),'omSearch');
  await page.locator('#omMoreToggle').click();
  assert.equal(await page.locator('#omSearchPanel').isVisible(),false);assert.equal(await page.locator('#omMorePanel').isVisible(),true);
  await toggle.click();assert.equal(await page.locator('#omMorePanel').isVisible(),false);await remainsOpen('switch back from more menu');
  await page.keyboard.press('Escape');await closed('final Escape');
 }
 const report={checks,failures,errors,out};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 assert.deepEqual(errors,[],'production page must have no JavaScript errors');
 assert.deepEqual(failures,[],'all in-panel changes must retain the layers menu');
}finally{
 if(browser)await browser.close();
 try{process.kill(child.pid,'SIGTERM');}catch{}
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
