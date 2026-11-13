import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QuestSession} from '../../components/kithParty/quest/QuestSession';
import {createQuestState,stepQuest,emptyQuestInput} from '../../components/kithParty/quest/sim';
import relloSvg from '../../public/kith-party/characters/rello.svg';
import choraSvg from '../../public/kith-party/characters/chora.svg';
// standalone builds (phone test page) embed the two file-based portraits
(globalThis as {__kithPortraits?:Record<string,string>}).__kithPortraits={rello:relloSvg,chora:choraSvg};
// the lab is a playtest surface: every stage open
(globalThis as {__kithQuestPlaytest?:boolean}).__kithQuestPlaytest=true;
function Lab(){
 const q=new URLSearchParams(location.search);
 const kith=q.get('kith')||'';
 const [run,setRun]=useState(0);
 return <div className="kp-app"><QuestSession key={run} characters={kith?[kith]:[]} onExit={()=>setRun(r=>r+1)}/></div>;
}
// dev hook for browser checks: questLab.sim
(window as any).questLab={createQuestState,stepQuest,emptyQuestInput};
createRoot(document.getElementById('root')!).render(<Lab/>);
