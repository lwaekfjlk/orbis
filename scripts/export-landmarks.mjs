/** Rebuild the reusable binary meshes from authored recipes. No third-party packages. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const names=['src/world/geography.js','src/render/world-renderer.js','src/render/export-glb.js','src/landmarks/catalog.js','src/landmarks/kit.js','src/landmarks/dragon-ruins.js','src/landmarks/templates.js'];
const code=(await Promise.all(names.map(p=>readFile(resolve(root,p),'utf8')))).join('\n');
const api=new Function(code+'\nreturn {LandmarkCatalog,LandmarkTemplates,exportGeometryGLB};')();
const output=resolve(root,'assets/landmarks');await mkdir(output,{recursive:true});
const inventory=[];
for(const s of api.LandmarkCatalog.styles){
 const recipe=api.LandmarkCatalog.recipe(s.id,'AERETH / 01');
 const model=api.LandmarkTemplates.build(recipe),mesh=api.LandmarkTemplates.meshes(model);
 const data=api.exportGeometryGLB(mesh,{recipe,signature:model.signature,scale:'Schematic architectural units, Y-up.',license:'Original Orbis geometry, MIT license.'});
 await writeFile(resolve(output,s.id+'.glb'),new Uint8Array(data));
 await writeFile(resolve(output,s.id+'.recipe.json'),JSON.stringify(recipe,null,2)+'\n');
 inventory.push({id:s.id,name:s.name,type:s.type,file:s.id+'.glb',recipe:s.id+'.recipe.json',signature:model.signature,triangles:model.stats.triangles,groups:model.stats.parts,bytes:data.byteLength});
 console.log(`${s.id}: ${model.stats.triangles} triangles, ${data.byteLength.toLocaleString()} bytes`);
}
await writeFile(resolve(output,'manifest.json'),JSON.stringify({version:1,license:'MIT',models:inventory},null,2)+'\n');
console.log('Wrote '+inventory.length+' real GLB meshes and reproducible recipes.');
