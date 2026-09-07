/** Standalone, synchronized mesh comparison. Both sides use the same renderer/camera. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scripts } from './manifest.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const baselineIndex=process.argv.indexOf('--baseline');
const baseline=baselineIndex<0?null:process.argv[baselineIndex+1];
if(baselineIndex>=0&&!baseline)throw Error('--baseline requires an existing git revision');
const outputIndex=process.argv.indexOf('--output');
const outputDirectory=outputIndex<0?'previews/architecture':process.argv[outputIndex+1];
if(!outputDirectory)throw Error('--output requires a directory');
const engineFiles=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js'));
const current=(await Promise.all(engineFiles.map(f=>readFile(resolve(root,f),'utf8')))).join('\n');
// A historical revision must use its own module list: newer modules may not exist there.
const atBaseline=f=>execFileSync('git',['show',`${baseline}:${f}`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const priorScripts=baseline?(await import('data:text/javascript;base64,'+Buffer.from(atBaseline('scripts/manifest.mjs')).toString('base64'))).scripts:scripts;
const priorFiles=priorScripts.slice(0,priorScripts.indexOf('src/ui/world-ui.js'));
const prior=baseline?priorFiles.map(atBaseline).join('\n'):current;
const exports='return {LandmarkCatalog,LandmarkKit,LandmarkTemplates,SacredCityKit,ArtisanCityKit,createLandmarkRenderer,exportGeometryGLB};';
const escapeScript=s=>s.replace(/<\/script/gi,'<\\/script');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Telluric · 建筑精修对照</title>
<style>*{box-sizing:border-box}body{margin:0;background:#18211f;color:#e4e0d0;font:13px/1.5 system-ui,sans-serif}header{padding:24px 30px 18px;border-bottom:1px solid #3b4841}small{font-size:10px;letter-spacing:.22em;color:#c9ae78}h1{font:30px/1.25 Georgia,serif;margin:5px 0 8px}header p{margin:0;color:#aab5a9}nav{display:flex;gap:8px;flex-wrap:wrap;padding:14px 30px;align-items:center}button,select{font:inherit;color:#e4e0d0;border:1px solid #576558;background:#25342e;border-radius:6px;padding:7px 12px;cursor:pointer}button:hover{background:#425548}button[aria-pressed=true]{background:#d6c59b;color:#25342e;border-color:#d6c59b}label{margin-left:8px}.views{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#a1a58e}.panel{position:relative;background:#eeeae0}.stage{height:clamp(420px,66vh,900px);position:relative}.stage canvas{display:block;width:100%;height:100%;touch-action:none;outline-offset:-4px}.caption{position:absolute;left:20px;top:15px;z-index:1;color:#4b514a;font-size:11px;letter-spacing:.13em;pointer-events:none}.stats{position:absolute;left:20px;bottom:12px;background:#eeece5ee;padding:4px 7px;border-radius:3px;color:#60685a;font:11px/1.4 system-ui;pointer-events:none}.note{padding:17px 30px;display:flex;gap:30px;justify-content:space-between;color:#adb5a6}.error{color:#ffd6b1}.swatch{width:8px;height:8px;display:inline-block;border-radius:50%;background:#cebc89;margin-right:8px}@media(max-width:700px){header,nav,.note{padding-left:16px;padding-right:16px}.views{grid-template-columns:1fr}.stage{height:440px}.note{display:block}}</style>
<header><small>TELLURIC / ARCHITECTURAL STUDIES</small><h1>逐座精修，覆盖全部奇观。</h1><p>15 种 wonder 全部列入。同一配方、镜头与光照，对照每座建筑的主体结构与特色构件。</p></header>
<nav><select id="model" aria-label="建筑样式"><optgroup label="全部 15 种奇观"><option value="cathedral">圣殿 · 黎明大教堂</option><option value="grove-sanctuary" selected>古树圣所</option><option value="sky-crystal">天穹晶石</option><option value="dread-keep">恐惧堡垒</option><option value="deep-city">深城</option><option value="suspended-tower">悬浮塔</option><option value="dragon-court">龙庭</option><option value="forge-hollow">熔炉深坑</option><option value="gilded-palace">镀金王庭</option><option value="sunless-well">无光之井</option><option value="reed-throne">芦苇王座</option><option value="whale-moot">鲸骨议事厅</option><option value="sky-court">苍穹王庭</option><option value="water-pagoda">水上宝塔</option><option value="tide-palace">潮汐宫</option></optgroup><optgroup label="住宅与公共建筑"><option value="mountain">山地议政厅</option><option value="river">河谷官邸</option><option value="house-river">河谷石屋</option><option value="house-fjord">北境长屋</option><option value="house-desert">沙漠院落</option></optgroup></select>
<button data-view="overall" aria-pressed="true">整体</button><button data-view="front" aria-pressed="false">正立面</button><button data-view="detail" aria-pressed="false">入口细部</button><button data-view="rear" aria-pressed="false">背面</button><button data-view="plan" aria-pressed="false">俯视</button><label><input id="roofs" type="checkbox" checked> 显示屋顶</label><button id="export">导出精修模型 GLB</button></nav>
<div class="views"><section class="panel"><span class="caption">01 / 原有模型</span><div class="stage"><canvas id="before" tabindex="0" aria-label="原有建筑三维模型；拖动旋转，滚轮缩放"></canvas></div><div class="stats" id="beforeStats">正在构建…</div></section><section class="panel"><span class="caption">02 / 精修模型</span><div class="stage"><canvas id="after" tabindex="0" aria-label="精修建筑三维模型；拖动旋转，滚轮缩放"></canvas></div><div class="stats" id="afterStats">正在构建…</div></section></div>
<div class="note"><span id="status" role="status"><i class="swatch"></i>正在载入三维模型</span><span>拖动旋转 · 滚轮缩放 · 左右镜头同步</span></div>
<script>const Before=(()=>{${escapeScript(prior)}\n${exports}})();const After=(()=>{${escapeScript(current)}\n${exports}})();</script>
<script>
const stages=[], E=id=>document.getElementById(id);let view='overall',active='cathedral';
const info={cathedral:'已精修的门廊、花窗、钟楼、飞扶壁与后殿',
 'grove-sanctuary':'分枝承座、可行走的树冠桥与分层叶顶',
 'sky-crystal':'晶石承架、金属环座与观测廊',
 'dread-keep':'防御门楼、挑檐墙道与分节角冠',
 'deep-city':'真实凿开的巨门、内凹隧道与断开的侧廊',
 'suspended-tower':'断口、悬浮阶梯、抱箍与灯室',
 'dragon-court':'连续弯曲的厅堂、屋面与龙形门冠',
 'forge-hollow':'可见的坑底、封闭石壁、下行阶梯与熔炉',
 'gilded-palace':'落座的金屋顶、柱廊与宫廷阳台',
 'sunless-well':'真正敞开的井口、连续盘旋阶与深井壁龛',
 'reed-throne':'桩基斜撑、木构厅堂与屋顶气楼',
 'whale-moot':'曲面鲸骨拱、覆顶与议事地坪',
 'sky-court':'弧垂毡篷、桅杆节点与圆形帐厅',
 'water-pagoda':'层层斗拱、曲面挑檐与连贯水阶',
 'tide-palace':'水门、码头、阳台与临水廊道',mountain:'基座、门洞与分层立面',river:'门廊、窗台、柱式与屋脊','house-river':'门窗深度、山墙与屋面厚度','house-fjord':'木材连接、北境屋面与入口','house-desert':'遮阳、院落入口与平屋顶收口'};
const detailViews={
 'grove-sanctuary':[[0,17,-3],1.8,.34], 'sky-crystal':[[0,19,0],1.8,.28],
 'dread-keep':[[0,8,14],2.2,.15], 'deep-city':[[0,12,-8],2.0,.12],
 'suspended-tower':[[0,20,0],1.9,.2], 'dragon-court':[[0,8,5],2.1,.22],
 'forge-hollow':[[0,-2,0],2.0,1.10], 'gilded-palace':[[0,11,-7],2.3,.24],
 'sunless-well':[[0,-8,0],1.7,1.18], 'reed-throne':[[0,11,-1],2.3,.25],
 'whale-moot':[[0,7,1],2.1,.4], 'sky-court':[[0,9,0],2.0,.55],
 'water-pagoda':[[0,19,0],1.7,.26], 'tide-palace':[[0,6,17],2.0,.25]};
function build(api,key){
 const house=key.startsWith('house-'),style=house?key.slice(6):['mountain','river'].includes(key)?key:'basilica';
 const recipe=api.LandmarkCatalog.recipe(style,'Architectural-study-47',{faith:key==='astral'?'stars':'sun',complexity:1,variant:1,crown:'native',geography:{freshwater:.7,cold:style==='fjord',forest:key==='grove-sanctuary',elevation:350}});
 if(house){const k=new api.LandmarkKit(recipe,{lod:2});k.palette=api.ArtisanCityKit.palettes[style];k.climate={...api.ArtisanCityKit.neutralClimate,...(style==='fjord'?{cold:.7,load:.5}:style==='desert'?{warm:.8,dry:.8}:{})};k.part('house','Representative house','architecture',()=>api.ArtisanCityKit.house(k,0,0,0,7,8,8,style,1));return k.finish();}
 if(['mountain','river'].includes(key))return api.ArtisanCityKit.precinct({...recipe,urbanStyle:key,artisan:true},{lod:1});
 return api.SacredCityKit.build({...recipe,sacred:true,wonder:key==='astral'?'cathedral':key},{lod:1});
}
function camera(){
 const lo=[0,1,2].map(i=>Math.min(...stages.map(s=>s.model.bounds.min[i]))),hi=[0,1,2].map(i=>Math.max(...stages.map(s=>s.model.bounds.max[i]))),house=active.startsWith('house-');const width=hi[0]-lo[0],height=hi[1]-lo[1],depth=hi[2]-lo[2];
 for(const {r} of stages){r.azimuth=view==='front'||view==='detail'?0:view==='rear'?Math.PI+.5:-.6;r.elevation=view==='plan'?1.48:view==='detail'?.06:view==='front'?.10:['sunless-well','forge-hollow'].includes(active)?1.06:.52;
  r.target=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
  const aspect=r.width/r.height,ca=Math.cos(r.azimuth),sa=Math.sin(r.azimuth),ce=Math.cos(r.elevation),se=Math.sin(r.elevation),right=[ca,0,-sa],up=[-sa*se,ce,-ca*se];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const stage of stages)for(const part of stage.model.parts){const d=part.geometry.data;for(let i=0;i<d.length;i+=9){const x=d[i]*right[0]+d[i+2]*right[2],y=d[i]*up[0]+d[i+1]*up[1]+d[i+2]*up[2];minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
  const tx=r.target.reduce((v,t,i)=>v+t*right[i],0),ty=r.target.reduce((v,t,i)=>v+t*up[i],0);
  r.target=r.target.map((t,i)=>t+right[i]*((minX+maxX)/2-tx)+up[i]*((minY+maxY)/2-ty));
  r.zoom=Math.max(29,42/aspect)/(Math.max(maxY-minY,(maxX-minX)/aspect)*.56);
  if(view==='detail'){const cathedral=['cathedral','astral'].includes(active);r.target=[0,cathedral?15:lo[1]+height*.36,cathedral?6.5:hi[2]*.65];r.zoom=cathedral?2.2:house?6:3.1;if(detailViews[active]){const [target,zoom,elevation]=detailViews[active];r.target=[...target];r.zoom=zoom;r.elevation=elevation;}}
  r.request();
 }
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
}
function load(){try{active=E('model').value;E('status').textContent='正在构建…';for(const stage of stages){stage.model=build(stage.api,active);stage.r.setModel(stage.model);E(stage.id+'Stats').textContent=stage.model.stats.triangles.toLocaleString()+' triangles · '+stage.model.parts.length+' mesh groups';}camera();E('status').textContent=info[active];E('status').className='';document.body.dataset.ready='true';}catch(e){E('status').textContent=e.message;E('status').className='error';document.body.dataset.ready='error';console.error(e);}}
for(const [api,id] of [[Before,'before'],[After,'after']]){const canvas=E(id),r=After.createLandmarkRenderer(canvas);r.backgroundHex='#eeece5';stages.push({api,id,r,model:null});let down=null;
 canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-down[0],dy=e.clientY-down[1];down=[e.clientX,e.clientY];for(const s of stages){s.r.azimuth-=dx*.007;s.r.elevation=Math.max(.05,Math.min(1.5,s.r.elevation+dy*.005));s.r.request();}});
 for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>down=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();for(const s of stages){s.r.zoom=Math.max(.2,Math.min(15,s.r.zoom*Math.exp(-e.deltaY*.001)));s.r.request();}},{passive:false});
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();for(const s of stages){if(e.key==='ArrowLeft')s.r.azimuth-=.15;if(e.key==='ArrowRight')s.r.azimuth+=.15;if(e.key==='ArrowUp')s.r.elevation=Math.min(1.5,s.r.elevation+.08);if(e.key==='ArrowDown')s.r.elevation=Math.max(.05,s.r.elevation-.08);if(e.key==='+')s.r.zoom=Math.min(15,s.r.zoom*1.15);if(e.key==='-')s.r.zoom=Math.max(.2,s.r.zoom/1.15);s.r.request();}});
}
E('model').onchange=()=>{view='overall';load();};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;camera();});E('roofs').onchange=()=>{for(const {r} of stages){r.roofs=E('roofs').checked;r.dirtyShadow=true;r.request();}};
E('export').onclick=()=>{const model=stages[1].model,data=After.exportGeometryGLB(After.LandmarkTemplates.meshes(model),{recipe:model.recipe}),a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));a.href=url;a.download=active+'-refined.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};load();
</script></html>`;
await mkdir(resolve(root,outputDirectory),{recursive:true});
await writeFile(resolve(root,outputDirectory,'index.html'),html);
console.log('Built '+outputDirectory+'/index.html'+(baseline?' (comparison against '+baseline+')':''));
