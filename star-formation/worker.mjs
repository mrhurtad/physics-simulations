import {Cloud, CONFIG} from './model.mjs';
let cloud, running=false, speed=1, debt=0, last=0, sent=0, generation=0;
function snapshot(){
  if(!cloud)return;
  const d=cloud.diagnostics();
  const sparse=cloud.particles.filter(p=>!p.sink&&p.h>4.9).length;
  postMessage({generation,running,params:cloud.params,diagnostics:d,initialL:Math.hypot(...cloud.initialL),
    particles:cloud.particles.map(p=>({id:p.id,r:p.r,v:p.v,rho:p.rho,h:p.h,m:p.m,sink:p.sink,spin:p.sink?p.spin:undefined})),
    history:cloud.history,formedAt:cloud.formedAt,error:cloud.error,sparse,
    resolution:cloud.params.mass/CONFIG.count,ended:cloud.time>=CONFIG.endTime});
}
onmessage=({data})=>{
  try {
    if(data.type==='reset'){generation=data.generation;running=false;debt=0;cloud=new Cloud(data.params);snapshot();}
    if(data.type==='play'&&cloud&&cloud.time<CONFIG.endTime&&!cloud.error){running=true;last=performance.now();snapshot();}
    if(data.type==='pause'){running=false;snapshot();}
    if(data.type==='speed')speed=data.value;
  }catch(error){running=false;postMessage({generation,fatal:error.message});}
};
function tick(){
  const now=performance.now();
  if(running&&cloud){
    // Backlog is bounded. Slow devices take longer in wall time, never larger steps.
    debt=Math.min(2,debt+Math.min(0.1,(now-last)/1000)*2*speed);
    const start=performance.now();
    while(debt>0&&performance.now()-start<12&&cloud.time<CONFIG.endTime-1e-8&&!cloud.error){
      debt-=cloud.step(Math.min(CONFIG.maxStep,CONFIG.endTime-cloud.time));
    }
    if(cloud.error||cloud.time>=CONFIG.endTime-1e-8){if(!cloud.error)cloud.time=CONFIG.endTime;running=false;cloud.record();snapshot();}
    else if(now-sent>100){sent=now;snapshot();}
  }
  last=now;setTimeout(tick,16);
}
tick();
