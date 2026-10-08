// Units: 1 length = 1000 AU; 1 time = kyr; 1 mass = solar mass.
export const U = Object.freeze({ AU: 1.495978707e11, MSUN: 1.98847e30, KYR: 31557600000 });
export const G = 6.67430e-11 * U.MSUN * U.KYR ** 2 / (1000 * U.AU) ** 3;
export const DENSITY_SI = U.MSUN / (1000 * U.AU) ** 3;
export const L_SI = U.MSUN * (1000 * U.AU) ** 2 / U.KYR;
export const PRESETS = Object.freeze({
  standard: { mass: 2, gravity: 1, temperature: 10, rotation: 0.008 },
  weak: { mass: 2, gravity: 0.25, temperature: 10, rotation: 0.008 },
  warm: { mass: 2, gravity: 1, temperature: 50, rotation: 0.008 },
  rapid: { mass: 2, gravity: 1, temperature: 10, rotation: 0.018 },
  low: { mass: 2, gravity: 1, temperature: 10, rotation: 0.001 }
});
export const CONFIG = Object.freeze({ count: 512, radius: 5, softening: 0.06, sinkRadius: 0.16, hMin: 0.08, maxStep: 0.2, endTime: 250 });
export function jeansMass(cs, g, rho) { return Math.PI ** 2.5 / 6 * cs ** 3 / (g ** 1.5 * Math.sqrt(rho)); }
const norm = a => Math.hypot(...a);
const cross = (r, v) => [r[1]*v[2]-r[2]*v[1], r[2]*v[0]-r[0]*v[2], r[0]*v[1]-r[1]*v[0]];
export function kernel(r, h) {
  const q = r/h, k = 1/(Math.PI*h*h*h);
  return q < 1 ? k*(1-1.5*q*q+0.75*q*q*q) : q < 2 ? k*0.25*(2-q)**3 : 0;
}
function gradient(r, h) {
  const q = r/h, k = 1/(Math.PI*h**4);
  return q < 1 ? k*(-3*q+2.25*q*q) : q < 2 ? -k*0.75*(2-q)**2 : 0;
}
function particle(id, r, v, m, h=1) { return { id, r, v, m, h, rho: 0, a: [0,0,0], spin: [0,0,0], sink: false }; }
export class Cloud {
  constructor(params=PRESETS.standard, options={}) {
    this.params = { ...params }; this.config={...CONFIG,...options};
    for (const [key,min,max] of [['mass',0.5,4],['gravity',0.25,2],['temperature',8,50],['rotation',0,0.025]]) {
      if (!Number.isFinite(params[key]) || params[key]<min || params[key]>max) throw new Error(`Invalid ${key}`);
    }
    this.g=G*params.gravity;
    this.cs=Math.sqrt(1.380649e-23*params.temperature/(2.33*1.6735575e-27))*U.KYR/(1000*U.AU);
    this.time=0; this.sink=null; this.formedAt=null; this.formation=null; this.steps=0;
    this.particles=[]; this.history=[]; this.nextSample=0; this.error='';
    // Quiet deterministic sphere: antipodal pairs, quasi-uniform solid angles.
    // M(<r) proportional to r^2: gently concentrated rho proportional to 1/r,
    // with a finite central sampling radius. All controls reuse these positions.
    const n=this.config.count, m=params.mass/n;
    for(let i=0;i<n/2;i++) {
      const radius=this.config.radius*Math.sqrt((i+0.5)/(n/2));
      const mu=2*((i*0.61803398875+0.5)%1)-1, phi=i*8.88576587632;
      const s=Math.sqrt(1-mu*mu);
      const r=[radius*s*Math.cos(phi),radius*s*Math.sin(phi),radius*mu];
      for(const sign of [1,-1]) {
        const x=r.map(a=>sign*a), v=[-params.rotation*x[1],params.rotation*x[0],0];
        this.particles.push(particle(this.particles.length,x,v,m,1.2));
      }
    }
    for(let i=0;i<4;i++) this.densities();
    this.forces(); this.initial=this.diagnostics(); this.initialL=this.angularMomentum(); this.record();
  }
  densities() {
    const ps=this.particles;
    for(const p of ps) if(!p.sink) p.rho=p.m*kernel(0,p.h);
    for(let i=0;i<ps.length;i++) { const p=ps[i]; if(p.sink)continue;
      for(let j=i+1;j<ps.length;j++){const q=ps[j];if(q.sink)continue;
        const r=Math.hypot(p.r[0]-q.r[0],p.r[1]-q.r[1],p.r[2]-q.r[2]);
        if(r<2*p.h)p.rho+=q.m*kernel(r,p.h);
        if(r<2*q.h)q.rho+=p.m*kernel(r,q.h);
      }
    }
    // Relax smoothing lengths toward ~58 neighbours within 2h.
    for(const p of ps) if(!p.sink) p.nextH=Math.max(this.config.hMin,Math.min(5,1.2*Math.cbrt(p.m/p.rho)));
  }
  forces() {
    const ps=this.particles, eps2=this.config.softening**2, cs=this.cs;
    for(const p of ps)p.a=[0,0,0];
    for(let i=0;i<ps.length;i++){const p=ps[i];
      for(let j=i+1;j<ps.length;j++){const q=ps[j];
        const dx=p.r[0]-q.r[0],dy=p.r[1]-q.r[1],dz=p.r[2]-q.r[2];
        const r2=dx*dx+dy*dy+dz*dz, r=Math.sqrt(r2);
        let f=-this.g/(r2+eps2)**1.5;
        if(!p.sink&&!q.sink&&r>1e-10&&(r<2*p.h||r<2*q.h)){
          const dot=dx*(p.v[0]-q.v[0])+dy*(p.v[1]-q.v[1])+dz*(p.v[2]-q.v[2]);
          const h=(p.h+q.h)/2, mu=h*Math.min(0,dot)/(r2+0.01*h*h);
          // Monaghan viscosity: pairwise, only converging flows; heat is radiated
          // by the isothermal closure. Central pair forces conserve angular momentum.
          const pi=(-cs*mu+2*mu*mu)/((p.rho+q.rho)/2);
          const gp=gradient(r,p.h),gq=gradient(r,q.h);
          f-=(cs*cs*(gp/p.rho+gq/q.rho)+pi*(gp+gq)/2)/r;
        }
        for(let k=0;k<3;k++){const d=k===0?dx:k===1?dy:dz;p.a[k]+=q.m*f*d;q.a[k]-=p.m*f*d;}
      }
    }
  }
  step(limit=this.config.maxStep) {
    if(this.error)return 0;
    let dt=Math.min(limit,this.config.maxStep);
    for(const p of this.particles){
      dt=Math.min(dt,0.16*Math.sqrt(this.config.softening/(norm(p.a)+1e-12)),0.16*(p.sink?this.config.softening:p.h)/(this.cs+norm(p.v)));
    }
    if(!Number.isFinite(dt)||dt<1e-7){this.error='Time step below the reliable numerical limit. Reset with less extreme conditions.';return 0;}
    for(const p of this.particles)for(let k=0;k<3;k++){p.v[k]+=0.5*dt*p.a[k];p.r[k]+=dt*p.v[k];}
    for(const p of this.particles)if(!p.sink)p.h=0.8*p.h+0.2*p.nextH;
    this.densities();this.forces();
    for(const p of this.particles)for(let k=0;k<3;k++)p.v[k]+=0.5*dt*p.a[k];
    this.time+=dt;this.steps++;
    if(this.updateSink()){this.densities();this.forces();}
    for(const p of this.particles)if(![...p.r,...p.v,p.rho].every(Number.isFinite))this.error='Numerical limit reached. Reset the experiment.';
    if(this.time>=this.nextSample){this.record();this.nextSample=this.time+1;}
    return dt;
  }
  advance(duration) { const target=this.time+duration;while(this.time<target-1e-9&&!this.error)this.step(target-this.time); }
  updateSink() {
    const rs=this.config.sinkRadius, ps=this.particles;
    if(!this.sink){
      // One central sink only. The inversion-symmetric initial cloud keeps its
      // potential minimum at the origin; fragmentation is not represented.
      const core=ps.filter(p=>norm(p.r)<rs);
      if(core.length<8)return false;
      const mass=core.reduce((s,p)=>s+p.m,0),rho=mass/(4*Math.PI*rs**3/3);
      const threshold=Math.PI*this.cs**2/(4*this.g*rs*rs);
      if(rho<threshold||mass<jeansMass(this.cs,this.g,rho))return false;
      let kinetic=0, potential=0, flow=0;
      for(let i=0;i<core.length;i++){const p=core[i];kinetic+=0.5*p.m*norm(p.v)**2;flow+=p.m*p.r.reduce((s,x,k)=>s+x*p.v[k],0);
        for(let j=i+1;j<core.length;j++){const q=core[j];potential-=this.g*p.m*q.m/Math.sqrt(p.r.reduce((s,x,k)=>s+(x-q.r[k])**2,0)+this.config.softening**2);}
      }
      if(flow>=0||kinetic+1.5*mass*this.cs**2+potential>=0)return false;
      // Reject a core when the sampled potential has a deeper off-centre minimum.
      const potentialAt=r=>ps.reduce((s,p)=>s-this.g*p.m/Math.sqrt(p.r.reduce((a,x,k)=>a+(x-r[k])**2,0)+this.config.softening**2),0);
      const centralPotential=potentialAt([0,0,0]);
      if(core.some(p=>potentialAt(p.r)<centralPotential*1.02))return false;
      this.sink=particle(-1,[0,0,0],[0,0,0],0);this.sink.sink=true;
      this.particles.push(this.sink);this.formedAt=this.time;
      this.formation={rho,threshold,mass,jeans:jeansMass(this.cs,this.g,rho),flow,energy:kinetic+1.5*mass*this.cs**2+potential};
      this.absorb(core);return true;
    }
    const star=this.sink;
    const incoming=ps.filter(p=>{
      if(p.sink)return false;
      const r=p.r.map((x,k)=>x-star.r[k]),v=p.v.map((x,k)=>x-star.v[k]),d=norm(r);
      return d<rs && r.reduce((s,x,k)=>s+x*v[k],0)<0 &&
        0.5*norm(v)**2+1.5*this.cs**2<this.g*star.m/Math.sqrt(d*d+this.config.softening**2) &&
        norm(cross(r,v))**2<this.g*star.m*rs;
    });
    if(!incoming.length)return false;this.absorb(incoming);return true;
  }
  absorb(incoming) {
    const star=this.sink, all=[star,...incoming];
    const mass=all.reduce((s,p)=>s+p.m,0);
    const r=[0,1,2].map(k=>all.reduce((s,p)=>s+p.m*p.r[k],0)/mass);
    const v=[0,1,2].map(k=>all.reduce((s,p)=>s+p.m*p.v[k],0)/mass);
    const l=[...star.spin];
    for(const p of all){const c=cross(p.r.map((x,k)=>x-r[k]),p.v.map((x,k)=>x-v[k]));for(let k=0;k<3;k++)l[k]+=p.m*c[k];}
    Object.assign(star,{m:mass,r,v,spin:l});
    const ids=new Set(incoming.map(p=>p.id));this.particles=this.particles.filter(p=>!ids.has(p.id));
  }
  angularMomentum() {
    const l=[0,0,0];for(const p of this.particles){const c=cross(p.r,p.v);for(let k=0;k<3;k++)l[k]+=p.m*c[k]+p.spin[k];}return l;
  }
  diagnostics() {
    const gas=this.particles.filter(p=>!p.sink), mass=gas.reduce((s,p)=>s+p.m,0);
    const radii=gas.map(p=>norm(p.r)).sort((a,b)=>a-b), r90=radii[Math.max(0,Math.ceil(gas.length*.9)-1)]||0;
    const rho=mass>0&&r90>0 ? 0.9*mass/(4*Math.PI*r90**3/3):0;
    const centralGas=gas.filter(p=>norm(p.r)<this.config.sinkRadius).reduce((s,p)=>s+p.m,0);
    const centralDensity=centralGas/(4*Math.PI*this.config.sinkRadius**3/3);
    const peakDensity=Math.max(0,...gas.map(p=>p.rho));
    const contraction=gas.reduce((s,p)=>s+p.m*p.r.reduce((a,x,k)=>a+x*p.v[k],0),0);
    const disk=[];
    if(this.sink)for(const p of gas){
      const r=p.r.map((x,k)=>x-this.sink.r[k]),v=p.v.map((x,k)=>x-this.sink.v[k]);
      const R=Math.hypot(r[0],r[1]),d=norm(r),j=r[0]*v[1]-r[1]*v[0];
      const vphi=j/Math.max(R,1e-8),vr=(r[0]*v[0]+r[1]*v[1])/Math.max(R,1e-8);
      const enclosed=this.sink.m+gas.reduce((s,q)=>s+(norm(q.r.map((x,k)=>x-this.sink.r[k]))<d?q.m:0),0);
      const support=vphi*vphi* (R*R+this.config.softening**2)**1.5/(this.g*enclosed*Math.max(R*R,1e-8));
      if(R>this.config.sinkRadius&&Math.abs(r[2])<0.35*R&&support>0.45&&support<1.6&&Math.abs(vr)<0.6*Math.abs(vphi)&&0.5*norm(v)**2<this.g*enclosed/Math.sqrt(d*d+this.config.softening**2))disk.push(p);
    }
    const diskMass=disk.reduce((s,p)=>s+p.m,0),diskRadius=disk.length?Math.max(...disk.map(p=>Math.hypot(p.r[0]-this.sink.r[0],p.r[1]-this.sink.r[1]))):0;
    let stage=0;
    if(contraction<0&&this.initial&&r90<this.initial.r90*.92)stage=1;
    if(peakDensity>0.15)stage=2;
    if(this.sink)stage=3;
    if(this.sink&&diskMass>this.params.mass*.04)stage=4;
    return {time:this.time,gasMass:mass,starMass:this.sink?.m||0,r90,rho,centralDensity,peakDensity,
      jeans:rho>0?jeansMass(this.cs,this.g,rho):Infinity,L:norm(this.angularMomentum()),diskMass,diskRadius,diskIds:disk.map(p=>p.id),stage};
  }
  record() {const d=this.diagnostics();this.history.push({time:d.time,mass:d.starMass,density:d.centralDensity,radius:d.r90});}
}
