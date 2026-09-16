import type { FluxDriven } from './fluxNode';
export class DecoDirector {
 weights=new Float32Array(24);private source=new Float32Array(24);
 target=0;private progress=1;private duration=8;private elapsed=0;private lastBeat=-1;private lastKick=0;private slowEnergy=0;private serial=0;private previousEnergy=0;
 impulse=0;rotation=0;
 constructor(){this.weights[0]=1;this.source[0]=1;}
 update(dt:number,a:FluxDriven){
  dt=Math.max(0,Math.min(.2,dt));
  const energy=Math.max(0,Math.min(1,a.intensity)),tempo=a.bpm/60;
  const rise=energy-this.slowEnergy;
  this.slowEnergy+=(energy-this.slowEnergy)*(1-Math.exp(-dt/2.4));
  const onset=a.kick>.55&&this.lastKick<=.55;this.lastKick=a.kick;
  const beat=a.beatPosition??Math.max(0,this.lastBeat)+dt*tempo;
  const difference=beat-this.lastBeat;
  const advance=energy>.008?(this.lastBeat>=0&&difference>=0&&difference<8?difference:dt*tempo):0;
  const boundary=Math.floor(beat)!==Math.floor(this.lastBeat);this.lastBeat=beat;
  this.elapsed+=advance;
  const dramatic=(rise>.17&&energy>.45)||(onset&&energy>.6)||(this.previousEnergy-energy>.16);
  this.previousEnergy=energy;
  const interval=energy<.25?16:energy<.5?8:energy<.72?4:2;
  if((this.elapsed>=interval&&boundary)||(dramatic&&this.elapsed>.85)){
   this.source.set(this.weights);
   // Coprime stride crosses pattern families rather than stepping through near duplicates.
   this.serial++;this.target=(this.target+7+(dramatic?6:0))%24;
   this.progress=0;this.duration=dramatic?.65:energy>.65?1.25:energy>.4?3:8;
   this.elapsed=0;this.impulse=dramatic?1:this.impulse;
  }
  this.progress=Math.min(1,this.progress+advance/this.duration);
  const f=this.progress,b=f*f*f*(f*(f*6-15)+10);
  for(let i=0;i<24;i++)this.weights[i]=this.source[i]*(1-b)+(i===this.target?b:0);
  this.impulse*=Math.exp(-dt*3.8);
  // Reorientation eases through the morph, never resets the camera.
  const turn=(this.target%4)*Math.PI/2;
  this.rotation+=(turn-this.rotation)*(1-Math.exp(-dt*(.3+energy*3)));
  return this;
 }
}
