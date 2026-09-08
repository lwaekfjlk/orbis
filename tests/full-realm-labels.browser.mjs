// Full formal country names must remain printed in the production map DOM.
// TELLURIC_LABEL_URL can point at the source app; otherwise use the offline build.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname),out=process.env.TELLURIC_LABEL_OUTPUT||join(tmpdir(),'telluric-full-country-names');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'telluric-full-name-browser-'));
const child=spawn(process.env.CHROMIUM_PATH||chromium.executablePath(),['--headless','--no-first-run','--no-default-browser-check','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',detached:true});
child.unref();let browser;
try{
 let port;for(let k=0;k<100&&!port;k++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]}catch{await new Promise(r=>setTimeout(r,100))}}
 assert(port,'Chromium did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1480,height:980},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 if(process.env.TELLURIC_LABEL_URL)await page.goto(process.env.TELLURIC_LABEL_URL,{waitUntil:'load',timeout:180000});
 else{await context.setOffline(true);await page.setContent(await readFile(join(root,'dist/telluric-onemap.html'),'utf8'),{waitUntil:'load',timeout:180000})}
 const stable=()=>page.waitForFunction('window.__ready&&!busy&&!simAdvancing&&!renderer.pending&&!ContinuousMap.moving&&!ContinuousMap.layer.loading',null,{timeout:180000});
 await stable();await page.evaluate(()=>document.fonts.ready);
 const measure=()=>page.evaluate(()=>{
  positionLabels();const labels=labelItems.filter(v=>v.feature.town||v.feature.realm!=null).map(({element:e,feature:f})=>{
   const b=e.getBoundingClientRect(),variant=e.dataset.labelVariant||'full',text=e.querySelector(f.town?'em':variant==='compact'?'.realmCompactName':'.realmFullName'),style=getComputedStyle(text);
   return{name:f.name,town:!!f.town,variant,visible:e.style.opacity==='1'&&e.checkVisibility({checkVisibilityCSS:true}),text:text.textContent,printed:text.checkVisibility({checkVisibilityCSS:true}),family:style.fontFamily,fontStyle:style.fontStyle,size:parseFloat(style.fontSize),x:b.x,y:b.y,w:b.width,h:b.height};
  });
  const visible=labels.filter(l=>l.visible),overlaps=[];
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];if(a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1)overlaps.push([a.name,b.name])}
  const pins=[...document.querySelectorAll('#worldLandmarkPins .world-landmark-pin, #omChrome .om-brandbar, #omChrome .om-tools, #omChrome .om-dock, #omChrome .om-camera, #cmStatus')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).map(e=>{const b=e.getBoundingClientRect();return{special:e.dataset.atlasSite,x:b.x,y:b.y,w:b.width,h:b.height}});
  const covered=visible.filter(a=>pins.some(b=>a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1)).map(l=>l.name);
  return{width:renderer.width,height:renderer.height,expectedTowns:sim.provinces.filter(p=>p.settled).length,expectedCountries:sim.realms.filter(c=>c.alive).length,labels,overlaps,covered,pins};
 });
 const report={};
 for(const [width,height] of [[1480,980],[430,900]]){
  await page.setViewportSize({width,height});await page.waitForFunction(width=>renderer.width===width,width);await stable();
  const m=await measure();report[width]=m;await page.screenshot({path:join(out,'full-names-'+width+'.png')});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(m.labels.filter(l=>l.town&&l.visible).length,m.expectedTowns,'every town stays visible');
  assert.equal(m.labels.filter(l=>!l.town&&l.visible).length,m.expectedCountries,'every country stays visible');
  for(const l of m.labels){assert.equal(l.text,l.name,'the printed name must include the formal polity, not just its proper name');assert(l.printed,'the complete name must be painted, not hidden for a tooltip');assert.notEqual(l.variant,'marker');assert(l.family.includes('IM Fell English')&&l.fontStyle==='italic');assert(l.x>=0&&l.x+l.w<=width&&l.y>=0&&l.y+l.h<=height,'a full name was clipped: '+l.name)}
  assert.deepEqual(m.overlaps,[],'full names must occupy separate bounds');assert.deepEqual(m.covered,[],'icons cannot cover complete names');
 }
 await page.evaluate(()=>{document.getElementById('names').checked=false;positionLabels()});assert.equal(await page.locator('#labels').isVisible(),false);
 await page.evaluate(()=>{document.getElementById('names').checked=true;positionLabels()});await stable();
 assert((await measure()).labels.every(l=>l.visible&&l.printed&&l.name===l.text));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k,m])=>[k,{towns:m.expectedTowns,countries:m.expectedCountries,overlaps:m.overlaps,pinCovers:m.covered}]))));
}finally{if(browser)await browser.close();try{process.kill(child.pid,'SIGTERM')}catch{}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
