// fluxDirector — the beat-cut camera director for the Flux scenes (the Deco Morph scene has its own).
//
// Cuts on the beat between shot types built around each scene's own orbital framing (target,
// radius, yaw, pitch, fov): a slow base drift, push-ins, tight angled close-ups, orbits, crane moves,
// snap zooms and dutch angles. Shot length is 2–16 beats, shorter when the music is intense; a drop
// (fast energy jumping over the long-term level) forces a cut. Kicks punch the lens, snares jolt the
// roll. Scenes that were composed as fixed shots (cam.lock) get the GENTLE variant: the same cuts
// with smaller moves, so a tunnel still looks down its tunnel and a wall stays a wall.
// Deterministic from the driven audio and clip time, so offline renders match the live monitor.
import type { FluxDriven } from '../../../../services/fabula/fluxNode';

export interface FluxShot { yaw: number; pitch: number; radiusMul: number; fovMul: number; roll: number; tx: number; ty: number;
  focusMul?:number; focusStrength?:number; kind?:string; cutIndex?:number; event?:'hold'|'build'|'drop'|'breakdown'|'phrase' }

const KINDS = ['base', 'push', 'tight', 'orbit', 'crane', 'snap', 'dutch'] as const;
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class FluxDirector {
  private cinematic = new FluxCinematicDirector();
  private lastT = -1; private clock = 0; private start = 0; private n = 0; private len = 8; private seed = 0.5;
  private kind: (typeof KINDS)[number] = 'base';
  private eF = 0; private eS = 0; private lastDrop = -99; private jolt = 0; private prevSnare = 0;
  private readonly shot: FluxShot = { yaw: 0, pitch: 0, radiusMul: 1, fovMul: 1, roll: 0, tx: 0, ty: 0 };

  update(a: FluxDriven, t: number, gentle: boolean, immersive=false): FluxShot {
    if(immersive)return this.cinematic.update(a,t);
    if (this.lastT < 0 || t < this.lastT || t - this.lastT > 2) { this.clock = 0; this.start = 0; this.n = 0; this.eF = this.eS = 0; this.lastDrop = -99; this.jolt = 0; }
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(0.2, Math.max(0, t - this.lastT));
    this.lastT = t;
    const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
    this.clock += dt * (0.8 + energy * 0.6);
    const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : this.clock * 2;
    const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
    this.eF += (energy - this.eF) * k1(0.35); this.eS += (energy - this.eS) * k1(8);
    const drop = this.eF - this.eS > 0.25 && beats - this.lastDrop > 16;
    if (drop) this.lastDrop = beats;

    if (drop || beats - this.start >= this.len || beats < this.start) {
      this.start = Math.floor(beats); this.n++;
      const e = this.eF;
      const lens = e > 0.55 ? [2, 2, 4, 4, 8] : e > 0.3 ? [2, 4, 4, 8, 8, 16] : [4, 8, 8, 16];
      this.len = lens[Math.floor(hash(this.n * 5.17) * lens.length)];
      this.kind = drop ? (hash(t) > 0.5 ? 'snap' : 'push') : KINDS[Math.floor(hash(this.n * 2.31) * KINDS.length)];
      this.seed = hash(this.n * 9.13);
    }
    const u = Math.min(1, Math.max(0, (beats - this.start) / this.len)), ease = u * u * (3 - 2 * u);
    const side = this.seed > 0.5 ? 1 : -1, g = gentle ? 0.35 : 1;
    const s = this.shot;
    s.yaw = 0; s.pitch = 0; s.radiusMul = 1; s.fovMul = 1; s.roll = 0; s.tx = 0; s.ty = 0;
    switch (this.kind) {
      case 'base': s.radiusMul = 1 - 0.08 * u * g; s.yaw = side * 6 * u * g; break;
      case 'push': s.radiusMul = 1 - 0.5 * ease * (gentle ? 0.6 : 1); break;
      case 'tight':
        s.radiusMul = gentle ? 0.7 : 0.45; s.yaw = side * (25 + 10 * u) * g; s.pitch = hash(this.seed * 7) * 16 * g;   // tilts only up: going under a landscape scene reads as a black screen
        s.tx = (hash(this.seed * 3) - 0.5) * 0.3 * g; s.ty = (hash(this.seed * 11) - 0.5) * 0.2 * g;
        s.fovMul = 0.85; s.roll = (hash(this.seed * 13) - 0.5) * 0.35 * g; break;
      case 'orbit': s.yaw = side * (15 + 55 * ease) * g; s.radiusMul = 0.9; break;
      case 'crane': s.pitch = (side > 0 ? u : 1 - u) * 34 * g; s.radiusMul = 0.8; s.tx = (u - 0.5) * 0.25 * side * g; break;
      case 'snap': { const z = 1 - Math.pow(1 - Math.min(1, u * 4), 3); s.fovMul = side > 0 ? 1 - 0.45 * z : 0.55 + 0.45 * z; break; }
      case 'dutch': s.roll = side * 0.3 * (gentle ? 0.6 : 1); s.radiusMul = 0.85; break;
    }
    const snare = a.snare ?? 0;
    if (snare > 0.45 && this.prevSnare <= 0.45) this.jolt += (hash(t * 5.3) - 0.5) * 0.3 * g;
    this.prevSnare = snare;
    this.jolt *= Math.exp(-dt / 0.25);
    s.roll += this.jolt;
    s.fovMul *= 1 - (a.kick ?? 0) * 0.08;
    return s;
  }
}

