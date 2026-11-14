import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Maximize,Pause,Play,RotateCcw,Trophy,Video,Volume2,VolumeX} from 'lucide-react';
import {characterById,portrait,GAMES} from './catalog';
import {createTennisState,stepTennis,emptyTennisInput,pointLabels,pressureCall,serverIndex,tennisSpecialFor,tennisStandings,venueById,FORMATS,TENNIS_INTRO,type TennisInput,type TennisState,type TennisFormat,type Difficulty} from './tennis';
import {createTennis3D,type TennisCam} from './tennis3d';
import {createState,type State} from './engine';
import type {CourseId} from './course3d';
import {gameAudio} from './audio';
import './kith-party.css';
import './plajah-layout.css';
import './tennis.css';

const KEYS=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','ShiftRight','ShiftLeft','KeyW','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyR','KeyC'];
const MAPS=[
 {left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',top:'Space',slice:'Enter',special:'ShiftRight',lob:'ShiftLeft'},
 {left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',top:'KeyF',slice:'KeyG',special:'KeyH',lob:'KeyR'},
];
type Touch={x:number;y:number;top:boolean;slice:boolean;lob:boolean;special:boolean};
const emptyTouch=():Touch=>({x:0,y:0,top:false,slice:false,lob:false,special:false});
const Art=({id,className=''}:{id:string;className?:string})=><img className={className} src={portrait(characterById(id))} alt={characterById(id).name} draggable={false}/>;

interface Hud { s:TennisState; }
function snap(s:TennisState):Hud { return {s:{...s,players:s.players.map(p=>({...p,stats2:{...p.stats2}})),ball:{...s.ball},match:{...s.match,games:[...s.match.games] as [number,number],points:[...s.match.points] as [number,number]},events:[]}}; }

/** Engine-shaped result so the Party Cup + best scores treat tennis like every other round. */
function toPartyState(t:TennisState,characters:string[]):State {
 const st=createState('tennis',characters,421);
 st.players.forEach((p,i)=>{const tp=t.players[i];if(tp){p.character=tp.character;p.score=tp.score;}else p.score=0;});
 st.phase='finished';st.time=st.duration;
 return st;
}

export function TennisSession({characters,venue,doubles,format,difficulty,cup,round,totals,onComplete,onExit,onAgain,onNext}:{characters:string[];venue:CourseId;doubles:boolean;format:TennisFormat;difficulty:Difficulty;cup:boolean;round:number;totals:number[];onComplete:(s:State)=>void;onExit:()=>void;onAgain:()=>void;onNext:()=>void}) {
 const canvas=useRef<HTMLCanvasElement>(null);
 const container=useRef<HTMLElement>(null);
 const keys=useRef(new Set<string>());
 const touch=useRef<Touch[]>([emptyTouch(),emptyTouch()]);
 const state=useRef<TennisState>(createTennisState(characters,{venue,doubles,format:cup?'quick':format,difficulty,seed:(Date.now()&0xffff)+11}));
 const view=useRef<ReturnType<typeof createTennis3D>|null>(null);
 const [hud,setHud]=useState<Hud>(()=>snap(state.current));
 const [ready,setReady]=useState(false);
 const [paused,setPausedState]=useState(false);
 const pauseRef=useRef(false);
 const [cam,setCam]=useState<TennisCam>('broadcast');
 const [sound,setSound]=useState(()=>!gameAudio.isMuted);
 const [renderError,setRenderError]=useState('');
 const [done,setDone]=useState(false);
 const completeRef=useRef(onComplete);completeRef.current=onComplete;
 const ven=venueById(venue);
 const setPause=(p:boolean)=>{pauseRef.current=p;setPausedState(p);keys.current.clear();touch.current=[emptyTouch(),emptyTouch()];gameAudio.pauseBlip();};
 const toggleCam=()=>setCam(c=>{const n=c==='broadcast'?'player':'broadcast';view.current?.setCameraMode(n);return n;});

 useEffect(()=>{
  const down=(e:KeyboardEvent)=>{
   if(e.code==='Escape'){if(ready&&state.current.phase!=='finished')setPause(!pauseRef.current);return;}
   if(e.code==='KeyC'&&!e.repeat){toggleCam();return;}
   if(KEYS.includes(e.code)){e.preventDefault();keys.current.add(e.code);}
  };
  const up=(e:KeyboardEvent)=>keys.current.delete(e.code);
  const blur=()=>{keys.current.clear();if(ready&&state.current.phase!=='finished'&&!pauseRef.current)setPause(true);};
  const vis=()=>{if(document.hidden)blur();};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',vis);
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',vis);};
 },[ready]);

 useEffect(()=>{
  if(!ready||!canvas.current)return;
  let v:ReturnType<typeof createTennis3D>|null=null;
  try{v=createTennis3D(canvas.current,state.current);view.current=v;v.setCameraMode(cam);}catch(err){setRenderError(err instanceof Error?err.message:'WebGL is unavailable on this device.');return;}
  const lost=(e:Event)=>{e.preventDefault();setPause(true);setRenderError('The 3D graphics connection was interrupted. Restart the match to reconnect.');};
  canvas.current.addEventListener('webglcontextlost',lost);
  const field=canvas.current;
  let raf=0,last=performance.now(),acc=0,lastHud=0,lastEvt=0,finished=false,startHeld=false;
  const loop=(now:number)=>{
   raf=requestAnimationFrame(loop);
   const elapsed=Math.min(.1,(now-last)/1000);last=now;
   const s=state.current;
   const pads=typeof navigator!=='undefined'&&navigator.getGamepads?[...navigator.getGamepads()].filter((p):p is Gamepad=>!!p):[];
   const start=pads.some(p=>p.buttons[9]?.pressed);if(start&&!startHeld&&s.phase!=='finished')setPause(!pauseRef.current);startHeld=start;
   const inputs:TennisInput[]=characters.map((_,i)=>{
    const k=keys.current,m=MAPS[i],t=touch.current[i],pad=pads[i];
    const ax=pad&&Math.abs(pad.axes[0])>.2?pad.axes[0]:0,ay=pad&&Math.abs(pad.axes[1])>.2?pad.axes[1]:0;
    const dl=!!pad?.buttons[14]?.pressed,dr=!!pad?.buttons[15]?.pressed,du=!!pad?.buttons[12]?.pressed,dd=!!pad?.buttons[13]?.pressed;
    const x=k.has(m.right)||dr?1:k.has(m.left)||dl?-1:ax||t.x;
    const y=k.has(m.down)||dd?1:k.has(m.up)||du?-1:ay||t.y;
    return {x,y,topspin:k.has(m.top)||t.top||!!pad?.buttons[0]?.pressed,slice:k.has(m.slice)||t.slice||!!pad?.buttons[1]?.pressed,lob:k.has(m.lob)||t.lob||!!pad?.buttons[2]?.pressed,special:k.has(m.special)||t.special||!!pad?.buttons[3]?.pressed||!!pad?.buttons[5]?.pressed};
   });
   // skip the venue flyover
   if(s.time<-.6&&inputs.some(n=>n.topspin||n.slice))s.time=-.6;
   if(!pauseRef.current){acc+=elapsed;while(acc>=1/120){stepTennis(s,inputs,1/120);acc-=1/120;}}
   // event audio
   for(const e of s.events){
    if(e.id<=lastEvt)continue;
    const human=e.player>=0&&s.players[e.player]?.human;
    if(e.type==='hit'){const kind=e.data.split('|')[0];gameAudio.tennisHit(kind==='smash'||kind==='special'||kind==='serve');}
    else if(e.type==='bounce')gameAudio.tennisBounce(ven.surface==='clay'||ven.surface==='grass');
    else if(e.type==='net')gameAudio.tennisNet();
    else if(e.type==='netcord'){gameAudio.tennisNet();gameAudio.crowdOoh();}
    else if(e.type==='point'){const how=e.data.split('|')[1];gameAudio.tennisPoint();gameAudio.crowdCheer(how==='ACE'||how==='WINNER'?1:.55);}
    else if(e.type==='perfect'&&e.data==='sweetspot'){gameAudio.rhythmHit(true);}
    else if(e.type==='fault'){gameAudio.rhythmMiss();if(e.data!=='NET')gameAudio.crowdOoh();}
    else if(e.type==='game')gameAudio.lapChime(false);
    else if(e.type==='match')gameAudio.lapChime(true);
    else if(e.type==='special'){gameAudio.boostWhoosh();gameAudio.crowdCheer(.8);}
    else if(e.type==='perfect'&&human)gameAudio.rhythmHit(true);
    else if(e.type==='dive')gameAudio.collisionThud();
    else if(e.type==='freeze'||e.type==='knock'||e.type==='shock')gameAudio.collisionThud();
    else if(e.type==='warp')gameAudio.crystalCollect();
    else if(e.type==='toss'&&human)gameAudio.uiClick();
   }
   if(s.events.length)lastEvt=s.events[s.events.length-1].id;
   v?.render(s,pauseRef.current?0:elapsed);
   if(now-lastHud>80){setHud(snap(s));lastHud=now;}
   if(s.phase==='finished'&&!finished&&s.phaseT>2.2){finished=true;setDone(true);setHud(snap(s));gameAudio.stopMusic();gameAudio.finishFanfare();completeRef.current(toPartyState(s,characters));}
  };
  raf=requestAnimationFrame(loop);
  return()=>{cancelAnimationFrame(raf);field.removeEventListener('webglcontextlost',lost);v?.dispose();view.current=null;gameAudio.stopMusic();};
 },[ready]);

 const begin=()=>{gameAudio.unlock();gameAudio.uiClick();gameAudio.playTrack('groove');setReady(true);setPause(false);setTimeout(()=>canvas.current?.focus(),50);};
 const toggleSound=()=>{gameAudio.unlock();const on=!sound;setSound(on);gameAudio.setMuted(!on);};
 const s=hud.s,m=s.match;
 const pl=pointLabels(s),call=pressureCall(s),si=serverIndex(s);
 const humans=s.players.map((p,i)=>({p,i})).filter(o=>o.p.human);
 const teamNames=(team:0|1)=>s.players.filter(p=>p.team===team).map(p=>characterById(p.character).name).join(' & ');
 const teamArt=(team:0|1)=>s.players.filter(p=>p.team===team);
 const server=s.players[si];
 const humanServing=s.phase==='serve'&&server?.human;
 const ranked=tennisStandings(s);
 const winnerTeam=m.winner;
 const setTouch=(i:number,key:keyof Touch,v:boolean|number)=>{(touch.current[i] as any)[key]=v;};
 const stat=(k:keyof TennisState['players'][number]['stats2'])=>s.players.map(p=>p.stats2[k]);
 void stat;
 return <main className="kp-session kt-session" ref={container}>
  <div className="kp-session-title">
   <button className="kp-text-link" onClick={onExit}><ArrowLeft size={17}/> Playground</button>
   <div><span className="kp-eyebrow">{cup?`PARTY CUP / ROUND ${round+1} OF ${GAMES.length}`:`KITH TENNIS · ${ven.badge}`}</span><h2>Kith Tennis: {ven.name}</h2></div>
   <div className="kp-session-tools">
    <button className="kp-auto-drive" onClick={toggleCam} title="Press C to switch camera"><Video size={14}/> Cam: {cam==='broadcast'?'Broadcast':'Behind player'}</button>
    <button className="kp-icon" onClick={toggleSound} aria-label={sound?'Mute sound':'Enable sound'}>{sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
    <button className="kp-icon" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void container.current?.requestFullscreen?.().catch(()=>{});}} aria-label="Fullscreen"><Maximize size={19}/></button>
    <button className="kp-icon" onClick={()=>setPause(!paused)} aria-label={paused?'Resume game':'Pause game'}>{paused?<Play size={19}/>:<Pause size={19}/>}</button>
   </div>
  </div>
  <div className="kp-canvas-wrap kp-3d-field kt-field">
   <canvas ref={canvas} width={960} height={560} tabIndex={0} aria-label={`Kith Tennis at ${ven.name}. Arrows move, Space topspin, Enter slice, Right Shift special.`}/>
   {ready&&!renderError&&<div className="kt-overlay">
    {s.time<0?<div className="kp-cinema"><i/><i/><div className="kp-cinema-title"><small>{ven.badge} · {doubles?'DOUBLES':'SINGLES'} · {FORMATS[cup?'quick':format].label.toUpperCase()}</small><b>{ven.name}</b><span>{ven.subtitle}</span></div><em>Space / Enter / tap to skip</em></div>:<>
     <div className="kt-board" role="status" aria-label="Scoreboard">
      {([0,1] as const).map(team=><div key={team} className={`kt-row ${winnerTeam===team?'won':''}`}>
       <span className="kt-serve">{server?.team===team&&winnerTeam===null?'●':''}</span>
       <span className="kt-faces">{teamArt(team).map(p=><Art key={p.character} id={p.character}/>)}</span>
       <b>{teamNames(team)}</b>
       <span className="kt-games">{m.games[team]}</span>
       <span className="kt-points">{pl[team]}</span>
      </div>)}
      <div className="kt-board-foot">{m.tiebreak?'TIE-BREAK':FORMATS[m.format].label.toUpperCase()}{call?<em>{call}</em>:null}{m.serveNumber===2&&s.phase!=='point'?<em>2ND SERVE</em>:null}</div>
     </div>
     <div className="kt-rally"><b>{m.rally}</b><small>RALLY</small>{s.ball.speedKmh>0&&<><b>{s.ball.speedKmh}</b><small>KM/H</small></>}</div>
     {m.callT>0&&m.call&&<div className="kt-call" key={m.call+m.totalPoints}>{m.call}</div>}
     {humanServing&&s.serveState==='ready'&&<div className="kt-hint">Press <kbd>{humans[0]?.i===si?'Space':'F'}</kbd> to toss · ←/→ to shuffle</div>}
     {humanServing&&s.serveState==='toss'&&<div className="kt-serve-meter"><span className="kt-sweet"/><i style={{bottom:`${Math.max(0,Math.min(100,(s.ball.y-1)/1.6*100))}%`}}/><small>HIT AT THE TOP · aim ←/→</small></div>}
     {humans.map(({p,i},n)=>{const sp=tennisSpecialFor(p.character);return <div key={i} className={`kt-player player-${n} ${p.meter>=1?'ready':''} ${p.armed?'armed':''}`} style={{'--sp':sp.color} as React.CSSProperties}>
      <Art id={p.character}/>
      <div className="kt-player-body">
       <div className="kt-player-name"><small>P{n+1}</small> {characterById(p.character).name}</div>
       <div className="kt-special"><span>{sp.icon}</span><div><b>{sp.name}</b><i style={{width:`${Math.round(p.meter*100)}%`}}/></div><kbd>{n===0?'R-SHIFT':'H'}</kbd></div>
       {p.pending&&p.pending!=='dive'&&<div className="kt-charge"><b>{p.pending.toUpperCase()}</b><i style={{width:`${Math.round(p.charge*100)}%`}}/></div>}
      </div>
      {p.feedbackT>0&&p.feedback&&<strong className="kt-feedback">{p.feedback}</strong>}
     </div>;})}
    </>}
   </div>}
   {renderError&&<div className="kp-game-overlay"><div className="kp-ready" role="alert"><h2>3D graphics paused</h2><p>{renderError}</p><button className="kp-button kp-primary" onClick={onAgain}>Restart match</button><button className="kp-text-link" onClick={onExit}>Back to gallery</button></div></div>}
   {!ready&&<div className="kp-game-overlay"><div className="kp-ready kt-ready">
    <span className="kp-eyebrow">{ven.badge} · {doubles?'DOUBLES':'SINGLES'} · {FORMATS[cup?'quick':format].detail}</span>
    <h2>Kith Tennis: {ven.name}</h2>
    <p>Press a shot button early and hold it: your Kith plants and charges, then swings when the ball arrives. Steer while you swing to aim; push toward the net for depth, back for short angles. The ring on the court shows where the ball will land.</p>
    <div className="kp-controls-card" aria-label="Tennis controls">
     <div><span>Shot</span><span>Player 1</span><span>Player 2</span><span>Controller</span></div>
     <div><b>Move · aim</b><kbd>← ↑ → ↓</kbd><kbd>W A S D</kbd><kbd>Stick · D-pad</kbd></div>
     <div><b>Topspin (hold = charge)</b><kbd>Space</kbd><kbd>F</kbd><kbd>A</kbd></div>
     <div><b>Slice</b><kbd>Enter</kbd><kbd>G</kbd><kbd>B</kbd></div>
     <div><b>Lob (or Topspin → Slice)</b><kbd>L-Shift</kbd><kbd>R</kbd><kbd>X</kbd></div>
     <div><b>Drop shot</b><kbd>Enter → Space</kbd><kbd>G → F</kbd><kbd>B → A</kbd></div>
     <div className="kp-controls-power"><b>✦ Kith Special (meter full)</b><kbd>Right Shift</kbd><kbd>H</kbd><kbd>Y / RB</kbd></div>
     <div><b>Serve: toss, then hit at the top</b><kbd>Space ×2</kbd><kbd>F ×2</kbd><kbd>A ×2</kbd></div>
     <div><b>Camera</b><kbd>C</kbd><kbd>C</kbd><kbd>—</kbd></div>
    </div>
    <p className="kt-tips">High balls near you turn into smashes. Volleys happen on their own at the net. Out of reach? Press a shot anyway and your Kith dives.</p>
    <button className="kp-button kp-primary" onClick={begin}>Walk on court <Play size={18}/></button>
   </div></div>}
   {ready&&paused&&!done&&!renderError&&<div className="kp-game-overlay"><div className="kp-ready"><span className="kp-eyebrow">CHANGEOVER</span><h2>Match paused.</h2><button className="kp-button kp-primary" onClick={()=>{setPause(false);canvas.current?.focus();}}>Back on court <Play size={18}/></button><button className="kp-text-link" onClick={onExit}>Leave match</button></div></div>}
   {done&&<div className="kp-game-overlay"><div className="kp-ready kp-results kt-results" role="status">
    <Trophy size={30}/>
    <span className="kp-eyebrow">{cup&&round===GAMES.length-1?'THE PARTY CUP IS COMPLETE':'GAME · SET · MATCH'}</span>
    <h2>{winnerTeam!==null?`${teamNames(winnerTeam)} ${s.players.filter(p=>p.team===winnerTeam).length>1?'win':'wins'}!`:'Match over'}</h2>
    <p className="kt-final">{m.games[0]}–{m.games[1]} · {m.totalPoints} points · longest rally {m.longestRally}</p>
    <table className="kt-stats"><thead><tr><th/>{s.players.map(p=><th key={p.character}><Art id={p.character}/></th>)}</tr></thead><tbody>
     {([['Points won','points'],['Winners','winners'],['Aces','aces'],['Perfect shots','perfects'],['Specials','specials'],['Dives','dives'],['Faults','faults']] as const).map(([label,k])=><tr key={k}><td>{label}</td>{s.players.map(p=><td key={p.character}>{p.stats2[k]}</td>)}</tr>)}
     <tr className="kt-score"><td>Party score</td>{s.players.map(p=><td key={p.character}>{p.score}</td>)}</tr>
    </tbody></table>
    <div className="kp-result-list">{ranked.slice(0,2).map((p,i)=><div key={p.character}><span>{i+1}</span><Art id={p.character}/><b>{characterById(p.character).name}</b><span>{p.score} pts</span></div>)}</div>
    {cup&&<p>Cup points: {characters.map((id,i)=>`${characterById(id).name} ${totals[i]}`).join(' · ')}</p>}
    <div className="kp-actions">{cup&&round<GAMES.length-1?<button className="kp-button kp-primary" onClick={onNext}>Next round <ArrowUpRight size={18}/></button>:<button className="kp-button kp-primary" onClick={onExit}>Back to the playground <ArrowUpRight size={18}/></button>}{!cup&&<button className="kp-button" onClick={onAgain}><RotateCcw size={16}/> Rematch</button>}</div>
   </div></div>}
  </div>
  <div className="kp-session-bottom"><span>P1: Arrows · Space topspin · Enter slice · L-Shift lob · R-Shift special | P2: WASD · F · G · R · H | C: camera</span><span>Esc to pause · hold a shot early to charge it</span></div>
  <div className="kp-touch-controls kt-touch">{characters.map((id,i)=><div key={id}><span>P{i+1} · {characterById(id).name}</span><div>
   {([['←','x',-1],['↓','y',1],['↑','y',-1],['→','x',1]] as const).map(([label,axis,val])=><button key={label} aria-label={`Player ${i+1} move ${label}`} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setTouch(i,axis,val);}} onPointerUp={()=>setTouch(i,axis,0)} onLostPointerCapture={()=>setTouch(i,axis,0)}>{label}</button>)}
   {([['●','top','TOP'],['◐','slice','SLICE'],['⌒','lob','LOB'],['✦','special','SPECIAL']] as const).map(([label,key,small])=><button key={key} className="kp-touch-power" aria-label={`Player ${i+1} ${small.toLowerCase()}`} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setTouch(i,key,true);}} onPointerUp={()=>setTouch(i,key,false)} onLostPointerCapture={()=>setTouch(i,key,false)}>{label}<small>{small}</small></button>)}
  </div></div>)}</div>
 </main>;
}
export {TENNIS_INTRO};
