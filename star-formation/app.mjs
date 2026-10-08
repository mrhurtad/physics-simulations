import { PRESETS, CONFIG, DENSITY_SI, L_SI, G } from './model.mjs';
const $=id=>document.getElementById(id);
const controls=['mass','gravity','temperature','rotation'];
const stages=[['Molecular cloud','Cold gas is supported partly by thermal pressure. This cloud may contract or disperse.'],['Gravitational collapse','The cloud is contracting as self-gravity overcomes internal support.'],['Dense central core','Gas has accumulated at high density. A sink still requires bound, converging, Jeans-unstable material.'],['Protostar formation','A central sink represents an unresolved protostar, growing by accretion. Sustained hydrogen fusion is not modeled.'],['Circumstellar disk','Bound gas is flattened and rotationally supported around the sink. Its extent follows the computed dynamics.']];
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
let state=null,generation=0,trailMap=new Map(),observations=[],lastTrailTime=-1,scale=null;
const canvas=$('space'),ctx=canvas.getContext('2d'),graph=$('graph'),gc=graph.getContext('2d');
const fmt=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—';
const scientific=n=>n===0?'0':n.toExponential(2).replace('e+','e');
function params(){return Object.fromEntries(controls.map(id=>[id,Number($(id).value)]));}

/* ---------- snapshot interpolation ----------
   The worker sends computed states about 10 times per second. The renderer draws
   straight-line interpolations between the two most recent computed states, so
   motion is smooth without inventing new physics: every drawn position lies
   between two positions the solver actually produced (typically 1–5 steps apart). */
let prevSnap=null,curSnap=null,arrival=0,interval=100;
function indexSnapshot(s){s.byId=new Map(s.particles.map(p=>[p.id,p]));s.sinkP=s.particles.find(p=>p.sink)||null;return s;}

/* ---------- camera ---------- */
const RAD=Math.PI/180;
const VIEWS={inclined:{az:0,el:31.3},top:{az:0,el:90},edge:{az:0,el:0}};
let cam={...VIEWS.inclined},camTarget={...VIEWS.inclined},drag=null,dragged=false;

/* ---------- visual-only state (never sent to the solver) ---------- */
let flare=0,formFlash=null,jetLevel=0,jetTarget=0,frameAvg=1/60,detail=true;
const FORCE_HQ=new URLSearchParams(location.search).has('hq');   // ?hq keeps full detail on slow machines

function reset(){
  generation++;state=null;trailMap.clear();lastTrailTime=-1;scale=null;prevSnap=curSnap=null;flare=0;formFlash=null;jetLevel=jetTarget=0;
  const p=params();
  $('mass-value').textContent=fmt(p.mass,1)+' M☉';$('gravity-value').textContent=fmt(p.gravity,2)+' G';$('temperature-value').textContent=p.temperature+' K';$('rotation-value').textContent=fmt(p.rotation,3);
  $('play').disabled=true;$('pause').disabled=true;$('run-state').textContent='INITIALIZING';
  worker.postMessage({type:'reset',params:p,generation});
}
function setPreset(name){for(const id of controls)$(id).value=PRESETS[name][id];reset();}
for(const id of controls){$(id).addEventListener('input',()=>{$('preset').value='custom';reset();});}
$('preset').addEventListener('change',()=>{if(PRESETS[$('preset').value])setPreset($('preset').value);});
$('play').onclick=()=>worker.postMessage({type:'play'});
$('pause').onclick=()=>worker.postMessage({type:'pause'});
$('reset').onclick=reset;
$('speed').onchange=()=>worker.postMessage({type:'speed',value:Number($('speed').value)});
$('view').onchange=()=>{const v=VIEWS[$('view').value];if(v){$('orbit').checked=false;camTarget={...v};cam.az=((cam.az%360)+540)%360-180;}};
$('trails').onchange=()=>trailMap.clear();
document.addEventListener('keydown',e=>{
  if(e.code!=='Space'||e.target.closest('input,textarea,select,button,summary'))return;
  e.preventDefault();if(!state)return;
  worker.postMessage({type:state.running?'pause':'play'});
});

