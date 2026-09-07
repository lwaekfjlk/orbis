/** Build standalone GLB precinct assets from the very same town model generator. */
import {scripts} from './manifest.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(s=>readFileSync(resolve(root,s),'utf8')).join('\n');
const E=Function(code+'\nreturn {ArtisanCityKit,LandmarkCatalog,LandmarkTemplates,exportGeometryGLB};')();
const out=resolve(root,'assets/artisan');mkdirSync(out,{recursive:true});const manifest=[];
for(const style of Object.keys(E.ArtisanCityKit.palettes)){
 const r=E.LandmarkCatalog.recipe(style,'Artisan11-'+style,{artisan:true,urbanStyle:style,complexity:1,geography:{freshwater:.7}}),m=E.ArtisanCityKit.precinct(r),bytes=E.exportGeometryGLB(E.LandmarkTemplates.meshes(m),{recipe:r,notes:'Reusable civic-precinct asset, not an entire generated city. Vertex-colored real geometry; no image impostor.'});
 writeFileSync(resolve(out,style+'.glb'),Buffer.from(bytes));writeFileSync(resolve(out,style+'.recipe.json'),JSON.stringify(r,null,2));manifest.push({style,file:style+'.glb',triangles:m.stats.triangles,parts:m.parts.length,bytes:bytes.byteLength});
}
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Exported nine artisan civic precincts.');
