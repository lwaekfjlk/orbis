import {scripts} from './manifest.mjs';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{defaults}from'../tests/engine-loader.mjs';
const code=scripts.slice(0,scripts.indexOf('src/ui/world-ui.js')).map(f=>readFileSync(f,'utf8')).join('\n');
const E=Function(code+'\nreturn {generateWorld,createCivilization,generateCity,auditCity,SacredCityKit,LandmarkCatalog,TownCityBinding,physicalFingerprint,LandmarkTemplates,exportGeometryGLB};')();
const w=await E.generateWorld(defaults),s=E.createCivilization(w,{realms:18,historySeed:'First-dawn'});
const out=[];for(const id of[213,240,258,259,297,343,403,452,462]){
 const c=E.generateCity(w,s,id),b=c.buildings.find(b=>b.sacred);console.log(c.name,c.buildings.length,b&&[b.w,b.x,b.z,b.angle],E.auditCity(c));
 if(b){const r=E.TownCityBinding.resolve(w,s,s.provinces[id],c,'temple'),m=E.LandmarkTemplates.build(r);console.log(m.stats.triangles,m.bounds,m.signature);out.push({id,name:c.name,faith:r.faith,buildings:c.buildings.length,temple:b,triangles:m.stats.triangles,bounds:m.bounds,audit:E.auditCity(c)});}
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/sanctuary-probe.json',JSON.stringify(out,null,2));