worker.onmessage=({data})=>{
  if(data.generation!==generation)return;
  if(data.fatal){$('warning').hidden=false;$('warning').textContent='The simulation could not start: '+data.fatal;return;}
  const now=performance.now(),snap=indexSnapshot(data);
  if(curSnap&&snap.diagnostics.time>curSnap.diagnostics.time){
    interval=0.7*interval+0.3*Math.min(400,Math.max(30,now-arrival));
    prevSnap=curSnap;arrival=now;
    const before=curSnap.diagnostics.starMass,after=snap.diagnostics.starMass;
    if(after>before){if(before===0)formFlash=now;flare=Math.min(1.6,flare+6*(after-before)/snap.params.mass);}
  } else if(!curSnap){prevSnap=null;arrival=now;}
  curSnap=snap;state=snap;updateUI();
  const rate=accretionRate();
  jetTarget=rate&&rate>0?Math.min(.85,Math.sqrt(rate/8e-6)):0;
  if($('trails').checked&&data.diagnostics.time!==lastTrailTime){
    for(const p of data.particles){if(p.sink)continue;const a=trailMap.get(p.id)||[];a.push([...p.r]);if(a.length>24)a.shift();trailMap.set(p.id,a);}
    for(const id of trailMap.keys())if(!snap.byId.has(id))trailMap.delete(id);
    lastTrailTime=data.diagnostics.time;
  }
};
worker.onerror=()=>{$('warning').hidden=false;$('warning').textContent='The physics worker could not load. Serve this folder over HTTP (see README); do not open it as a file:// URL.';$('play').disabled=true;};

function accretionRate(){
  // Measured from the sink-mass history over the last ~5 kyr, in M☉ per year.
  const h=state.history,t=state.diagnostics.time,m=state.diagnostics.starMass;
  if(!m||!h.length)return null;
  let ref=null;for(let i=h.length-1;i>=0;i--)if(h[i].time<=t-5){ref=h[i];break;}
  if(!ref||t-ref.time<1)return null;
  return (m-ref.mass)/(t-ref.time)/1000;
}
function updateUI(){
  const d=state.diagnostics,p=state.params;
  $('play').disabled=state.running||state.ended||!!state.error;$('pause').disabled=!state.running;
  $('run-state').textContent=state.error?'NUMERICAL LIMIT':state.ended?'EXPERIMENT COMPLETE · RESET TO REPEAT':state.running?'SIMULATION RUNNING':d.time>0?'PAUSED':'READY TO EXPLORE';
  const supported=.9*d.gasMass<=d.jeans;
  $('stability').textContent=d.gasMass===0?'No gas remaining':supported?'Thermally Supported':'Gravitationally Unstable';
  $('stability').classList.toggle('supported',supported);
  const lerr=Math.abs(d.L-state.initialL)/Math.max(state.initialL,1e-10);
  const rate=accretionRate();
  const rows=[['Initial cloud mass',fmt(p.mass)+' M☉'],['Remaining gas mass',fmt(d.gasMass,3)+' M☉'],['Protostar (sink) mass',fmt(d.starMass,3)+' M☉'],['Accretion rate · last 5 kyr',rate===null?'—':scientific(rate)+' M☉/yr'],['Cloud temperature',p.temperature+' K'],['Central gas density',scientific(d.centralDensity*DENSITY_SI)+' kg/m³'],['Peak smoothed gas density',scientific(d.peakDensity*DENSITY_SI)+' kg/m³'],['Cloud radius · R₉₀',fmt(d.r90*1000,0)+' AU'],['Total |L|',scientific(d.L*L_SI)+' kg m²/s'],['|L| drift',fmt(lerr*100,5)+'%'],['Jeans mass · gas diagnostic',fmt(d.jeans)+' M☉'],['Disk gas · diagnostic',fmt(d.diskMass,3)+' M☉'],['Disk outer radius',d.diskRadius?fmt(d.diskRadius*1000,0)+' AU':'—'],['Simulation time',fmt(d.time,1)+' kyr']];
  if(d.starMass){const gas=state.particles.filter(q=>!q.sink),j=gas.reduce((s,q)=>s+q.m*Math.abs(q.r[0]*q.v[1]-q.r[1]*q.v[0]),0)/Math.max(d.gasMass,1e-10);rows.push(['Mean-j centrifugal radius',fmt(j*j/(G*p.gravity*d.starMass)*1000,0)+' AU']);}
  $('metrics').replaceChildren(...rows.map(([label,value])=>{const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);return div;}));
  $('budget').textContent=fmt((d.gasMass+d.starMass)/p.mass*100,3)+'%';$('star-fraction').style.width=d.starMass/p.mass*100+'%';
  $('stage-number').textContent=String(d.stage+1).padStart(2,'0');$('stage-title').textContent=stages[d.stage][0];$('stage-description').textContent=stages[d.stage][1];
  $('sink-status').textContent=state.formedAt===null?'No sink object exists yet':'Sink formed at '+fmt(state.formedAt,1)+' kyr';
  const warnings=[];
  if(state.error)warnings.push(state.error);
  if(state.sparse>state.particles.length*.1)warnings.push('Dispersed gas is poorly sampled: some smoothing lengths reached 5,000 AU. Late-time density and pressure are qualitative.');
  if(d.diskMass>0&&d.diskMass/state.resolution<32)warnings.push('The disk diagnostic contains fewer than 32 gas elements; its size and structure are poorly resolved.');
  if(p.rotation>=.02)warnings.push('Rapid rotation may favor fragmentation in nature. This model supports only one central sink.');
  $('warning').hidden=!warnings.length;$('warning').textContent=warnings.join(' ');
  drawGraph();
}
function fit(c,context){const r=c.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}context.setTransform(dpr,0,0,dpr,0,0);return [r.width,r.height];}

