import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEngine, root } from './engine-loader.mjs';
const E=loadEngine();

test('Civilization is visible on both everyday map layers and toggles still work',()=>{
 const r=Object.create(E.AtlasRenderer.prototype);r.options={settlements:true,frontiers:true};
 for(const layer of ['realms','relief','faiths','peoples','diplomacy']){
  r.layer=layer;assert.equal(r.visible('settlements'),true,layer+' settlements');
  assert.equal(r.visible('frontiers'),true,layer+' borders');
 }
 r.layer='settlements';assert.equal(r.visible('settlements'),true);
 assert.equal(r.visible('frontiers'),false,'pre-state view has no borders');
 for(const layer of ['plates','rain','ice','aridity','ocean','potential']){
  r.layer=layer;assert.equal(r.visible('settlements'),false,layer+' is an explicit diagnostic layer');
 }
 for(const layer of ['realms','relief']){
  r.layer=layer;r.options.settlements=false;r.options.frontiers=false;
  assert.equal(r.visible('settlements'),false);assert.equal(r.visible('frontiers'),false);
 }
});

test('Presentation reset resets view only; report distinguishes state from mesh visibility',()=>{
 const text=readFileSync(resolve(root,'src/ui/world-ui.js'),'utf8');
 const functions=text.slice(text.indexOf('/** Default presentation'),text.indexOf('async function buildWorld('));
 const dom=Object.fromEntries(['settlements','frontiers','names','realmSearch','moreLayer'].map(id=>[id,{checked:false,value:'stale'}]));
 const r={layer:'plates',options:{settlements:false,frontiers:false},meshes:{settlements:{count:27},frontiers:{count:18}},visible:()=>true};
 const harness=new Function('$','renderer',`const DEFAULT_WORLD_LAYER='realms';let currentLayer='plates';${functions};return {resetWorldPresentation,generationReport,getLayer:()=>currentLayer};`)(id=>dom[id],r);
 harness.resetWorldPresentation();assert.equal(harness.getLayer(),'realms');assert.equal(r.layer,'realms');
 for(const id of ['settlements','frontiers','names'])assert.equal(dom[id].checked,true);
 assert.equal(dom.realmSearch.value,'');assert.equal(dom.moreLayer.value,'');
 const w={params:{seed:'regression'}},s={year:400,realms:[{alive:true}],provinces:[{city:true,settled:true,pop:1234}]};
 r.world=w;r.sim=s;
 const report=harness.generationReport(w,s);
 assert.equal(report.realms,1);assert.equal(report.towns,1);assert.equal(report.population,1234);
 r.meshes.settlements.count=0;assert.throws(()=>harness.generationReport(w,s),/did not attach/);
 r.meshes.settlements.count=27;r.sim={};assert.throws(()=>harness.generationReport(w,s),/did not attach/);
 r.sim=s;s.realms=[];s.provinces=[];r.meshes.settlements.count=0;
 assert.equal(harness.generationReport(w,s).settlements,0,'an empty geography is reported, not repopulated to satisfy a quota');
});