const CINEMA_SHOTS=['establishing','landscape','macro','rack','dutch','orbit','truck','crane','flythrough'] as const;
type CinemaKind=typeof CINEMA_SHOTS[number];
/** Phrase detector: fast/slow energy contrast arms a build, snare onsets cut
 * its montage, and bass transients resolve it. No random or wall-clock input. */
export class FluxCinematicDirector {
  private last=-1;private fast=0;private slow=0;private previousSnare=0;
  private buildUntil=-1;private buildStart=-1;private armed=false;
  private lastDrop=-99;private lastBreakdown=-99;private lastCut=-99;private shotStart=0;private length=6;
  private index=0;private kind:CinemaKind='establishing';private side=1;
  private event:NonNullable<FluxShot['event']>='hold';
  update(a:FluxDriven,t:number):FluxShot{
    const reset=this.last<0||t<this.last||t-this.last>2;
    if(reset){this.fast=this.slow=Math.min(1,a.intensity);this.previousSnare=0;this.buildUntil=-1;this.buildStart=-1;this.armed=false;this.lastDrop=this.lastBreakdown=-99;this.lastCut=t;this.shotStart=t;this.index=0;this.kind='establishing';this.event='hold';this.side=1;this.length=6;}
    const dt=reset?1/60:Math.max(0,Math.min(.2,t-this.last));this.last=t;
    const energy=Math.min(1,Math.max(0,a.intensity*.7+Math.min(1,a.energy)*.3));
    this.fast+=(energy-this.fast)*(1-Math.exp(-dt/.18));
    this.slow+=(energy-this.slow)*(1-Math.exp(-dt/2.8));
    const rising=this.fast-this.slow>.065&&this.fast>.28;
    if(rising){this.buildUntil=t+1.1;if(this.buildStart<0)this.buildStart=t;this.armed=true;}
    const build=t<this.buildUntil&&this.fast>.3;
    const snare=Math.max(0,a.snare),snareHit=snare>.3&&(this.previousSnare<=.3||snare-this.previousSnare>.18);
    this.previousSnare=snare;
    const drop=this.armed&&this.buildStart>=0&&t-this.buildStart>.65&&this.fast>.60&&(a.kickOnset??a.kick)>.6&&t-this.lastDrop>3;
    const breakdown=this.slow-this.fast>.18&&this.slow>.35&&t-this.lastDrop>.35&&t-this.lastBreakdown>3;
    let event:FluxShot['event'];
    if(drop)event='drop';else if(breakdown)event='breakdown';else if(build&&snareHit&&t-this.lastCut>.12)event='build';
    else if(t-this.shotStart>=this.length)event='phrase';
    if(event){
      this.index++;this.lastCut=this.shotStart=t;this.event=event;this.side=this.index%2===0?1:-1;
      if(event==='drop'){this.kind=this.index%2?'flythrough':'establishing';this.length=2.4;this.lastDrop=t;this.armed=false;this.buildStart=-1;this.buildUntil=-1;}
      else if(event==='breakdown'){this.kind='landscape';this.length=7;this.lastBreakdown=t;this.armed=false;this.buildStart=-1;this.buildUntil=-1;}
      else if(event==='build'){
        const montage: CinemaKind[]=['macro','dutch','truck','rack','orbit','crane'];
        this.kind=montage[(this.index-1)%montage.length];this.length=.8;
      }else{this.kind=CINEMA_SHOTS[this.index%CINEMA_SHOTS.length];this.length=this.fast>.65?2.5:this.fast>.35?4:7;}
    }
    if(!build&&t>this.buildUntil+2&&!drop){this.buildStart=-1;this.armed=false;}
    const u=Math.min(1,Math.max(0,(t-this.shotStart)/this.length)),ease=u*u*(3-2*u),side=this.side;
    const s:FluxShot={yaw:0,pitch:0,radiusMul:1,fovMul:1,roll:0,tx:0,ty:0,focusMul:1,focusStrength:.12,kind:this.kind,cutIndex:this.index,event:this.event};
    switch(this.kind){
      case 'establishing':s.radiusMul=1.55-.15*ease;s.yaw=side*(15+12*u);s.pitch=18;s.fovMul=1.2;break;
      case 'landscape':s.radiusMul=1.9;s.yaw=side*(40+18*u);s.pitch=-6;s.fovMul=1.3;s.tx=side*(u-.5)*.22;s.ty=-.025;break;
      case 'macro':s.radiusMul=.36;s.yaw=side*(32+18*u);s.pitch=24;s.fovMul=.72;s.focusStrength=.45;break;
      case 'rack':s.radiusMul=.72;s.yaw=side*28;s.tx=(u-.5)*.10;s.focusMul=.48+.52*ease;s.focusStrength=.8;break;
      case 'dutch':s.radiusMul=.8;s.yaw=side*(24+18*u);s.roll=side*(.28+.2*ease);s.ty=.025*Math.sin(u*Math.PI);break;
      case 'orbit':s.radiusMul=.95;s.yaw=side*(25+110*ease);s.pitch=12+18*Math.sin(u*Math.PI);break;
      case 'truck':s.radiusMul=1.05;s.yaw=side*32;s.tx=side*(u-.5)*.34;s.ty=.04*Math.sin(u*Math.PI);break;
      case 'crane':s.radiusMul=1.2-.2*ease;s.yaw=side*20;s.pitch=5+55*ease;s.ty=(u-.5)*.12;break;
      case 'flythrough':s.radiusMul=1.0-.58*ease;s.yaw=side*(-25+50*ease);s.pitch=15+15*Math.sin(u*Math.PI);s.tx=side*(u-.5)*.18;s.fovMul=1.1;s.focusStrength=.25;break;
    }
    s.fovMul*=1-(a.kickOnset??a.kick)*.035;
    return s;
  }
}
