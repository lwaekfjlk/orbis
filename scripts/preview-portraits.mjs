/** A standalone visual check at the two sizes used by the atlas. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=['src/world/geography.js','src/civilization/simulation.js','src/civilization/portrait.js'];
const source=(await Promise.all(files.map(f=>readFile(resolve(root,f),'utf8')))).join('\n');
const {Portrait,PEOPLES}=new Function(source+'\nreturn {Portrait,PEOPLES}')();
const names=['人类','森族','石族','兽族','角族','潮生族','龙裔'];
const row=(size,seed)=>`<div class="portraits">${PEOPLES.map((p,k)=>`<figure><div class="frame" style="width:${size}px;height:${size}px">${Portrait.svg(k,seed+k*997,{size})}</div><figcaption>${names[k]}<small>${p.name}</small></figcaption></figure>`).join('')}</div>`;
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbis · 七族肖像</title><style>
*{box-sizing:border-box}body{margin:0;background:#18221f;color:#e6dcc2;font:14px/1.6 system-ui,sans-serif}main{max-width:1160px;padding:42px 34px;margin:auto}header{border-bottom:1px solid #3c4840;padding-bottom:24px;margin-bottom:24px}.eyebrow{color:#bb9e69;font-size:11px;letter-spacing:.26em}h1{font:36px/1.3 Georgia,serif;margin:8px 0}p{color:#9da99d;margin:8px 0}h2{font-size:13px;font-weight:500;letter-spacing:.09em;color:#bbad8f;margin:26px 0 16px}.portraits{display:grid;grid-template-columns:repeat(7,1fr);gap:16px;align-items:start}figure{margin:0;text-align:center}.frame{max-width:100%;margin:auto;overflow:hidden;border:1px solid #847452;border-radius:10px;box-shadow:0 5px 16px #07141055}.frame svg{display:block;width:100%;height:100%}figcaption{font-size:13px;margin-top:9px}small{display:block;font:11px Georgia,serif;color:#939e90;letter-spacing:.04em}footer{border-top:1px solid #3c4840;margin-top:32px;padding-top:15px;font-size:12px;color:#8f9e90}@media(max-width:720px){main{padding:24px 18px}.portraits{grid-template-columns:repeat(4,1fr);gap:20px 10px}}@media(max-width:430px){.portraits{grid-template-columns:repeat(3,1fr)}}
</style><main><header><div class="eyebrow">ORBIS / PEOPLE OF THE ATLAS</div><h1>七族，同一个世界。</h1><p>重绘脸部、五官与服饰，让每位讲述者都有自己的轮廓。</p></header><h2>肖像细节 · 132 PX</h2>${row(132,42)}<h2>城镇详情 · 104 PX</h2>${row(104,17)}<h2>地图卡片 · 72 PX</h2>${row(72,83)}<footer>七个种族 · 三位不同居民 · 与应用共用同一套肖像生成器</footer></main></html>`;
await mkdir(resolve(root,'previews/portraits'),{recursive:true});
await writeFile(resolve(root,'previews/portraits/index.html'),html);
console.log('Built previews/portraits/index.html');
