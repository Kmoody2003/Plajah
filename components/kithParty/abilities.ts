/**
 * Kith Racing — shared kart/ability contract.
 * Every Kith type gives its kart a stat shape plus one signature Type Special (charged meter),
 * and every racer can also carry one item from the track's item boxes.
 * Used by the racing engine (engine.ts), the Kart Kombat arena (kombat.ts) and both renderers.
 */

export type KithType = 'Flare'|'Resonance'|'Grove'|'Volt'|'Tide'|'Bloom'|'Terra'|'Astral'|'Alloy'|'Frost';

/** 1..5 scale. Converted to physics numbers by kartPhysics(). */
export interface KartStats { speed:number; accel:number; handling:number; weight:number; offroad:number; }

export type SpecialKind = 'attack'|'defend'|'boost'|'trap';

export type SpecialId =
 | 'inferno-afterburner' // Flare: huge flame boost, fire trail spins out karts behind
 | 'bass-drop'           // Resonance: shockwave ring, wobbles + slows karts nearby
 | 'bramble-snare'       // Grove: drops a wide thorn patch behind, passive offroad grip
 | 'chain-lightning'     // Volt: bolt jumps to the next two karts ahead, short stun
 | 'riptide-wave'        // Tide: rolling wave surges forward, shoves karts to the wall
 | 'confetti-storm'      // Bloom: burst blinds + slows every kart behind within range
 | 'boulder-bash'        // Terra: armoured boulder form, invulnerable ram, knocks karts away
 | 'moon-warp'           // Astral: blink forward along the track, brief invulnerability
 | 'gear-shield'         // Alloy: orbiting gears block hits and reflect projectiles
 | 'glacier-wake';       // Frost: ice beam freezes the kart ahead, leaves an ice slick

export interface SpecialDef {
 id:SpecialId; name:string; kind:SpecialKind; icon:string; color:string;
 /** seconds the effect lasts (0 = instant) */
 duration:number;
 description:string;
}

export interface KithKart {
 type:KithType;
 kartName:string;
 stats:KartStats;
 special:SpecialDef;
 /** colour of this kart's afterburner flame core / outer plume */
 flameCore:string; flameOuter:string;
}

export const SPECIALS:Record<SpecialId,SpecialDef>={
 'inferno-afterburner':{id:'inferno-afterburner',name:'Inferno Afterburner',kind:'boost',icon:'🔥',color:'#ff5a1a',duration:2.6,description:'Light both stacks for a monster boost. Your flame trail spins out anyone tailgating.'},
 'bass-drop':{id:'bass-drop',name:'Bass Drop',kind:'attack',icon:'♫',color:'#db388f',duration:.6,description:'A shockwave ring bursts out. Karts nearby wobble and lose speed.'},
 'bramble-snare':{id:'bramble-snare',name:'Bramble Snare',kind:'trap',icon:'❧',color:'#7ccf4a',duration:9,description:'Drop a wide thorn patch behind you. Grove karts also keep their grip off-road.'},
 'chain-lightning':{id:'chain-lightning',name:'Chain Lightning',kind:'attack',icon:'ϟ',color:'#ffe14a',duration:.4,description:'A bolt leaps to the next two karts ahead and stuns them.'},
 'riptide-wave':{id:'riptide-wave',name:'Riptide Wave',kind:'attack',icon:'≈',color:'#38c8ff',duration:2.2,description:'A wave surges forward down the track and shoves karts into the wall.'},
 'confetti-storm':{id:'confetti-storm',name:'Confetti Storm',kind:'attack',icon:'✿',color:'#ff8fd0',duration:3,description:'A confetti blast blinds and slows every kart behind you.'},
 'boulder-bash':{id:'boulder-bash',name:'Boulder Bash',kind:'defend',icon:'◆',color:'#c98a5a',duration:3.2,description:'Curl into an armoured boulder. Nothing hurts you, and you flatten whoever you hit.'},
 'moon-warp':{id:'moon-warp',name:'Moon Warp',kind:'boost',icon:'☾',color:'#a8a6ff',duration:.8,description:'Blink forward through space and arrive untouchable.'},
 'gear-shield':{id:'gear-shield',name:'Gear Shield',kind:'defend',icon:'⚙',color:'#ffb347',duration:8,description:'Copper gears orbit your kart, block two hits and bounce projectiles back.'},
 'glacier-wake':{id:'glacier-wake',name:'Glacier Wake',kind:'attack',icon:'❄',color:'#9fe8ff',duration:.5,description:'An ice beam freezes the kart ahead and leaves a slick for anyone following.'},
};

