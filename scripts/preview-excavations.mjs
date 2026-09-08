/** Reproducible placement comparison; no pre-rendered images or substitute geometry. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),baseline='7b3ae52';
// Share one renderer. Historical model builders and placement retain their own scope.
const modelFiles=['src/landmarks/catalog.js','src/landmarks/kit.js','src/landmarks/templates.js','src/towns/artisan-kit.js','src/towns/wonders-woodland.js','src/towns/wonders-stone.js','src/towns/wonders-arcane.js','src/towns/sacred-kit.js'];
const currentFiles=['src/world/geography.js','src/render/world-renderer.js',...modelFiles,'src/render/depth-rasterizer.js','src/continuous/city-layer.js','src/render/landmark-renderer.js'];
const current=(await Promise.all(currentFiles.map(f=>readFile(resolve(root,f),'utf8')))).join('\n');
const prior=modelFiles.map(f=>execFileSync('git',['show',`${baseline}:${f}`],{cwd:root,encoding:'utf8',maxBuffer:2e6})).join('\n');
const api='{LandmarkCatalog,LandmarkTemplates,ArtisanCityKit}';
const runtime=`(()=>{${current}\nconst After=${api};const Before=(()=>{${prior}\nreturn ${api};})();return {Before,After,Geometry,ExcavationTerrain,createLandmarkRenderer};})()`;

// Used by both the generator's validation and the browser's interactive preview.
function assemble(runtime,id,revision){
 const api=runtime[revision],recipe=api.LandmarkCatalog.recipe(id==='labyrinth'?'labyrinth':'basilica','Excavation-placement-47',{sacred:id!=='labyrinth',wonder:id,faith:'hearth',complexity:1});
 const canonical=api.LandmarkTemplates.build(recipe,{lod:1,base:false});
 const placed=api.ArtisanCityKit.meshAt(canonical,{id:'preview-parcel',x:0,y:0,z:0,w:32,d:32,angle:0});
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const g of[placed.body,placed.roof])for(let i=0;i<g.data.length;i+=9)for(let j=0;j<3;j++){min[j]=Math.min(min[j],g.data[i+j]);max[j]=Math.max(max[j],g.data[i+j]);}
 const scale=(max[1]-min[1])/(canonical.bounds.max[1]-canonical.bounds.min[1]);
 const entranceY=min[1]+((canonical.groundY??0)-canonical.bounds.min[1])*scale;
 const ground=new runtime.Geometry(),holes=revision==='After'&&placed.excavation?[runtime.ExcavationTerrain.prepare(placed.excavation.outline,placed.excavation.floorY,'preview-parcel')]:[];
 // An actual flat surveyed surface; the same triangles and colours on both sides.
 for(let z=-24;z<24;z+=2)for(let x=-24;x<24;x+=2){
  const tone=((x+z)/2)%2===0?[.48,.53,.43]:[.50,.55,.45],v=(x,z)=>[x,0,z,0,1,0,...tone],a=v(x,z),b=v(x+2,z),c=v(x+2,z+2),d=v(x,z+2);
  if(holes.length){runtime.ExcavationTerrain.triangle(ground,a,d,b,holes);runtime.ExcavationTerrain.triangle(ground,b,d,c,holes);}
  else{ground.smoothTri(a,d,b);ground.smoothTri(b,d,c);}
 }
 const parts=[{id:'ground',name:'Surveyed ground',role:'landscape',geometry:ground},{id:'building',name:'Placed architecture',role:'architecture',geometry:placed.body},{id:'roof',name:'Removable roofs',role:'roof',geometry:placed.roof}];
 for(const p of parts){p.anchor=[0,0,0];p.bounds={min,max};}
 return{canonical,placed,ground,holes,min,max,entranceY,floorY:min[1],depth:Math.max(0,-min[1]),
  model:{recipe,signature:'placement-preview/'+revision+'/'+id,parts,bounds:{min,max}}};
}

// Generation checks exercise the exact builders and clipping used in the page.
const engine=Function('return '+runtime)();
for(const id of['forge-hollow','sunless-well','labyrinth']){
 const before=assemble(engine,id,'Before'),after=assemble(engine,id,'After');
 if(before.floorY< -1e-7||Math.abs(after.entranceY)>1e-7||after.floorY>=0||!after.holes.length)throw Error(id+' has inconsistent entrance/floor placement');
 for(const s of[before,after])for(const p of s.model.parts)if(!p.geometry.data.every(Number.isFinite))throw Error(id+' has nonfinite geometry');
 const area=g=>{let total=0;for(let i=0;i<g.data.length;i+=27){const a=g.data.slice(i,i+3),b=g.data.slice(i+9,i+12),c=g.data.slice(i+18,i+21);total+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;}return total;};
 const cut=after.holes[0].outline.reduce((sum,a,j,points)=>{const b=points[(j+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1]},0)/2;
 if(Math.abs(area(before.ground)-area(after.ground)-cut)>1e-6)throw Error(id+' ground mesh does not match its excavation outline');
 console.log(`${id}: entrance ${before.entranceY.toFixed(2)} → ${after.entranceY.toFixed(2)}, bottom ${before.floorY.toFixed(2)} → ${after.floorY.toFixed(2)}, clipped ${cut.toFixed(2)} square model units`);
}
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbis · 地下建筑落地对照</title>
<style>*{box-sizing:border-box}body{margin:0;background:#18241f;color:#eee9d9;font:14px/1.5 system-ui,sans-serif}header,nav,footer{padding:16px 24px}header{border-bottom:1px solid #46554b}h1{font:29px/1.3 Georgia,serif;margin:0 0 8px}p{margin:5px 0;color:#c0cbbd}nav{display:flex;align-items:center;gap:9px;flex-wrap:wrap}button,select{font:inherit;color:inherit;background:#2b4034;border:1px solid #738270;padding:7px 12px;border-radius:5px}button{cursor:pointer}button[aria-pressed=true]{color:#19372c;background:#d9d5b6}button:focus-visible,select:focus-visible,canvas:focus-visible,input:focus-visible{outline:3px solid #81ced6;outline-offset:3px}label{display:flex;gap:7px;align-items:center}.views{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#637064}.panel{background:#f0ede3;min-width:0}.panel h2{color:#344638;font-size:14px;margin:0;padding:12px 18px}.stage{position:relative;height:clamp(440px,65vh,760px)}canvas{display:block;width:100%;height:100%;touch-action:none}svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden}svg text{font:11px system-ui;paint-order:stroke;stroke:#f0ede3;stroke-width:3px;stroke-linejoin:round;fill:#344638}svg .zero{fill:#115e69;font-weight:700}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;color:#385244;background:#e4e6d7;padding:13px 18px;margin:0}.stats dt{font-size:11px}.stats dd{font:21px Georgia,serif;margin:2px 0 0}.detail{color:#5b6759;font-size:11px;padding:8px 18px;margin:0}footer{display:flex;gap:14px;justify-content:space-between;font-size:12px}.error{color:#ffb990}@media(max-width:700px){header,nav,footer{padding:13px}.views{grid-template-columns:1fr}.stage{height:490px}footer{display:block}}</style>
<header><h1>入口留在地面，井底回到地下。</h1><p>同一配方与地块，真实建筑、台阶、井壁和地面三角网格。左右镜头与光照保持同步。</p></header>
<nav aria-label="对比选项"><label for="model">建筑<select id="model"><option value="forge-hollow">熔炉深坑</option><option value="sunless-well">无光之井</option><option value="labyrinth">第九阶地下迷宫</option></select></label><button data-view="overall" aria-pressed="true">整体</button><button data-view="plan" aria-pressed="false">俯视井底</button><button data-view="level" aria-pressed="false">地面水平</button><button id="reset">重置镜头</button><label><input id="roofs" type="checkbox" checked>显示屋顶</label></nav>
<main class="views">${[['Before','修复前 · 7b3ae52'],['After','修复后 · 入口基准与挖空']].map(([id,title])=>`<section class="panel" aria-labelledby="${id}Title"><h2 id="${id}Title">${title}</h2><div class="stage"><canvas id="${id}" tabindex="0" aria-label="${title}三维模型" aria-describedby="controls"></canvas><svg id="${id}Datum" aria-hidden="true"></svg></div><dl class="stats" id="${id}Stats"></dl><p class="detail" id="${id}Detail"></p></section>`).join('')}</main>
<footer><span id="status" role="status">正在构建对比…</span><span id="controls">拖动旋转 · 滚轮或 +/− 缩放 · 方向键调整镜头。青线为地面 Y=0；数字为模型单位。</span></footer>
<script>const Runtime=${safe(runtime)};const assemble=${assemble.toString()};</script>
<script>
const E=id=>document.getElementById(id),stages=[];let view='overall',active='forge-hollow';
const format=n=>(Math.abs(n)<.005?'0.00':(n>0?'+':'')+n.toFixed(2));
function datum(s){if(!s.r.mvp)return;const r=s.r,svg=E(s.id+'Datum'),point=p=>r.screen3(p),a=point([-18,0,18]),b=point([18,0,18]);svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
 let content='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="#238b96" stroke-width="1.4" stroke-dasharray="5 4"/>';
 const lo=Math.floor(Math.min(...stages.map(t=>t.scene?.min[1]??0))/5)*5,hi=Math.ceil(Math.max(...stages.map(t=>t.scene?.max[1]??0))/5)*5;
 const p=point([18,lo,18]),q=point([18,hi,18]);content+='<line x1="'+p[0]+'" y1="'+p[1]+'" x2="'+q[0]+'" y2="'+q[1]+'" stroke="#6b7d71" stroke-width="1"/>';
 for(let y=lo;y<=hi;y+=5){const [x,z]=point([18,y,18]);content+='<path d="M'+(x-3)+' '+z+'h6" stroke="#526b5d"/><text x="'+(x+7)+'" y="'+(z+4)+'" class="'+(y===0?'zero':'')+'">'+(y===0?'0 地面':y)+'</text>';}
 svg.innerHTML=content;
}
function camera(){
 const points=stages.flatMap(s=>{const out=[],d=[s.scene.placed.body,s.scene.placed.roof];for(const g of d)for(let i=0;i<g.data.length;i+=9)out.push(g.data.slice(i,i+3));return out});
 const az=-.34,el=view==='plan'?1.54:view==='level'?.17:1.18,right=[Math.cos(az),0,-Math.sin(az)],up=[-Math.sin(az)*Math.sin(el),Math.cos(el),-Math.cos(az)*Math.sin(el)],dot=(p,v)=>p.reduce((sum,x,j)=>sum+x*v[j],0);
 points.push([-18,0,18],[20,0,18]);let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 for(const p of points){const x=dot(p,right),y=dot(p,up);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 const target=right.map((x,j)=>x*(x0+x1)/2+up[j]*(y0+y1)/2),aspect=Math.min(...stages.map(s=>s.r.width/s.r.height)),span=Math.max((x1-x0)/aspect,y1-y0)*.63;
 for(const s of stages){s.r.target=target.slice();s.r.azimuth=az;s.r.elevation=el;s.r.zoom=Math.max(29,42/aspect)/span;s.r.request();}
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
}
function load(){try{document.body.dataset.ready='loading';active=E('model').value;
 for(const s of stages){s.scene=assemble(Runtime,active,s.id);s.r.setModel(s.scene.model);s.r.roofs=E('roofs').checked;
  const m=s.scene,triangles=(m.placed.body.data.length+m.placed.roof.data.length)/27;
  E(s.id+'Stats').innerHTML='<div><dt>入口相对地面</dt><dd>'+format(m.entranceY)+'</dd></div><div><dt>井底相对地面</dt><dd>'+format(m.floorY)+'</dd></div><div><dt>地下深度</dt><dd>'+m.depth.toFixed(2)+'</dd></div>';
  E(s.id+'Detail').textContent=triangles.toLocaleString()+' 个建筑三角形 · '+(m.ground.data.length/27).toLocaleString()+' 个真实地面三角形 · 地上最高 '+format(m.max[1]);
 }
 camera();E('status').textContent='32 × 32 地块，地面 Y=0；右侧仅沿模型挖空轮廓裁切地面。';document.body.dataset.ready='true';window.__excavationPreview={model:active,before:{entrance:stages[0].scene.entranceY,floor:stages[0].scene.floorY},after:{entrance:stages[1].scene.entranceY,floor:stages[1].scene.floorY,depth:stages[1].scene.depth}};
 }catch(error){E('status').textContent=error.message;E('status').className='error';document.body.dataset.ready='error';console.error(error);}}
function move(dx,dy,zoom=1){for(const s of stages){s.r.azimuth+=dx;s.r.elevation=Math.max(.10,Math.min(1.55,s.r.elevation+dy));s.r.zoom=Math.max(.25,Math.min(12,s.r.zoom*zoom));s.r.request();}}
for(const id of['Before','After']){const canvas=E(id),s={id,r:null,scene:null};s.r=Runtime.createLandmarkRenderer(canvas,()=>datum(s));stages.push(s);let drag=null;
 canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;move(-(e.clientX-drag[0])*.007,(e.clientY-drag[1])*.005);drag=[e.clientX,e.clientY];});
 for(const event of['pointerup','pointercancel'])canvas.addEventListener(event,()=>{drag=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();move(0,0,Math.exp(-e.deltaY*.001));},{passive:false});
 canvas.addEventListener('keydown',e=>{const keys={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.08],ArrowDown:[0,-.08],'+':[0,0,1.15],'=':[0,0,1.15],'-':[0,0,1/1.15]};if(keys[e.key]){e.preventDefault();move(...keys[e.key]);}});
}
E('model').addEventListener('change',()=>{view='overall';load();});E('reset').addEventListener('click',()=>{view='overall';camera();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;camera();}));
E('roofs').addEventListener('change',()=>{for(const s of stages){s.r.roofs=E('roofs').checked;s.r.dirtyShadow=true;s.r.request();}});
let resize;window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(()=>{for(const s of stages)s.r.resize();camera();},80);});load();
</script></html>`;
const output=resolve(root,'previews/excavations');await mkdir(output,{recursive:true});await writeFile(resolve(output,'index.html'),html);
console.log(`Built previews/excavations/index.html (${(Buffer.byteLength(html)/1024).toFixed(0)} KiB, baseline ${baseline})`);
