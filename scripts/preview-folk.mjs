/** Offline review of the same articulated meshes used on the moving map. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['src/world/geography.js', 'src/civilization/simulation.js', 'src/civilization/folk.js',
    'src/city/environment.js', 'src/render/world-renderer.js', 'src/render/road-renderer.js',
    'src/render/folk-models.js', 'src/render/folk-renderer.js'];
const engine = (await Promise.all(files.map(f => readFile(resolve(root, f), 'utf8')))).join('\n').replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbis · 七族旅人</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#172724;color:#ede4c9;font:14px/1.6 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:28px 32px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid #40514a;padding-bottom:22px}h1{font:32px/1.3 Georgia,serif;margin:5px 0}p{margin:6px 0;color:#b0b9a7}.eyebrow{font-size:10px;letter-spacing:.24em;color:#c4a775}.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}button,select{font:inherit;color:#ece3c7;background:#30443c;border:1px solid #65745b;border-radius:7px;padding:8px 12px}input{accent-color:#cab47c}label{display:flex;align-items:center;gap:8px;font-size:12px;color:#c1c9b4}h2{font-size:13px;font-weight:500;letter-spacing:.06em;margin:23px 0 10px;color:#c7b68e}.scene{height:340px;background:#e4dcc5;border-radius:12px;overflow:hidden;position:relative}.scene.small{height:152px}canvas{width:100%;height:100%;display:block}.names{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;text-align:center;padding:0 2.5%;margin-top:10px}.names strong{font-size:13px;font-weight:500}.names span{display:block;font:11px/1.5 Georgia,serif;color:#94a798}.names small{display:block;font-size:11px;color:#b8b79e;margin-top:4px}footer{font-size:12px;color:#a7b19d;border-top:1px solid #40514a;padding-top:14px;margin-top:22px}@media(max-width:760px){main{padding:18px 12px}header{display:block}.controls{margin-top:14px}.scene{height:260px}.names small{display:none}.names strong{font-size:11px}.names span{font-size:9px}}
</style><main><header><div><div class="eyebrow">ORBIS / PEOPLE ON THE MOVE</div><h1>七族旅人</h1><p>完整的身体，独有的轮廓，随脚步摆动的手臂与衣摆。</p></div><div class="controls"><button id="play">暂停步态</button><label>视角 <input id="angle" type="range" min="-180" max="180" value="55"></label><label>配色 <select id="palette"><option value="colour">服饰与肤色</option><option value="clay">单色轮廓</option></select></label></div></header>
<h2>走近看 · 七种身体与步态</h2><div class="scene"><canvas id="full"></canvas></div><div id="names" class="names"></div>
<h2>街道上的轮廓 · 约 24 像素高</h2><div class="scene small"><canvas id="simple"></canvas></div><footer>与地图共用人物模型。视角可旋转；切换单色也能辨认各族。放大后出现面部和服装细节，远处保留简洁的身体轮廓。</footer></main>
<script>${engine}</script><script>
const names=['人类','森族','石族','兽族','角族','潮生族','龙裔'];
const marks=['束腰短衣 · 皮靴','尖耳 · 披风','宽肩 · 长须','兽耳 · 吻部 · 长尾','双角 · 厚肩','头鳍 · 鳍耳','龙吻 · 脊棘 · 龙尾'];
document.getElementById('names').innerHTML=PEOPLES.map((p,i)=>'<div><strong>'+names[i]+'</strong><span>'+p.name+'</span><small>'+marks[i]+'</small></div>').join('');
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,phase=0,last=performance.now(),angle=55,clay=false;
const scenes=['full','simple'].map(id=>{const r=new AtlasRenderer(document.getElementById(id));r.visible=()=>true;r.backgroundColor=rgb('#e4dcc5');r.target=[0,id==='full'?.52:.20,0];r.elevation=.63;r.azimuth=0;return{id,r};});
function draw(){for(const{id,r}of scenes){const g=new Geometry(),small=id==='simple';r.zoom=small?18:52;r.updateCamera();const size=small?1.08:1.26;
 for(let i=0;i<7;i++){const look=Folk.look(i),p=AtlasRenderer.folkAppearance(i,.58),x=(i-3)*r.halfW*2*.925/7;
  // A quiet grounding mark makes lifted feet and alternating steps easy to see.
  g.cone(x,.001,0,small?.16:.25,small?.16:.25,.002,rgb('#c4baa0'),12);
  g.figure(x,0,0,size*look.height,size*.30*look.build,angle*Math.PI/180,clay?rgb('#8c816e'):p.cloth,clay?rgb('#8c816e'):p.skin,look.accent,phase+i*.31,true,small?'simple':'full');
 }r.upload('figures',g,false,.28);r.request();}window.__folkPreview={phase,playing,angle,clay,triangles:scenes.map(s=>s.r.meshes.figures.count/3)};}
const button=document.getElementById('play');function buttonText(){button.textContent=playing?'暂停步态':'播放步态';}buttonText();button.onclick=()=>{playing=!playing;buttonText();draw();};
document.getElementById('angle').oninput=e=>{angle=+e.target.value;draw();};document.getElementById('palette').onchange=e=>{clay=e.target.value==='clay';draw();};
function tick(now){if(playing&&now-last>40){phase+=(now-last)/1000*1.8;last=now;draw();}else if(!playing)last=now;requestAnimationFrame(tick);}draw();requestAnimationFrame(tick);
window.setFolkPreviewPhase=value=>{phase=value;draw();};
</script></html>`;
await mkdir(resolve(root, 'previews/folk'), { recursive: true });
await writeFile(resolve(root, 'previews/folk/index.html'), html);
console.log('Built previews/folk/index.html');
