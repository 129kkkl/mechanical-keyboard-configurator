import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), THREE=require('../src/vendor/three.min.js'), D=require('../src/data.js');
const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function fn(text,name){ const a=text.indexOf('function '+name+'('); assert(a>=0); return text.slice(a,text.indexOf('\n}',a)+2); }
const context=vm.createContext({THREE,Math});
for(const name of ['roundedRectShape','roundedRectPath','plateCutouts','createPlateGeometry']) vm.runInContext(fn(source,name),context);
let rays=0, count=0;
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
function intersections(mesh,x,z){rays++; return new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh);}
for(const layout of [...D.LAYOUTS,D.LAYOUT_75_KNOB]){
  const holes=context.plateCutouts(layout), geometry=context.createPlateGeometry(layout,D.STRUCT.plateThk);
  const mesh=new THREE.Mesh(geometry,material); mesh.updateMatrixWorld(true);
  assert.equal(holes.filter(h=>h.type==='switch').length,layout.keys.length);
  for(let i=0;i<holes.length;i++){
    const a=holes[i];
    for(let j=i+1;j<holes.length;j++){
      const b=holes[j];
      assert(!(Math.abs(a.x-b.x)<(a.w+b.w)/2-1e-8 && Math.abs(a.z-b.z)<(a.h+b.h)/2-1e-8),`${layout.id} intersecting holes: ${a.keyId}/${b.keyId}`);
    }
    // Five points within each REAL mesh opening, including stabilizer slots.
    for(const [dx,dz] of [[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22]])
      assert.equal(intersections(mesh,a.x+dx*a.w,a.z+dz*a.h).length,0,`${layout.id} blocked ${a.type} hole ${a.keyId}`);
  }
  // Outside all hole rectangles and away from rounded outside corners, the plate
  // must have exactly one top and one bottom hit: neither missing nor extra facets.
  let solids=0;
  for(let x=-layout.widthU/2+.131;x<layout.widthU/2-.1;x+=.317)
    for(let z=-layout.depthU/2+.173;z<layout.depthU/2-.1;z+=.293){
      if(holes.some(h=>Math.abs(x-h.x)<h.w/2+.006&&Math.abs(z-h.z)<h.h/2+.006)) continue;
      assert.equal(intersections(mesh,x,z).length,2,`${layout.id}: missing/duplicate plate at ${x},${z}`); solids++;
    }
  console.log(`${layout.id}: ${layout.keys.length} switch holes; ${holes.length-layout.keys.length} stabilizer slots; ${solids} solid-plate probes PASS`);
  geometry.dispose(); count++;
}
if(process.argv[2]){
  const old=fs.readFileSync(process.argv[2],'utf8'), layout=D.getLayout('k100');
  const oldContext=vm.createContext({THREE,Math,layout,W:layout.widthU,H:layout.depthU,S:D.STRUCT});
  for(const name of ['roundedRectShape','roundedRectPath']) vm.runInContext(fn(old,name),oldContext);
  const start=old.indexOf('var plateShape ='), end=old.indexOf('plateGeo2.rotateX(-Math.PI / 2);',start);
  assert(start>=0&&end>start);
  vm.runInContext(old.slice(start,end+'plateGeo2.rotateX(-Math.PI / 2);'.length),oldContext);
  const mesh=new THREE.Mesh(oldContext.plateGeo2,material);mesh.updateMatrixWorld(true);
  const blocked=layout.keys.filter(k=>intersections(mesh,k.x+k.w/2-layout.widthU/2,k.y+k.h/2-layout.depthU/2).length>0);
  assert(blocked.length>0,'old 104-key regression not reproduced');
  console.log(`Regression reproduced: original 104-key plate blocks ${blocked.length}/104 switch centers.`);
  oldContext.plateGeo2.dispose();
}
// Run the real board factory (canvas textures stubbed, geometry unmodified).
// This also checks repeated replacement, assembly transforms, and duplicate plates.
Object.assign(context, { D, scene:new THREE.Scene(), board:null, sharedGeo:{}, sharedTex:{},
  capGeoCache:{}, capMats:{}, switchStemMats:{},
  currentConfig:()=>({quality:'high',profile:Object.keys(D.KEYCAP_PROFILES)[0],switch:'linear'}),
  makeCanvas:()=>new THREE.Texture(), legendTex:()=>new THREE.Texture(),
  pcbSilkTex:()=>new THREE.Texture(), badgeTex:()=>new THREE.Texture(), knurlTex:()=>new THREE.Texture(),
  applyThemeToBoard:()=>{}, applyCaseColorToBoard:()=>{} });
for(const name of ['disposeBoard','makeSharedMaterials','roundedRectRing','dishY','capGeometry',
  'legendPatchGeometry','mountSocketGeo','mergeGeos','stabWireGeo','stabSeatGeo','switchBottomGeo',
  'switchTopGeo','crossStemGeo','footGeo','profileRowFor','displayLabel','buildBoard'])
  vm.runInContext(fn(source,name),context);
context.makeSharedMaterials();
let assemblies=0;
for(const [family,definition] of Object.entries(D.CASE_FAMILIES)) for(const id of definition.layouts){
  const board=context.buildBoard(id,family);
  assert.equal(context.scene.children.length,1,'old board was left in scene');
  const plates=[];board.group.traverse(o=>{if(o.name==='定位板') plates.push(o);});
  assert.equal(plates.length,1,`${id}/${family} duplicate plate`);
  board.group.updateMatrixWorld(true);
  for(const k of board.keys){
    const [x,,z]=board.stemBase[k.stemIdx];
    assert(Math.abs(k.group.position.x-x)<1e-7&&Math.abs(k.group.position.z-z)<1e-7,'cap/stem mismatch');
    const origin=board.group.localToWorld(new THREE.Vector3(x,2,z));
    const direction=new THREE.Vector3(0,-1,0).transformDirection(board.group.matrixWorld);
    assert.equal(new THREE.Raycaster(origin,direction).intersectObject(plates[0]).length,0,`${id}/${family} world-space blocked hole`);
    rays++;
  }
  assemblies++;
}
context.disposeBoard();assert.equal(context.scene.children.length,0);
material.dispose(); console.log(`PASS: ${count} layouts, ${assemblies} real board assemblies, ${rays} actual-mesh raycasts; no duplicate board/plate.`);
