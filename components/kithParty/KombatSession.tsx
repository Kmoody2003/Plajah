import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,Maximize,Pause,Play,RotateCcw,Trophy,Volume2,VolumeX} from 'lucide-react';
import {characterById,portrait} from './catalog';
import {ITEMS,kithKart,type ItemId} from './abilities';
import {createKombatState,stepKombat,kombatStandings,emptyKombatInput,ARENA_RADIUS,MATCH_SECONDS,MAX_HP,START_LIVES,STORM_PHASES,type KombatInput,type KombatState,type KombatKart} from './kombat';
import {createKombat3D} from './kombat3d';
import {gameAudio} from './audio';
import './kith-party.css';
import './plajah-layout.css';
import './kombat.css';

const ITEM_IDS=Object.keys(ITEMS) as ItemId[];
const KEYS=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','ShiftRight','KeyW','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH'];
const MAPS=[
 {left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',drift:'Space',item:'Enter',special:'ShiftRight'},
 {left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',drift:'KeyF',item:'KeyG',special:'KeyH'},
];
type TouchState={x:number;y:number;action:boolean;item:boolean;special:boolean};

interface HudSnapshot { time:number; phase:KombatState['phase']; karts:KombatKart[]; storm:KombatState['storm']; feed:{t:number;text:string;key:string}[]; alive:number; winner:number|null; }

function snapshot(s:KombatState,feed:HudSnapshot['feed']):HudSnapshot {
 return {time:s.time,phase:s.phase,karts:s.karts.map(k=>({...k,ai:{...k.ai}})),storm:{...s.storm},feed:[...feed],alive:s.karts.filter(k=>!k.eliminated).length,winner:s.winner};
}

const Art=({id,className=''}:{id:string;className?:string})=><img className={className} src={portrait(characterById(id))} alt={characterById(id).name} draggable={false}/>;
const fmt=(t:number)=>{const s=Math.max(0,Math.ceil(t));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};

export function KombatSession({characters,onExit,onAgain}:{characters:string[];onExit:()=>void;onAgain:()=>void}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const container=useRef<HTMLElement>(null);
 const keys=useRef(new Set<string>());
 const touch=useRef<TouchState[]>([{x:0,y:0,action:false,item:false,special:false},{x:0,y:0,action:false,item:false,special:false}]);
 const state=useRef<KombatState>(createKombatState(characters,(Date.now()&0xffff)+7));
 const feedRef=useRef<HudSnapshot['feed']>([]);
 const [hud,setHud]=useState<HudSnapshot>(()=>snapshot(state.current,[]));
 const [ready,setReady]=useState(false);
 const [paused,setPausedState]=useState(false);
 const pauseRef=useRef(false);
 const [autoGas,setAutoGas]=useState(true);
 const autoRef=useRef(true);
 const [sound,setSound]=useState(()=>!gameAudio.isMuted);
 const [renderError,setRenderError]=useState('');
 const setPause=(p:boolean)=>{pauseRef.current=p;setPausedState(p);gameAudio.pauseBlip();};

 useEffect(()=>{autoRef.current=autoGas;},[autoGas]);

 useEffect(()=>{
  const down=(e:KeyboardEvent)=>{
   if(e.code==='Escape'){if(ready&&state.current.phase!=='finished')setPause(!pauseRef.current);return;}
   if(KEYS.includes(e.code)){e.preventDefault();keys.current.add(e.code);}
  };
  const up=(e:KeyboardEvent)=>keys.current.delete(e.code);
  const blur=()=>{keys.current.clear();if(ready&&state.current.phase==='playing')setPause(true);};
  const vis=()=>{if(document.hidden)blur();};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',vis);
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',vis);};
 },[ready]);

 useEffect(()=>{
  if(!ready||!canvas.current) return;
  let view:ReturnType<typeof createKombat3D>|null=null;
  try{view=createKombat3D(canvas.current,state.current);}catch(err){setRenderError(err instanceof Error?err.message:'WebGL is unavailable on this device.');return;}
  gameAudio.playTrack('race');
  let raf=0,last=performance.now(),acc=0,lastHud=0,lastCount=Math.ceil(-state.current.time),lastEvt=-99,finished=false;
  const loop=(now:number)=>{
   raf=requestAnimationFrame(loop);
   const elapsed=Math.min(.1,(now-last)/1000);last=now;
   const s=state.current;
   const pads=typeof navigator!=='undefined'&&navigator.getGamepads?[...navigator.getGamepads()].filter(Boolean):[];
   const inputs:KombatInput[]=characters.map((_,i)=>{
    const k=keys.current,m=MAPS[i],t=touch.current[i],pad=pads[i];
    const ax=pad&&Math.abs(pad.axes[0])>.18?pad.axes[0]:0;
    const x=k.has(m.right)?1:k.has(m.left)?-1:ax||t.x;
    const gas=k.has(m.up)||t.y<0||!!pad?.buttons[7]?.pressed||(pad?.buttons[7]?.value??0)>.2;
    const brake=k.has(m.down)||t.y>0||!!pad?.buttons[6]?.pressed||(pad&&pad.axes[1]>.6);
    return {x,y:brake?1:(gas||autoRef.current)?-1:0,action:k.has(m.drift)||t.action||!!pad?.buttons[0]?.pressed,item:k.has(m.item)||t.item||!!pad?.buttons[2]?.pressed,special:k.has(m.special)||t.special||!!pad?.buttons[3]?.pressed};
   });
   if(pads.some(p=>p?.buttons[9]?.pressed)&&!pauseRef.current&&s.phase==='playing'){setPause(true);}
   if(!pauseRef.current){
    acc+=elapsed;
    while(acc>=1/120){stepKombat(s,inputs,1/120);acc-=1/120;}
   }
   // countdown beeps
   if(s.time<0){const c=Math.ceil(-s.time);if(c!==lastCount){lastCount=c;gameAudio.countdownBeep();}}
   else if(lastCount>0){lastCount=0;gameAudio.goBeep();}
   // event audio + kill feed
   for(const e of s.events){
    if(e.t<=lastEvt) continue;
    const human=e.kart>=0&&s.karts[e.kart]?.human;
    const byHuman=e.by>=0&&s.karts[e.by]?.human;
    if(e.type==='hit'&&(human||byHuman))gameAudio.collisionThud();
    if(e.type==='pickup'&&human)gameAudio.crystalCollect();
    if(e.type==='boost'&&human)gameAudio.boostWhoosh();
    if(e.type==='ko'){
     gameAudio.lapChime();
     const victim=characterById(s.karts[e.kart].character).name;
     const killer=e.by>=0?characterById(s.karts[e.by].character).name:'The storm';
     feedRef.current=[...feedRef.current.slice(-4),{t:s.time,text:`${killer} ✕ ${victim}${s.karts[e.kart].eliminated?' · OUT':''}`,key:`${e.t}-${e.kart}`}];
    }
    if(e.type==='storm'){feedRef.current=[...feedRef.current.slice(-4),{t:s.time,text:'⚠ The storm is closing in',key:`storm-${e.t}`}];}
    if(e.type==='special'&&(human||byHuman))gameAudio.boostWhoosh();
   }
   if(s.events.length) lastEvt=s.events[s.events.length-1].t;
   view?.render(s,pauseRef.current?0:elapsed,gameAudio.context,!gameAudio.isMuted);
   if(now-lastHud>90){feedRef.current=feedRef.current.filter(f=>s.time-f.t<6);setHud(snapshot(s,feedRef.current));lastHud=now;}
   if(s.phase==='finished'&&!finished){finished=true;gameAudio.finishFanfare();setHud(snapshot(s,feedRef.current));}
  };
  raf=requestAnimationFrame(loop);
  return()=>{cancelAnimationFrame(raf);view?.dispose();};
 },[ready]);

 const begin=()=>{gameAudio.unlock();gameAudio.uiClick();setReady(true);setTimeout(()=>canvas.current?.focus(),50);};
 const humans=hud.karts.filter(k=>k.human);
 const standings=kombatStandings({...state.current,karts:hud.karts} as KombatState);
 const st=hud.storm;
 const stormLabel=st.phase>=STORM_PHASES.length?'FINAL CIRCLE':st.shrinking?`CLOSING · ${fmt(st.timer)}`:`STORM IN ${fmt(st.timer)}`;
 const mm=(v:number)=>50+v/ARENA_RADIUS*46;
 const result=hud.phase==='finished';
 const winner=hud.winner!==null?hud.karts[hud.winner]:null;

 const touchBtn=(i:number,label:string,aria:string,on:(t:TouchState,v:boolean)=>void)=><button key={aria} aria-label={`Player ${i+1} ${aria}`}
  onPointerDown={e=>{e.preventDefault();on(touch.current[i],true);}} onPointerUp={()=>on(touch.current[i],false)} onPointerLeave={()=>on(touch.current[i],false)} onPointerCancel={()=>on(touch.current[i],false)}>{label}</button>;

 return <main className="kp-session kk-session" ref={container}>
  <div className="kp-session-title">
   <button className="kp-text-link" onClick={onExit}><ArrowLeft size={17}/> Playground</button>
   <div><span className="kp-eyebrow">BATTLE ROYALE · 8 KARTS · 3 LIVES</span><h2>Kart Kombat: Kith Arena</h2></div>
   <div className="kp-session-tools">
    <button className="kp-auto-drive" aria-pressed={autoGas} onClick={()=>setAutoGas(a=>!a)}>{autoGas?'Auto-gas on':'Auto-gas off'}</button>
    <button className="kp-icon" onClick={()=>{const m=gameAudio.toggleMute();setSound(!m);}} aria-label={sound?'Mute':'Unmute'}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
    <button className="kp-icon" onClick={()=>{if(document.fullscreenElement)document.exitFullscreen();else container.current?.requestFullscreen?.();}} aria-label="Fullscreen"><Maximize size={19}/></button>
    <button className="kp-icon" disabled={!ready||result} onClick={()=>setPause(!paused)} aria-label={paused?'Resume game':'Pause game'}>{paused?<Play size={19}/>:<Pause size={19}/>}</button>
   </div>
  </div>
  <div className="kp-scorebar">
   {humans.map((k,i)=><div key={i}><Art id={k.character}/><span><small>PLAYER {i+1}</small><b>{characterById(k.character).name}</b></span><strong>{k.eliminated?`OUT · #${k.placement}`:`${k.kos} KO · ${'♥'.repeat(Math.max(0,k.lives))}`}</strong></div>)}
   <span className="kp-timer">{fmt(MATCH_SECONDS-Math.max(0,hud.time))}<small>{hud.alive} KARTS LEFT</small></span>
  </div>
  <div className={`kp-canvas-wrap kp-3d-field kk-field ${characters.length===2?'kp-split':''}`}>
   <canvas ref={canvas} width={960} height={560} tabIndex={0} aria-label="Kart Kombat arena. Drive, collect item crates, and knock out the other karts while staying inside the storm circle."/>
   {ready&&!renderError&&!result&&<div className="kk-overlay">
    {hud.time<0&&<b className="kp-race-countdown kk-countdown">{Math.ceil(-hud.time)}</b>}
    <div className="kk-topbar">
     <span className={`kk-storm ${st.shrinking?'closing':''}`}>{stormLabel}</span>
     <span className="kk-alive"><b>{hud.alive}</b> LEFT</span>
    </div>
    <svg className="kk-minimap" viewBox="0 0 100 100" aria-hidden="true">
     <circle cx="50" cy="50" r="46" fill="rgba(20,12,36,.72)" stroke="rgba(255,255,255,.35)" strokeWidth="1"/>
     <circle cx="50" cy="50" r={PLATFORMR} fill="rgba(255,179,71,.35)"/>
     {state.current.arena.cover.map((c,i)=><rect key={i} x={mm(c.x-c.hw)} y={mm(c.z-c.hd)} width={c.hw*2/ARENA_RADIUS*46} height={c.hd*2/ARENA_RADIUS*46} fill="rgba(255,255,255,.4)"/>)}
     <circle cx={mm(st.cx)} cy={mm(st.cz)} r={Math.min(60,st.r/ARENA_RADIUS*46)} fill="none" stroke="#c77dff" strokeWidth="1.6"/>
     {st.toR<st.r-.5&&<circle cx={mm(st.toCx)} cy={mm(st.toCz)} r={st.toR/ARENA_RADIUS*46} fill="none" stroke="#fff" strokeWidth=".8" strokeDasharray="2 2"/>}
     {hud.karts.filter(k=>!k.eliminated&&k.respawn<=0).map(k=><circle key={k.index} cx={mm(k.x)} cy={mm(k.z)} r={k.human?3:2.2} fill={characterById(k.character).accent} stroke={k.human?'#fff':'#140c24'} strokeWidth={k.human?1:.6}/>)}
    </svg>
    <div className="kk-feed">{hud.feed.map(f=><div key={f.key}>{f.text}</div>)}</div>
    {humans.map((k,i)=>{
     const kk=kithKart(k.character);const sp=kk.special;
     const rolling=k.roulette>0;const shown:ItemId|null=rolling?ITEM_IDS[Math.floor(hud.time*14)%ITEM_IDS.length]:k.item;
     return <div key={i} className={`kk-hud player-${i} ${humans.length>1?'split':''} ${k.flash>0?'hurt':''} ${k.blind>0?'blind':''}`}>
      <div className={`kk-item ${rolling?'rolling':''}`} style={shown?{'--item-color':ITEMS[shown].color} as React.CSSProperties:undefined}>
       <span>{shown?ITEMS[shown].icon:''}</span>
       <small>{shown&&!rolling?ITEMS[shown].name+(k.item==='triple-nitro'&&k.itemUses>1?` ×${k.itemUses}`:''):rolling?'…':'NO ITEM'}</small>
      </div>
      <div className="kk-vitals">
       <div className="kk-name"><b>{characterById(k.character).name}</b><span>{'♥'.repeat(Math.max(0,k.lives))}<i>{'♥'.repeat(Math.max(0,START_LIVES-k.lives))}</i></span>{k.shield>0&&<em>◯ ×{k.shield}</em>}</div>
       <div className="kk-hp"><i style={{width:`${Math.max(0,k.hp)/MAX_HP*100}%`}} className={k.hp<30?'low':k.hp<60?'mid':''}/></div>
       <div className={`kk-special ${k.special>=1?'ready':''}`} style={{'--sp-color':sp.color} as React.CSSProperties}>
        <span>{sp.icon}</span><div><i style={{width:`${k.special*100}%`}}/></div><small>{k.special>=1?`${sp.name} READY`:sp.name}</small>
       </div>
       <div className="kk-stats"><span>{Math.round(Math.abs(k.speed)*3.6)} KM/H</span><span>{k.kos} KO</span>{k.driftStage>0&&<span className={`kk-drift d${k.driftStage}`}>{'★'.repeat(k.driftStage)} DRIFT</span>}</div>
      </div>
      {k.respawn>0&&!k.eliminated&&<div className="kk-banner">KNOCKED OUT · DROPPING IN {k.respawn.toFixed(1)}</div>}
      {k.eliminated&&<div className="kk-banner out">ELIMINATED · #{k.placement} · SPECTATING</div>}
      {k.blind>0&&<div className="kk-confetti" aria-hidden="true"/>}
     </div>;
    })}
   </div>}
   {renderError&&<div className="kp-game-overlay"><div className="kp-ready" role="alert"><h2>3D graphics paused</h2><p>{renderError}</p><button className="kp-button kp-primary" onClick={onAgain}>Try again</button><button className="kp-text-link" onClick={onExit}>Back to gallery</button></div></div>}
   {!ready&&<div className="kp-game-overlay"><div className="kp-ready kk-brief">
    <span className="kp-eyebrow">KART KOMBAT · BATTLE ROYALE</span>
    <h2>Last kart rolling wins.</h2>
    <p>Eight Kith drop into the arena with 3 lives each. Smash item crates, hit rivals with bolts, hornets and mines, and fire your Kith's signature special when the meter fills. Stay inside the storm — it shrinks, and it bites.</p>
    <dl className="kk-controls">
     <dt>Player 1</dt><dd>← → steer · ↑ gas · ↓ brake/reverse · Space hop-drift · Enter item · Right Shift special</dd>
     {characters.length>1&&<><dt>Player 2</dt><dd>A D steer · W gas · S brake · F drift · G item · H special</dd></>}
     <dt>Controller</dt><dd>Stick steer · RT gas · LT brake · A drift · X item · Y special</dd>
    </dl>
    <div className="kk-roster">{characters.map(id=>{const kk=kithKart(id);return <div key={id}><Art id={id}/><b>{characterById(id).name}</b><small>{kk.special.icon} {kk.special.name}</small><p>{kk.special.description}</p></div>;})}</div>
    <button className="kp-button kp-primary" onClick={begin}>Drop in <Play size={18}/></button>
   </div></div>}
   {paused&&ready&&!result&&<div className="kp-game-overlay"><div className="kp-ready"><h2>Paused</h2><div className="kp-actions"><button className="kp-button kp-primary" onClick={()=>setPause(false)}>Resume <Play size={16}/></button><button className="kp-button" onClick={onAgain}><RotateCcw size={16}/> Restart</button></div><button className="kp-text-link" onClick={onExit}>Back to the playground</button></div></div>}
   {result&&<div className="kp-game-overlay"><div className="kp-ready kp-results" role="status">
    <Trophy size={30}/>
    <span className="kp-eyebrow">{hud.time>=MATCH_SECONDS?'TIME! MOST KOS WINS':'LAST KART STANDING'}</span>
    <h2>{winner?`${characterById(winner.character).name} wins the arena!`:'Draw!'}</h2>
    <div className="kp-result-list">{standings.map((k,i)=><div key={k.index} className={k.human?'kk-me':''}><span>{i+1}</span><Art id={k.character}/><b>{characterById(k.character).name}{k.human?` · P${k.index+1}`:''}</b><span>{k.kos} KO · {k.eliminated?'out':`${k.lives}♥`}</span></div>)}</div>
    <div className="kp-actions"><button className="kp-button kp-primary" onClick={onAgain}><RotateCcw size={16}/> Rematch</button><button className="kp-button" onClick={onExit}>Back to the playground</button></div>
   </div></div>}
  </div>
  <div className="kp-session-bottom"><span>P1: Arrows · Space drift · Enter item · R-Shift special{characters.length>1?' — P2: WASD · F drift · G item · H special':''}</span><span>Esc to pause · stay inside the purple ring</span></div>
  <div className="kp-touch-controls kk-touch">{characters.map((id,i)=><div key={id}><span>P{i+1} · {characterById(id).name}</span><div>
   {touchBtn(i,'←','left',(t,v)=>{t.x=v?-1:(t.x===-1?0:t.x);})}
   {touchBtn(i,'↓','brake',(t,v)=>{t.y=v?1:(t.y===1?0:t.y);})}
   {touchBtn(i,'↑','gas',(t,v)=>{t.y=v?-1:(t.y===-1?0:t.y);})}
   {touchBtn(i,'→','right',(t,v)=>{t.x=v?1:(t.x===1?0:t.x);})}
   {touchBtn(i,'★','drift',(t,v)=>{t.action=v;})}
   {touchBtn(i,'◆','item',(t,v)=>{t.item=v;})}
   {touchBtn(i,'✦','special',(t,v)=>{t.special=v;})}
  </div></div>)}</div>
 </main>;
}

const PLATFORMR=22/ARENA_RADIUS*46;