/* ---------- 3D camera ----------
   az rotates about the z (initial spin) axis; el is the camera elevation above
   the x–y plane (31.3° reproduces the original inclined view). A pinhole
   perspective is applied about the cloud centre; the scale bar is exact for
   material in the plane through the centre facing the camera. */
function camera(w,h,s,dist){
  const ca=Math.cos(cam.az*RAD),sa=Math.sin(cam.az*RAD),se=Math.sin(cam.el*RAD),ce=Math.cos(cam.el*RAD);
  const rot=r=>{const x=r[0]*ca-r[1]*sa,y=r[0]*sa+r[1]*ca,z=r[2];return [x,y*se+z*ce,y*ce-z*se];};
  const proj=r=>{const v=rot(r),f=dist/Math.max(dist*.2,dist+v[2]);return [w/2+v[0]*s*f,h/2-v[1]*s*f,v[2],f];};
  return {rot,proj};
}

/* ---------- deterministic randomness for visual texture ---------- */
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const gauss=rnd=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
// Each gas element is drawn as a small puff of sub-sprites spread inside its own
// smoothing kernel (offsets in units of h, fixed per element), so the volume reads
// as continuous gas. Sub-sprites carry no mass and never feed back into the solver.
const PUFF=(()=>{const rnd=mulberry(1234),out=[];for(let i=0;i<CONFIG.count;i++){const o=[];for(let k=0;k<3;k++)o.push([gauss(rnd)*.5,gauss(rnd)*.5,gauss(rnd)*.5]);out.push(o);}return out;})();
// A star sphere at infinity (with a Milky Way–like band) turns with the camera.
const SKY=(()=>{const rnd=mulberry(77),out=[],tilt=62*RAD;
  const push=(v,b,band)=>{const n=Math.hypot(...v);out.push({d:v.map(x=>x/n),b,band});};
  for(let i=0;i<650;i++){const z=2*rnd()-1,t=2*Math.PI*rnd(),s=Math.sqrt(1-z*z);push([s*Math.cos(t),s*Math.sin(t),z],rnd()**3,false);}
  for(let i=0;i<1100;i++){const t=2*Math.PI*rnd(),sc=.11*gauss(rnd);const v=[Math.cos(t),Math.sin(t)*Math.cos(tilt),Math.sin(t)*Math.sin(tilt)];v[0]+=sc*.3;v[1]+=-sc*Math.sin(tilt);v[2]+=sc*Math.cos(tilt);push(v,rnd()**4*.6,true);}
  return out.map(st=>({...st,color:st.band?`rgba(150,165,205,${.25+.45*st.b})`:st.b>.6?'rgba(235,240,255,.95)':st.b>.25?'rgba(170,185,215,.75)':'rgba(110,125,155,.6)',size:st.band?.8:st.b>.6?1.7:st.b>.25?1.2:.8}));
})();
const BAND=SKY.filter((s,i)=>s.band&&i%14===0);

