import {createState,emptyInput,step,standings} from '../components/kithParty/engine';
import {COURSES} from '../components/kithParty/course3d';
for(const c of COURSES){
 const s=createState('circuit',['rello'],421,c.id);
 const counts:Record<string,number>={};let steps=0;
 for(;steps<120*240&&s.phase!=='finished';steps++){
  const p=s.players[0];
  const inp={...emptyInput(),y:-1,x:Math.max(-1,Math.min(1,p.lane/20)),item:steps%240===0,special:steps%300===0};
  step(s,[inp],1/120);
 }
 for(const e of s.race!.events)counts[e.kind]=(counts[e.kind]||0)+1;
 const st=standings(s);
 console.log(c.id,'t=',s.time.toFixed(1),'finish',st.map(p=>`${p.character}:${p.finish?.toFixed(1)??p.progress.toFixed(2)}`).join(' '),JSON.stringify(counts),'nan?',s.players.some(p=>!Number.isFinite(p.progress)));
}
