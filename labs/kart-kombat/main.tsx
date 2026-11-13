import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {KombatSession} from '../../components/kithParty/KombatSession';
function Lab(){
 const q=new URLSearchParams(location.search);
 const chars=(q.get('kith')||'rello').split(',').slice(0,2);
 const [run,setRun]=useState(0);
 return <div className="kp-app"><KombatSession key={run} characters={chars} onExit={()=>setRun(r=>r+1)} onAgain={()=>setRun(r=>r+1)}/></div>;
}
createRoot(document.getElementById('root')!).render(<Lab/>);
