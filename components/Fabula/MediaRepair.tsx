import React,{useEffect,useState} from 'react';
import {resolveMediaSource} from '../../services/fabula/mediaSource';
import {getBytes} from '../../services/fabula/mediaStore';
import {mediaHealth,reportMediaHealth,subscribeMediaHealth} from '../../services/fabula/mediaHealth';

export default function MediaRepair({assets,selected,onSelect,onRelink,onReconnect,onBuildProxies}:any) {
 const [,refresh]=useState(0),[busy,setBusy]=useState(false),[proxies,setProxies]=useState<Record<string,boolean>>({});
 useEffect(()=>subscribeMediaHealth(()=>refresh(n=>n+1)),[]);
 useEffect(()=>{let alive=true;Promise.all(assets.map(async(a:any)=>[a.id,!!(await getBytes('studio:proxy:'+a.id))])).then(rows=>{if(alive)setProxies(Object.fromEntries(rows));});return()=>{alive=false;};},[assets]);
 const check=async()=>{
  setBusy(true);
  try {for(const a of assets){
   if(!['audio','video'].includes(a.type))continue;
   let source:Awaited<ReturnType<typeof resolveMediaSource>>|null=null;
   try {source=await resolveMediaSource(a);
    const status=await new Promise<string>(resolve=>{
     const el=document.createElement(a.type==='audio'?'audio':'video');el.preload='auto';el.muted=true;
     const done=(message:string)=>{clearTimeout(timer);el.onloadeddata=null;el.onerror=null;el.pause();el.removeAttribute('src');el.load();resolve(message);};
     const timer=setTimeout(()=>done('Loading timed out — availability/codec needs attention'),10000);
     el.onloadeddata=()=>done('Readable '+(source!.local?'local '+source!.origin:'cloud fallback'));
     el.onerror=()=>done(el.error?.code===3?'Decode failed — source bytes available':'Source unavailable or unsupported');el.src=source!.url;
    });reportMediaHealth(a.id,status);
   }catch(error){reportMediaHealth(a.id,error instanceof Error?error.message:String(error));}finally{source?.release();}
  }} finally {setBusy(false);}
 };
 return <section style={{flex:1,minHeight:0,overflow:'auto',padding:16}}>
  <h3>Media repair</h3><p>Original files and local proxies are separate. Playback problems from Edit, VFX and Color appear here.</p>
  <div className="btnrow"><button className="minibtn" disabled={busy} onClick={check}>{busy?'Checking…':'Check availability and decoding'}</button><button className="minibtn" onClick={onReconnect}>Reconnect folders</button><button className="minibtn" onClick={onBuildProxies}>Build local proxies</button></div>
  <table style={{width:'100%',fontSize:12}}><thead><tr><th>Asset</th><th>Remembered location</th><th>Status</th><th>Proxy</th><th>Repair</th></tr></thead><tbody>{assets.map((a:any)=><tr key={a.id} style={{background:selected.includes(a.id)?'#403049':undefined}} onClick={()=>onSelect(a)}><td>{a.name}</td><td>{a.diskPath?`${a.diskPath}/${a.diskName||a.name}`:a.session?'Browser local storage':a.cloudUrl||a.url?'Source linked':'No source'}</td><td>{mediaHealth(a.id)?.message||(a.offline?'Offline':'Not checked')}</td><td>{proxies[a.id]?'Cached on this device':'None cached'}</td><td><button className="minibtn" onClick={e=>{e.stopPropagation();onRelink(a.id);}}>Relink…</button></td></tr>)}</tbody></table>
 </section>;
}
