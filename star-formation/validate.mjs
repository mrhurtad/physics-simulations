import assert from 'node:assert/strict';
import {Cloud, PRESETS, CONFIG, G, DENSITY_SI, kernel} from './model.mjs';
const results=[];
function norm(a){return Math.hypot(...a);}
function check(c){
  const d=c.diagnostics(),l=c.angularMomentum();
  assert.equal(c.error,'');assert.ok(Math.abs(d.gasMass+d.starMass-c.params.mass)<1e-11,'mass budget');
  assert.ok(norm(l.map((x,k)=>x-c.initialL[k]))<1e-10,'vector angular momentum including sink spin');
  const momentum=[0,1,2].map(k=>c.particles.reduce((s,p)=>s+p.m*p.v[k],0));
  assert.ok(norm(momentum)<1e-10,'linear momentum');
  assert.ok(c.particles.every(p=>[...p.r,...p.v,p.rho,p.h].every(Number.isFinite)),'finite state');
  if(c.formation){const f=c.formation;assert.ok(f.rho>=f.threshold&&f.mass>=f.jeans&&f.flow<0&&f.energy<0,'physical sink checks');}
  for(let i=1;i<c.history.length;i++)assert.ok(c.history[i].mass>=c.history[i-1].mass,'monotonic accretion');
}
function run(name,params,t=100,options={}){
  const c=new Cloud(params,options);assert.equal(c.sink,null);
  for(let next=25;next<=t;next+=25){c.advance(next-c.time);check(c);}
  const d=c.diagnostics();results.push({name,time:c.time,formed_kyr:c.formedAt,sink_Msun:d.starMass,disk_Msun:d.diskMass,disk_radius_AU:d.diskRadius*1000,R90_AU:d.r90*1000,steps:c.steps});console.log('PASS',name,JSON.stringify(results.at(-1)));return c;
}
assert.ok(Math.abs(G-0.039478)<0.00001);assert.ok(DENSITY_SI>5.9e-13&&DENSITY_SI<6e-13);
// Radial integration checks normalized 3D cubic spline.
let integral=0;for(let r=.0005;r<2;r+=.001)integral+=4*Math.PI*r*r*kernel(r,1)*.001;assert.ok(Math.abs(integral-1)<1e-6);
const runs={};for(const [key,value] of Object.entries(PRESETS))runs[key]=run(key,value);
assert.ok(runs.standard.sink&&runs.standard.formedAt<100,'cold cloud collapses');
assert.equal(runs.weak.sink,null);assert.equal(runs.warm.sink,null);
assert.ok(runs.rapid.diagnostics().diskMass>runs.low.diagnostics().diskMass+.3,'rotation changes disk mass');
assert.ok(runs.rapid.diagnostics().diskRadius>runs.low.diagnostics().diskRadius,'rotation changes disk extent');
assert.ok(runs.rapid.sink.m<runs.low.sink.m,'rotation delays accretion');
assert.ok(runs.standard.sink.m>runs.standard.formation.mass+.2,'sink grows by accretion');
const strong=run('strong gravity',{...PRESETS.standard,gravity:2});
const light=run('low mass',{...PRESETS.standard,mass:.5});
assert.ok(strong.formedAt<runs.standard.formedAt,'stronger gravity faster collapse');assert.equal(light.sink,null);
const a=new Cloud(PRESETS.standard),b=new Cloud({...PRESETS.standard,gravity:2});
assert.ok(norm(a.particles[20].a.map((x,k)=>x-b.particles[20].a[k]))>1e-5,'G changes actual acceleration');
const repeat=run('repeat standard',PRESETS.standard);
assert.deepEqual(repeat.particles,runs.standard.particles,'deterministic initial conditions and evolution');
const refined=run('half maximum timestep',PRESETS.standard,100,{maxStep:.1});
assert.ok(Math.abs(refined.formedAt-runs.standard.formedAt)/runs.standard.formedAt<.12,'sink time stable under step refinement');
assert.ok(Math.abs(refined.sink.m-runs.standard.sink.m)<.15,'accretion stable under step refinement');
// Same step sequence, different batching: rendering/playback does not enter the equations.
const batched=new Cloud(PRESETS.standard),single=new Cloud(PRESETS.standard);
for(let i=0;i<100;i++)single.step();for(let batch=0;batch<10;batch++)for(let i=0;i<10;i++)batched.step();assert.deepEqual(batched.particles,single.particles);
if(process.argv.includes('--extremes')){
  for(const mass of [.5,4])for(const gravity of [.25,2])for(const temperature of [8,50])for(const rotation of [0,.025])run(`corner M${mass} G${gravity} T${temperature} w${rotation}`,{mass,gravity,temperature,rotation},250);
  for(const [key,c] of Object.entries(runs)){c.advance(250-c.time);check(c);if(key==='weak'||key==='warm')assert.equal(c.sink,null);}
}
console.log('All numerical checks passed.');
if(process.argv.includes('--json')){const {writeFileSync}=await import('node:fs');writeFileSync(new URL('./validation-results.json',import.meta.url),JSON.stringify({configuration:CONFIG,results},null,2)+'\n');}
