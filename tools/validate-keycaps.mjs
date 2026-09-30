import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const THREE = require('../src/vendor/three.min.js');
const D = require('../src/data.js');
const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function factory(text) {
  const start = text.indexOf('function roundedRectRing(');
  const end = text.indexOf('function legendPatchGeometry(', start);
  assert(start >= 0 && end > start);
  const context = vm.createContext({ THREE, Math });
  vm.runInContext(text.slice(start, end), context);
  return context.capGeometry;
}
const make = factory(source);
function inspect(geo) {
  const p = geo.attributes.position, indices = geo.index.array;
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i, i + 3));
    const [a,b,c] = ids.map(n => new THREE.Vector3().fromBufferAttribute(p,n));
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert(normal.lengthSq() > 1e-15, 'degenerate triangle');
    volume += a.dot(b.clone().cross(c)) / 6;
    for (let j=0;j<3;j++) {
      const u=ids[j], v=ids[(j+1)%3], key=[Math.min(u,v),Math.max(u,v)].join(':');
      const e=edges.get(key)||{n:0,balance:0}; e.n++; e.balance+=u<v?1:-1; edges.set(key,e);
    }
  }
  return { open: [...edges.values()].filter(e=>e.n!==2||e.balance!==0).length, volume };
}
let cases=0, rays=0;
const sizes = [[1,1],[1.25,1],[1.5,1],[1.75,1],[2,1],[2.25,1],[2.75,1],[6.25,1],[1,2]];
for (const quality of ['high','low']) for (const profile of Object.values(D.KEYCAP_PROFILES)) {
  for (const [height,tilt,dish] of [...profile.rows,profile.fnRow,profile.bottomRow]) for (const [w,h] of sizes) {
    const geo=make(w,h,height,dish,tilt,quality), report=inspect(geo);
    assert.equal(report.open,0,`open/inconsistently wound edges: ${w}x${h}`);
    assert(report.volume>0,'inverted shell');
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.FrontSide}));
    mesh.updateMatrixWorld(true);
    // Front-side raycasts must hit the outside of every wall, from all four sides.
    for (const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(x*(w+1),height*.4,z*(h+1)),new THREE.Vector3(-x,0,-z));
      const hit=ray.intersectObject(mesh)[0];
      assert(hit && hit.point.x*x+hit.point.z*z>0,'outside wall culled or missing'); rays++;
    }
    const ray=new THREE.Raycaster(new THREE.Vector3(0,height+1,0),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(mesh)[0];
    assert(hit && Math.abs(hit.point.y-(height-dish))<1e-5,'dish top missing'); rays++;
    mesh.material.dispose(); cases++;
  }
}
if(process.argv[2]) {
  const old=factory(fs.readFileSync(process.argv[2],'utf8'));
  assert(inspect(old(1,1,.44,.034,.05,'high')).open>0,'regression fixture unexpectedly closed');
  console.log('Regression: original disconnected shell detected.');
}
console.log(`PASS: ${cases} keycap variants; ${rays} front-side raycasts; closed consistently wound shell, positive volume.`);