/* ---------- pre-rendered glow sprites ---------- */
const SPRITE=48,sprites=new Map();
function sprite(rgb){
  const key=rgb.join(',');let c=sprites.get(key);if(c)return c;
  c=document.createElement('canvas');c.width=c.height=SPRITE;const g=c.getContext('2d'),r=SPRITE/2;
  const grad=g.createRadialGradient(r,r,0,r,r,r);grad.addColorStop(0,`rgba(${key},1)`);grad.addColorStop(.45,`rgba(${key},.42)`);grad.addColorStop(1,`rgba(${key},0)`);
  g.fillStyle=grad;g.fillRect(0,0,SPRITE,SPRITE);sprites.set(key,c);return c;
}
const DUST=[9,9,15];
const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
function gasColor(level,illum,density){
  // cold gas: blue → pale with density; gas near the protostar warms toward amber.
  const lv=Math.round(level*15)/15,il=Math.round(illum*11)/11;
  const base=density?[65+190*lv,133+88*lv,180-18*lv]:[120,181,214],warm=[255,168,96];
  return base.map((c,k)=>Math.round(c+(warm[k]-c)*il*.85));
}

let lastFrame=performance.now();
function render(now){
  now=now||performance.now();
  const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(!drag){
    if($('orbit').checked){camTarget.az+=dt*7;cam.az+=dt*7;}
    const k=1-Math.exp(-dt*6);cam.az+=(camTarget.az-cam.az)*k;cam.el+=(camTarget.el-cam.el)*k;
  }
  flare*=Math.exp(-dt*2.2);
  if(dt>0&&!FORCE_HQ){frameAvg=.95*frameAvg+.05*dt;if(detail&&frameAvg>.034)detail=false;else if(!detail&&frameAvg<.019)detail=true;}jetLevel+=(jetTarget-jetLevel)*(1-Math.exp(-dt*1.5));
  const [w,h]=fit(canvas,ctx);ctx.fillStyle='#050b15';ctx.fillRect(0,0,w,h);
  const mode=$('zoom').value,d=curSnap?curSnap.diagnostics:null;
  const extent=!d?6:mode==='auto'?Math.max(.8,d.r90*1.35):6/Number(mode);
  const target=Math.min(w,h)/(2*extent);
  scale=scale===null?target:scale+(1-Math.exp(-dt*5))*(target-scale);
  const s=scale,C=camera(w,h,s,extent*3.2);
  // sky: stars at infinity, rotate with the camera
  const F=.85*Math.max(w,h);
  ctx.globalCompositeOperation='lighter';
  for(const b of BAND){const v=C.rot(b.d);if(v[2]<.1)continue;const x=w/2+v[0]/v[2]*F,y=h/2-v[1]/v[2]*F;if(x<-90||x>w+90||y<-90||y>h+90)continue;ctx.globalAlpha=.035;ctx.drawImage(sprite([70,88,135]),x-90,y-90,180,180);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  for(const st of SKY){const v=C.rot(st.d);if(v[2]<.08)continue;const x=w/2+v[0]/v[2]*F,y=h/2-v[1]/v[2]*F;if(x<0||x>w||y<0||y>h)continue;ctx.fillStyle=st.color;ctx.fillRect(x,y,st.size,st.size);}
  if(curSnap){
    const cur=curSnap,prev=prevSnap,density=$('density').checked;
    const a=prev?Math.min(1,(now-arrival)/interval):1;
    // interpolated sink
    let sinkR=null,sinkM=0,sinkFade=1;
    if(cur.sinkP){const ps=prev&&prev.sinkP;sinkR=ps?lerp3(ps.r,cur.sinkP.r,a):cur.sinkP.r;sinkM=ps?ps.m+(cur.sinkP.m-ps.m)*a:cur.sinkP.m;sinkFade=ps?1:a;}
    // interpolated gas
    const items=[],itemById=new Map();
    const add=(p,r,rho,hh,fade)=>{const it={p,r,rho,h:hh,fade,q:C.proj(r)};items.push(it);return it;};
    for(const p of cur.particles){if(p.sink)continue;const q=prev&&prev.byId.get(p.id);itemById.set(p.id,add(p,q?lerp3(q.r,p.r,a):p.r,q?q.rho+(p.rho-q.rho)*a:p.rho,q?q.h+(p.h-q.h)*a:p.h,1));}
    // gas absorbed during this interval is drawn falling into the sink and fading
    if(prev&&cur.sinkP&&a<1){for(const q of prev.particles){if(q.sink||cur.byId.has(q.id))continue;add(q,lerp3(q.r,cur.sinkP.r,a),q.rho,q.h*(1-a),1-a);}}
    let sinkItem=null;if(sinkR){sinkItem={sink:true,q:C.proj(sinkR)};items.push(sinkItem);}
    items.sort((A,B)=>B.q[2]-A.q[2]);           // far → near
    if($('trails').checked){ctx.strokeStyle='#76abc03d';ctx.lineWidth=.7;for(const [id,points] of trailMap){ctx.beginPath();points.forEach((r,i)=>{const q=C.proj(r);if(i)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);});const it=itemById.get(id);if(it)ctx.lineTo(it.q[0],it.q[1]);ctx.stroke();}}
    const glowStar=()=>{
      const [x,y,,f]=sinkItem.q,fl=Math.min(1,flare),radius=(11+12*Math.sqrt(sinkM/cur.params.mass))*(1+.55*fl)*Math.min(1.6,f);
      ctx.globalCompositeOperation='lighter';ctx.globalAlpha=sinkFade;
      const halo=radius*3.2;ctx.globalAlpha=sinkFade*(.22+.25*fl);ctx.drawImage(sprite([255,176,104]),x-halo,y-halo,2*halo,2*halo);
      ctx.globalAlpha=sinkFade;const g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,'#fffbea');g.addColorStop(.12,'#ffe3a8');g.addColorStop(.35,'#c8722080');g.addColorStop(1,'#b8661d00');ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,2*radius,2*radius);
      ctx.globalAlpha=1;
    };
    for(const it of items){
      if(it.sink){glowStar();continue;}
      const [x,y,,f]=it.q,level=Math.max(0,Math.min(1,(Math.log10(Math.max(it.rho,1e-6))+3)/4));
      let illum=0;if(sinkR){const dx=it.r[0]-sinkR[0],dy=it.r[1]-sinkR[1],dz=it.r[2]-sinkR[2];illum=Math.min(1,.06*sinkM/(dx*dx+dy*dy+dz*dz+.01));}
      const near=Math.max(.55,Math.min(1.15,f)),radius=Math.min(46,Math.max(4,it.h*s*f*.6));
      // dust: dims whatever lies behind this element
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=Math.min(.38,(.04+.26*level)*it.fade)*(radius>40?.4:1);
      const dr=radius*.95;ctx.drawImage(sprite(DUST),x-dr,y-dr,2*dr,2*dr);
      // emission / scattered light
      const col=gasColor(level,illum,density),sp=sprite(col);
      ctx.globalCompositeOperation='lighter';
      const al=(.06+.10*level+.2*illum)*near*it.fade;
      ctx.globalAlpha=al;ctx.drawImage(sp,x-radius,y-radius,2*radius,2*radius);
      const id=it.p.id;if(detail&&id>=0&&id<PUFF.length){const sr=radius*.7;ctx.globalAlpha=al*.75;for(const o of PUFF[id]){const q=C.proj([it.r[0]+o[0]*it.h,it.r[1]+o[1]*it.h,it.r[2]+o[2]*it.h]);ctx.drawImage(sp,q[0]-sr,q[1]-sr,2*sr,2*sr);}}
      ctx.globalAlpha=Math.min(1,(.45+.4*level+.3*illum)*near*it.fade);ctx.fillStyle=`rgb(${col})`;ctx.fillRect(x-.9-level*.6,y-.9-level*.6,1.8+level*1.2,1.8+level*1.2);
    }
    ctx.globalAlpha=1;
    // illustrative bipolar jets along the sink's computed spin axis
    let jetsShown=false;
    if(sinkR&&$('jets').checked&&jetLevel>.03){
      jetsShown=true;
      const sp=cur.sinkP.spin||[0,0,1],n=Math.hypot(...sp);let ax=n>1e-12?sp.map(x=>x/n):[0,0,1];
      const ref=Math.abs(ax[0])<.9?[1,0,0]:[0,1,0],e1=[ax[1]*ref[2]-ax[2]*ref[1],ax[2]*ref[0]-ax[0]*ref[2],ax[0]*ref[1]-ax[1]*ref[0]],en=Math.hypot(...e1);for(let k=0;k<3;k++)e1[k]/=en;
      const e2=[ax[1]*e1[2]-ax[2]*e1[1],ax[2]*e1[0]-ax[0]*e1[2],ax[0]*e1[1]-ax[1]*e1[0]];
      const L=Math.min(extent*.95,.5+2.2*jetLevel),t=now/1000;
      ctx.globalCompositeOperation='lighter';
      for(const sg of [1,-1])for(let i=1;i<=42;i++){
        const u=i/42,wob=.03*u*L,ph=i*2.4,off=[0,1,2].map(k=>e1[k]*Math.cos(ph+t)*wob+e2[k]*Math.sin(ph+t)*wob);
        const r=[0,1,2].map(k=>sinkR[k]+sg*ax[k]*(.04+u*L)+off[k]),q=C.proj(r);
        const knot=.5+.5*Math.sin(2*Math.PI*(u*4.5-t*.45));
        const col=u<.3?[175,205,255]:u<.65?[225,190,215]:[255,145,110];
        const rad=(2+9*u)*Math.min(1.6,q[3]);
        ctx.globalAlpha=jetLevel*.85*Math.pow(1-u,.8)*(.07+.25*knot);ctx.drawImage(sprite(col),q[0]-rad,q[1]-rad,2*rad,2*rad);
      }
      ctx.globalAlpha=1;
    }
    ctx.globalCompositeOperation='source-over';
    const starQ=sinkItem&&sinkItem.q;
    if(formFlash!==null&&starQ){const t=(now-formFlash)/1400;if(t<1){ctx.strokeStyle=`rgba(255,224,163,${.75*(1-t)})`;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(starQ[0],starQ[1],14+70*t,0,2*Math.PI);ctx.stroke();}else formFlash=null;}
    if($('vectors').checked){ctx.strokeStyle='#adcfe698';ctx.lineWidth=.8;let n=0;for(const it of itemById.values()){if(n++%4)continue;const p=it.p,q=it.q,end=C.proj(it.r.map((x,k)=>x+p.v[k]*1.5)),dx=end[0]-q[0],dy=end[1]-q[1],ang=Math.atan2(dy,dx);ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(end[0],end[1]);ctx.lineTo(end[0]-4*Math.cos(ang-.45),end[1]-4*Math.sin(ang-.45));ctx.moveTo(end[0],end[1]);ctx.lineTo(end[0]-4*Math.cos(ang+.45),end[1]-4*Math.sin(ang+.45));ctx.stroke();}}
    const length=10**Math.floor(Math.log10(90/s)),pixels=length*s;
    ctx.strokeStyle='#647e92';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(20,h-49);ctx.lineTo(20+pixels,h-49);ctx.stroke();ctx.fillStyle='#8faabe';ctx.font='11px monospace';ctx.fillText(Math.round(length*1000).toLocaleString()+' AU',20,h-56);
    if(starQ){ctx.fillStyle='#ddc6a1';ctx.font='11px sans-serif';ctx.fillText('Unresolved protostar',Math.min(w-135,Math.max(10,starQ[0]+24)),Math.max(74,starQ[1]-16));}
    let y0=62;ctx.font='11px sans-serif';ctx.fillStyle='#7b94a7';
    const offscreen=[...itemById.values()].filter(({q})=>q[0]<0||q[0]>w||q[1]<0||q[1]>h).length;
    if(offscreen){ctx.fillText(offscreen+' elements outside view · still simulated',20,y0);y0+=16;}
    if(jetsShown){ctx.fillStyle='#c9a9b4';ctx.fillText(w<560?'Jets: illustration · not simulated':'Jets: illustration along the computed spin axis · outflows are not simulated',20,y0);}
    const time=prev?prev.diagnostics.time+(d.time-prev.diagnostics.time)*a:d.time;
    $('time-overlay').textContent=fmt(time,1)+' kyr';
  }
  drawAxes(w,h,C);
  if(!dragged&&!$('orbit').checked){ctx.fillStyle='#7b94a7';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(w<560?'Drag to rotate in 3D':'Drag to rotate in 3D · double-click to reset',w/2,w<560?h-74:h-20);ctx.textAlign='left';}
  requestAnimationFrame(render);
}
// Orientation triad: z is the initial rotation axis.
function drawAxes(w,h,C){
  const ox=w-46,oy=90,L=22;
  const axes=[[[1,0,0],'x','#c98b7d'],[[0,1,0],'y','#8fb89a'],[[0,0,1],'z','#d9bb6a']].map(([v,l,c])=>{const r=C.rot(v);return {x:r[0]*L,y:-r[1]*L,depth:r[2],l,c};});
  axes.sort((A,B)=>B.depth-A.depth);
  ctx.font='10px sans-serif';ctx.lineWidth=1.4;ctx.textAlign='center';
  for(const ax of axes){ctx.strokeStyle=ax.c;ctx.globalAlpha=ax.depth>0?.5:.95;ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(ox+ax.x,oy+ax.y);ctx.stroke();ctx.fillStyle=ax.c;ctx.fillText(ax.l,ox+ax.x*1.35,oy+ax.y*1.35+3);}
  ctx.globalAlpha=1;ctx.fillStyle='#8a7c55';ctx.font='9px sans-serif';ctx.fillText('z = initial spin axis',ox-8,oy+40);ctx.textAlign='left';
}
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,az:cam.az,el:cam.el};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
canvas.addEventListener('pointermove',e=>{
  if(!drag)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>3){dragged=true;$('view').value='custom';$('orbit').checked=false;}
  cam.az=drag.az-dx*.4;cam.el=Math.max(-90,Math.min(90,drag.el+dy*.4));camTarget={...cam};
});
const endDrag=()=>{drag=null;canvas.classList.remove('dragging');};
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('dblclick',()=>{$('view').value='inclined';$('orbit').checked=false;cam.az=((cam.az%360)+540)%360-180;camTarget={...VIEWS.inclined};});