export const KITH_KARTS:Record<string,KithKart>={
 rello:{type:'Flare',kartName:'Ember Fang',stats:{speed:4,accel:3,handling:3,weight:3,offroad:2},special:SPECIALS['inferno-afterburner'],flameCore:'#fff3c4',flameOuter:'#ff4a12'},
 chora:{type:'Resonance',kartName:'Petal Pulse',stats:{speed:3,accel:4,handling:4,weight:2,offroad:2},special:SPECIALS['bass-drop'],flameCore:'#ffd6f0',flameOuter:'#ff2e93'},
 moki:{type:'Grove',kartName:'Grove Runner',stats:{speed:3,accel:3,handling:3,weight:3,offroad:5},special:SPECIALS['bramble-snare'],flameCore:'#f4ffc8',flameOuter:'#6ee03a'},
 zippi:{type:'Volt',kartName:'Volt Dart',stats:{speed:4,accel:5,handling:3,weight:1,offroad:2},special:SPECIALS['chain-lightning'],flameCore:'#ffffff',flameOuter:'#ffd400'},
 nori:{type:'Tide',kartName:'Reef Skimmer',stats:{speed:3,accel:3,handling:5,weight:2,offroad:3},special:SPECIALS['riptide-wave'],flameCore:'#e4fbff',flameOuter:'#1fb8ff'},
 pippa:{type:'Bloom',kartName:'Bloom Bug',stats:{speed:3,accel:4,handling:4,weight:2,offroad:3},special:SPECIALS['confetti-storm'],flameCore:'#fff0fa',flameOuter:'#ff6ac1'},
 bram:{type:'Terra',kartName:'Cairn Crawler',stats:{speed:5,accel:2,handling:2,weight:5,offroad:4},special:SPECIALS['boulder-bash'],flameCore:'#fff0d8',flameOuter:'#ff8a2a'},
 luma:{type:'Astral',kartName:'Lunar Comet',stats:{speed:4,accel:3,handling:4,weight:2,offroad:2},special:SPECIALS['moon-warp'],flameCore:'#f2f0ff',flameOuter:'#8f7bff'},
 tavi:{type:'Alloy',kartName:'Copper Wasp',stats:{speed:4,accel:3,handling:3,weight:4,offroad:3},special:SPECIALS['gear-shield'],flameCore:'#fff6dc',flameOuter:'#ff9b2e'},
 fenn:{type:'Frost',kartName:'Frostwing',stats:{speed:3,accel:4,handling:4,weight:3,offroad:3},special:SPECIALS['glacier-wake'],flameCore:'#ffffff',flameOuter:'#7fdcff'},
};

export const kithKart=(characterId:string):KithKart=>KITH_KARTS[characterId]||KITH_KARTS.rello;

/** Physics numbers derived from the 1..5 stats. Speeds are metres/second. */
export function kartPhysics(stats:KartStats){
 return {
  topSpeed:36+stats.speed*1.6,          // 37.6 .. 44 m/s
  accel:13+stats.accel*2.6,             // m/s^2 at low speed
  turnRate:.9+stats.handling*.12,       // lane-steer multiplier
  weight:.6+stats.weight*.2,            // bump resistance / knockback dealt
  offroadMul:.42+stats.offroad*.1,      // fraction of top speed kept on grass/sand
  brake:44,                             // m/s^2
 };
}

export const BOOST_SPEED_BONUS=17; // m/s added on top of top speed while boosting

// ---- Items (track item boxes / Kombat loot) ----
export type ItemId = 'seed-bolt'|'homing-hornet'|'goo-mine'|'nitro'|'triple-nitro'|'bubble-shield'|'thunder-crown';

export interface ItemDef { id:ItemId; name:string; icon:string; color:string; kind:SpecialKind; description:string; }

export const ITEMS:Record<ItemId,ItemDef>={
 'seed-bolt':{id:'seed-bolt',name:'Seed Bolt',icon:'●',color:'#7ee05a',kind:'attack',description:'Fires straight ahead and ricochets off the walls.'},
 'homing-hornet':{id:'homing-hornet',name:'Homing Hornet',icon:'🐝',color:'#ffcc33',kind:'attack',description:'Locks on to the kart directly ahead.'},
 'goo-mine':{id:'goo-mine',name:'Goo Mine',icon:'◉',color:'#b45cff',kind:'trap',description:'Drop it behind you. Anyone who drives through spins out.'},
 'nitro':{id:'nitro',name:'Nitro',icon:'⚡',color:'#ff6a1a',kind:'boost',description:'One shot of afterburner.'},
 'triple-nitro':{id:'triple-nitro',name:'Triple Nitro',icon:'⚡⚡⚡',color:'#ff3d1a',kind:'boost',description:'Three shots of afterburner.'},
 'bubble-shield':{id:'bubble-shield',name:'Bubble Shield',icon:'◯',color:'#7ee8ff',kind:'defend',description:'Blocks the next hit.'},
 'thunder-crown':{id:'thunder-crown',name:'Thunder Crown',icon:'♛',color:'#fff04a',kind:'attack',description:'Lightning strikes every kart ahead of you.'},
};

/** Position-weighted roll: leaders get defence, the back of the pack gets the big stuff. place is 0-based, n = racers. */
export function rollItem(place:number,n:number,r:number):ItemId {
 const back=n<=1?0:place/(n-1); // 0 = leader, 1 = last
 const table:[ItemId,number][]=[
  ['seed-bolt',1.4-back*.4],
  ['goo-mine',1.3-back*.9],
  ['bubble-shield',1.2-back*.7],
  ['homing-hornet',.2+back*1.3],
  ['nitro',.6+back*.6],
  ['triple-nitro',back*1.1],
  ['thunder-crown',back>.7?(back-.7)*1.6:0],
 ];
 const total=table.reduce((a,[,w])=>a+Math.max(0,w),0);
 let x=r*total;
 for(const [id,w] of table){x-=Math.max(0,w);if(x<=0)return id;}
 return 'seed-bolt';
}

/** Special meter: seconds of normal driving to fill from empty, plus bonuses (see engine). */
export const SPECIAL_FILL_SECONDS=22;
