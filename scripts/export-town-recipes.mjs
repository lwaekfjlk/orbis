import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadEngine,root,defaults} from '../tests/engine-loader.mjs';
const E=loadEngine(),w=await E.generateWorld(defaults),sim=E.createCivilization(w,{realms:18,historySeed:'First-dawn'}),out=resolve(root,'assets/towns');mkdirSync(out,{recursive:true});
const all=[];
for(const style of E.TownCatalog.styles){
 const p=sim.provinces.filter(p=>p.city&&E.TownCatalog.allowed(p,w,style.id)).sort((a,b)=>((E.TownCatalog.native(b,w)===style.id?1e9:0)+b.urbanPop)-((E.TownCatalog.native(a,w)===style.id?1e9:0)+a.urbanPop))[0];
 const recipe=E.TownCatalog.resolve(w,sim,p,{style:style.id,seed:'Town-assembly-9'});
 writeFileSync(resolve(out,style.id+'.recipe.json'),JSON.stringify(recipe,null,2));all.push({...style,exampleTown:p.name,recipeFile:style.id+'.recipe.json'});
}
writeFileSync(resolve(out,'catalog.json'),JSON.stringify({format:'townsmith-assembly-catalog',version:1,note:'Whole-town recipes, not standalone palace prefabs. Import at a compatible existing settlement.',types:all},null,2));console.log('Wrote nine complete town recipes and a catalog.');