function drawGraph(){
  const [w,h]=fit(graph,gc);gc.clearRect(0,0,w,h);if(!state)return;
  const left=33,right=w-12,top=9,bottom=h-22,maxT=Math.max(50,Math.ceil(state.diagnostics.time/50)*50),maxM=state.params.mass;
  gc.font='10px monospace';gc.lineWidth=1;
  for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;gc.strokeStyle='#e7edf1';gc.beginPath();gc.moveTo(left,y);gc.lineTo(right,y);gc.stroke();gc.fillStyle='#647785';gc.fillText(fmt(maxM*i/4,1),1,y+3);const x=left+(right-left)*i/4;gc.fillText(fmt(maxT*i/4,0),x-5,h-6);}
  gc.strokeStyle='#b97d24';gc.lineWidth=2;gc.beginPath();const history=[...state.history,{time:state.diagnostics.time,mass:state.diagnostics.starMass}];
  history.forEach((p,i)=>{const x=left+(right-left)*p.time/maxT,y=bottom-(bottom-top)*p.mass/maxM;if(i)gc.lineTo(x,y);else gc.moveTo(x,y);});gc.stroke();
  if(state.formedAt===null){gc.fillStyle='#8797a3';gc.font='11px sans-serif';gc.fillText('No central object has formed',left+13,top+25);}
}
function download(name,text){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(rows){return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');}
$('export').onclick=()=>{if(!state)return;const p=state.params;download('protostar-time-series.csv',csv([['mass_Msun','gravity_multiplier','temperature_K','rotation_per_kyr','time_kyr','sink_mass_Msun','central_gas_density_kg_m3','R90_AU'],...state.history.map(h=>[p.mass,p.gravity,p.temperature,p.rotation,h.time,h.mass,h.density*DENSITY_SI,h.radius*1000])]));};
$('record').onclick=()=>{if(!state)return;const d=state.diagnostics,p=state.params,values=[p.mass,p.gravity,p.temperature,p.rotation,fmt(d.time,1),fmt(d.starMass,3),fmt(d.diskMass,3)];const row=document.createElement('tr');for(const val of values){const td=document.createElement('td');td.textContent=val;row.append(td);}const td=document.createElement('td'),notes=document.createElement('textarea');notes.setAttribute('aria-label','Notes for observation '+(observations.length+1));notes.value=stages[d.stage][0];td.append(notes);row.append(td);$('observations').append(row);observations.push({values,notes});$('notebook').open=true;$('record').textContent='✓ Observation '+observations.length+' recorded';};
$('download-notes').onclick=()=>download('protostar-observations.csv',csv([['mass_Msun','gravity_multiplier','temperature_K','rotation_per_kyr','time_kyr','sink_mass_Msun','disk_mass_Msun','notes'],...observations.map(o=>[...o.values,o.notes.value])]));
new ResizeObserver(()=>{if(state)drawGraph();}).observe(graph);
setPreset('standard');requestAnimationFrame(render);
