/** Export every registered wonder from the same builder used in the town. */
import {scripts} from './manifest.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(resolve(root,f),'utf8')).join('\n');
const E=Function(source+'\nreturn {SacredCityKit,LandmarkCatalog,LandmarkTemplates,exportGeometryGLB};')();
const output=resolve(root,'assets/wonders');mkdirSync(output,{recursive:true});
const manifest=[];
for(const wonder of E.SacredCityKit.wonderIds){
 const recipe=E.LandmarkCatalog.recipe('basilica','Architectural-study-47',{wonder,sacred:true,faith:'sun',complexity:2,variant:1,crown:'native',geography:{freshwater:.7,elevation:350}});
 // The saved recipe is the detail authority, so importing it reproduces this GLB.
 const model=E.SacredCityKit.build(recipe);
 const bytes=E.exportGeometryGLB(E.LandmarkTemplates.meshes(model),{recipe,signature:model.signature,units:'art units',notes:'Actual procedural wonder geometry used by the town; full detail export.'});
 writeFileSync(resolve(output,wonder+'.glb'),Buffer.from(bytes));
 writeFileSync(resolve(output,wonder+'.recipe.json'),JSON.stringify(recipe,null,2)+'\n');
 manifest.push({wonder,file:wonder+'.glb',recipe:wonder+'.recipe.json',signature:model.signature,lod:recipe.complexity,triangles:model.stats.triangles,parts:model.parts.length,bytes:bytes.byteLength,bounds:model.bounds});
}
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Exported all ${manifest.length} registered wonders.`);
