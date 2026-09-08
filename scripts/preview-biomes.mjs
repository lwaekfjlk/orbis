/** Actual-map terrain comparison: each side runs its own production terrain builder. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scripts} from './manifest.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const flag=process.argv.indexOf('--baseline'),baseline=flag<0?'116f597':process.argv[flag+1];
if(!baseline)throw Error('--baseline requires an existing git revision');
const atBaseline=f=>execFileSync('git',['show',`${baseline}:${f}`],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
const priorScripts=(await import('data:text/javascript;base64,'+Buffer.from(atBaseline('scripts/manifest.mjs')).toString('base64'))).scripts;
const engine=list=>list.slice(0,list.indexOf('src/ui/world-ui.js'));
const current=(await Promise.all(engine(scripts).map(f=>readFile(resolve(root,f),'utf8')))).join('\n');
const prior=engine(priorScripts).map(atBaseline).join('\n');
const exports='return {AtlasRenderer,ContinuousCityLayer,AtlasSpace,CityEnvironment,generateWorld,createCivilization,physicalFingerprint,BIOME,GW,GH,GN};';
// Compile both historical/current module lists before writing a review artifact.
Function(prior+'\n'+exports);Function(current+'\n'+exports);
const defaults={seed:'Aereth-47',form:'global',plates:24,continents:6,islands:1.2,volcanism:.85,uplift:1.2,sea:0,aridity:.85,current:1,erosion:.7,temperature:0,glaciation:1.2};
// These are unmodified cells surveyed in generateWorld(defaults), not fixtures.
const samples=[
 {id:'glacier',name:'厚冰川',x:172,y:155,biome:16,description:'实际陆地冰川：观察冰脊、裂隙和蓝白冰面的层次。'},
 {id:'snow',name:'全年冻结高地',x:252,y:41,biome:3,description:'真实高寒高原，两季均低于 0°C。地图将这里分类为冷荒原，地面保留实际积雪与裸岩混合。'},
 {id:'alpine',name:'无冰高山',x:241,y:109,biome:12,description:'实际高山地面：观察岩层、碎石带和贴合山坡的表面细节。'},
 {id:'sand',name:'沙漠',x:200,y:58,biome:4,description:'实际沙漠地面：观察沙脊、背风坡与顺着起伏变化的材质。'},
 {id:'cold',name:'冷荒原',x:102,y:38,biome:3,description:'实际低温荒地：观察裸地、石质斑块和细小起伏。'},
 {id:'grass',name:'草原',x:239,y:99,biome:5,description:'实际草原地面：观察连续草地斑块，比较特殊地貌与原有草地细节。'}
];
const escape=s=>s.replace(/<\/script/gi,'<\\/script');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbis · 地貌细化对照</title>
<style>*{box-sizing:border-box}body{margin:0;background:#172724;color:#e8e4d6;font:13px/1.5 system-ui,sans-serif}header{padding:23px 28px 17px;border-bottom:1px solid #3a5149}small{font-size:10px;letter-spacing:.22em;color:#bfceb7}h1{font:29px/1.25 Georgia,serif;margin:6px 0 9px}header p{margin:0;color:#b7c4b6}nav{display:flex;flex-wrap:wrap;gap:8px;padding:13px 28px;align-items:center}label{display:flex;gap:8px;align-items:center}label+label{margin-left:14px}select,button{font:inherit;color:#e8e4d6;border:1px solid #5a7065;background:#253c32;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover{background:#415e4b}button[aria-pressed=true]{color:#19372d;background:#d3dab4;border-color:#d3dab4}.views{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#6c8b80}.views[data-mode=before],.views[data-mode=after]{grid-template-columns:1fr}.views[data-mode=before] .panel,.views[data-mode=after] .panel{grid-column:1;grid-row:1}.views[data-mode=before] .panel:last-child,.views[data-mode=after] .panel:first-child{visibility:hidden;pointer-events:none}.panel{min-width:0;position:relative;background:#d4dfd4}.stage{position:relative;height:clamp(440px,65vh,840px)}canvas{width:100%;height:100%;display:block;touch-action:none;outline-offset:-4px}.caption{position:absolute;left:17px;top:15px;color:#253b35;background:#f1f0e4ec;border:1px solid #a2b3a0;padding:6px 10px;border-radius:5px;font-size:11px;letter-spacing:.08em;pointer-events:none;z-index:2}.stats{position:absolute;left:17px;bottom:13px;color:#354f41;background:#eef0e3e8;padding:4px 8px;font-size:11px;border-radius:4px;pointer-events:none}.facts{display:flex;flex-wrap:wrap;gap:12px 28px;margin:0;padding:15px 28px;background:#233b31}.facts div{min-width:115px}.facts dt{font-size:10px;color:#b2c5b2}.facts dd{margin:3px 0 0;color:#f0edda;font-size:14px}footer{padding:16px 28px 20px;display:flex;gap:22px;justify-content:space-between;color:#becbbd}footer p{margin:4px 0}.error{color:#ffc899}#description{color:#d4dfc9}.status-dot{display:inline-block;width:7px;height:7px;background:#bbc798;border-radius:50%;margin-right:8px}@media(max-width:740px){header,nav,.facts,footer{padding-left:14px;padding-right:14px}.views[data-mode=split]{grid-template-columns:1fr}.stage{height:470px}footer{display:block}label+label{margin-left:0}}</style>
<header><small>ORBIS / LANDSCAPE STUDIES</small><h1>同一张地图，走近六种地貌。</h1><p>真实默认世界 Aereth-47。修复前后使用相同地理数据、镜头与光照，直接调用各自版本的地图地形构建器。</p></header>
<nav aria-label="地貌对照选项"><label for="biome">地貌<select id="biome">${samples.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('')}</select></label><button data-view="region" aria-pressed="false">区域</button><button data-view="near" aria-pressed="true">近景</button><button data-view="slope" aria-pressed="false">坡面</button><button id="reset">重置镜头</button><label for="mode">对比<select id="mode"><option value="split">左右对照</option><option value="before">仅修复前</option><option value="after">仅修复后</option></select></label></nav>
<main class="views" data-mode="split" id="views">${[['before','01 / 修复前 · '+baseline],['after','02 / 细化后']].map(([id,label])=>'<section class="panel"><div class="caption">'+label+'</div><div class="stage"><canvas id="'+id+'" tabindex="0" aria-label="'+label+'实际地图地形；拖动旋转，滚轮缩放"></canvas></div><div class="stats" id="'+id+'Stats">等待地形构建</div></section>').join('')}</main>
<dl class="facts" id="facts"><div><dt>数据源</dt><dd>Aereth-47 · 真实地图</dd></div></dl>
<footer><div><p id="status" role="status"><span class="status-dot"></span>正在生成真实地图与聚落保护区域…</p><p id="description">当前预览仅显示地面。城镇、海岸、河湖保护规则仍由生产代码计算。</p></div><div><p>拖动旋转 · Shift + 拖动平移 · 滚轮缩放</p><p>方向键旋转 · +/− 缩放 · 左右镜头同步</p></div></footer>
<script>const Before=(()=>{${escape(prior)}\n${exports}})();const After=(()=>{${escape(current)}\n${exports}})();const Defaults=${JSON.stringify(defaults)},Samples=${JSON.stringify(samples)};</script>
<script>
const E=id=>document.getElementById(id),stages=[];let world=null,sim=null,sample=Samples[0],view='near',baseAzimuth=-.45,timer=null,serial=0,baselineFingerprint=null;
const cameraState={azimuth:-.45,elevation:.68,zoom:190,target:[0,0,0]},frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function fail(error){E('status').textContent=error.message;E('status').className='error';document.body.dataset.ready='error';console.error(error);}
function applyCamera(){for(const s of stages){Object.assign(s.r,{azimuth:cameraState.azimuth,elevation:cameraState.elevation,zoom:cameraState.zoom,target:cameraState.target.slice()});s.r.request();}}
function facts(){const i=sample.y*After.GW+sample.x,n=v=>Number(v).toFixed(1),win=world.seasonTemp[0][i],sum=world.seasonTemp[1][i];
 const rows=[['实际地图格点',sample.x+', '+sample.y+' · cell '+i],['镜头采样点',(sample.x+.37).toFixed(2)+', '+(sample.y+.23).toFixed(2)],['原始地类',After.BIOME[world.biome[i]][0]],['基岩高程',Math.round(world.height[i]).toLocaleString()+' m'],['冰厚',Math.round(world.ice[i])+' m'],['两季气温',n(win)+' / '+n(sum)+' °C']];
 E('facts').innerHTML=rows.map(([key,value])=>'<div><dt>'+key+'</dt><dd>'+value+'</dd></div>').join('');E('description').textContent=sample.description+' 仅显示真实地面；地理数据、聚落与海湖保护保持原样。';
}
function resetCamera(){if(!world)return;const x=sample.x+.37,y=sample.y+.23,h=(xx,yy)=>Before.AtlasSpace.coarseSurface(world,xx,yy,1),e=.06;
 const dx=(h(x+e,y)-h(x-e,y))/(2*e*Before.AtlasSpace.X),dz=(h(x,y+e)-h(x,y-e))/(2*e*Before.AtlasSpace.Z);
 baseAzimuth=Math.hypot(dx,dz)>.025?Math.atan2(-dx,-dz)-.3:-.45;
 const preset={region:[55,1.03],near:[190,.68],slope:[300,.27]}[view];
 cameraState.azimuth=baseAzimuth;cameraState.elevation=preset[1];cameraState.zoom=preset[0];cameraState.target=Before.AtlasSpace.point(world,x,y,1);cameraState.target[1]=h(x,y);
 document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));applyCamera();remesh();
}
async function remesh(){if(!world)return;clearTimeout(timer);const ticket=++serial;document.body.dataset.ready='building';E('status').textContent='正在构建 '+sample.name+' 的真实地形…';await frame();
 try{for(const s of stages){if(ticket!==serial)return;s.layer.buildTerrain();s.r.request();E(s.id+'Stats').textContent=s.layer.terrainTriangles.toLocaleString()+' 个地形三角形 · '+s.layer.terrainDetail+'× 单元细分 · '+cameraState.zoom.toFixed(0)+'× 镜头';await frame();}
  if(ticket!==serial)return;const unchanged=After.physicalFingerprint(world)===baselineFingerprint;if(!unchanged)throw Error('地形预览意外修改了源地理数据');
  E('status').textContent=sample.name+' · 同镜头、同光照；两侧均为实际地图地形。';E('status').className='';document.body.dataset.ready='true';
  window.__biomePreview={ready:true,sample:sample.id,source:{seed:Defaults.seed,x:sample.x,y:sample.y,biome:After.BIOME[world.biome[sample.y*After.GW+sample.x]][0]},view,camera:structuredClone(cameraState),fingerprint:baselineFingerprint,unchanged,terrain:stages.map(s=>({side:s.id,triangles:s.layer.terrainTriangles,detail:s.layer.terrainDetail})),samples:Samples.map(s=>({id:s.id,x:s.x,y:s.y}))};
 }catch(error){fail(error);}
}
function schedule(){clearTimeout(timer);timer=setTimeout(remesh,170);}
function move(dx,dy,multiplier=1){cameraState.azimuth+=dx;cameraState.elevation=Math.max(.17,Math.min(1.5,cameraState.elevation+dy));cameraState.zoom=Math.max(24,Math.min(620,cameraState.zoom*multiplier));applyCamera();schedule();}
function pan(dx,dy){if(!world)return;const r=stages[0].r;r.updateCamera();const unit=2*r.halfW/r.width,fx=-Math.sin(cameraState.azimuth),fz=-Math.cos(cameraState.azimuth);
 cameraState.target[0]-=dx*unit*r.right[0]+dy*unit*fx;cameraState.target[2]-=dx*unit*r.right[2]+dy*unit*fz;
 const q=Before.AtlasSpace.grid(cameraState.target[0],cameraState.target[2]);cameraState.target[1]=Before.AtlasSpace.coarseSurface(world,...q,1);applyCamera();schedule();
}
async function start(){try{document.body.dataset.ready='loading';await frame();world=await After.generateWorld(Defaults);sim=After.createCivilization(world,{realms:18,historySeed:'First-dawn'});baselineFingerprint=After.physicalFingerprint(world);
 for(const q of Samples){const i=q.y*After.GW+q.x;if(world.biome[i]!==q.biome||world.height[i]<=0||world.lake[i]>0)throw Error('固定样本 '+q.id+' 与默认世界不再匹配，请重新勘选真实格点。');}
 if(Math.max(world.seasonTemp[0][41*After.GW+252],world.seasonTemp[1][41*After.GW+252])>=0)throw Error('全年冻结样本不再满足真实气候条件。');
 for(const [api,id] of [[Before,'before'],[After,'after']]){const canvas=E(id),r=new api.AtlasRenderer(canvas),layer=new api.ContinuousCityLayer(r);r.world=world;r.sim=sim;r.layer='relief';r.relief=1;r.selected=-1;r.continuousLayer=layer;
  r.options={trees:false,volcanoes:false,rivers:false,borders:false,wind:false,ice:false,legends:false,settlements:false,frontiers:false};r.ground=(x,y)=>layer.ground(x,y);r.buildTerrain=()=>layer.buildTerrain();layer.reset(world,sim);layer.natural=true;layer.prepareLandscape();stages.push({api,id,r,layer});
  let drag=null;canvas.addEventListener('pointerdown',event=>{drag=[event.clientX,event.clientY];canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag[0],dy=event.clientY-drag[1];drag=[event.clientX,event.clientY];if(event.shiftKey)pan(dx,dy);else move(-dx*.006,dy*.004);});
  for(const name of['pointerup','pointercancel'])canvas.addEventListener(name,()=>drag=null);
  canvas.addEventListener('wheel',event=>{event.preventDefault();move(0,0,Math.exp(-event.deltaY*.001));},{passive:false});
  canvas.addEventListener('keydown',event=>{const keys={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.08],ArrowDown:[0,-.08],'+':[0,0,1.15],'=':[0,0,1.15],'-':[0,0,1/1.15]};if(keys[event.key]){event.preventDefault();move(...keys[event.key]);}});
 }
 facts();resetCamera();
 }catch(error){fail(error);}}
E('biome').addEventListener('change',()=>{sample=Samples.find(s=>s.id===E('biome').value);if(world){facts();resetCamera();}});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;resetCamera();}));E('reset').addEventListener('click',resetCamera);
E('mode').addEventListener('change',()=>{E('views').dataset.mode=E('mode').value;for(const s of stages)s.r.resize();applyCamera();schedule();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{for(const s of stages)s.r.resize();applyCamera();schedule();},120);});start();
</script></html>`;
const directory=resolve(root,'previews/biomes');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'index.html'),html);
console.log(`Built previews/biomes/index.html (${(Buffer.byteLength(html)/1024).toFixed(0)} KiB, baseline ${baseline})`);
