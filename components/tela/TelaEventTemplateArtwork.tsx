import React, { useEffect, useMemo, useRef } from 'react';
import { EVENT_REVIEW_TEMPLATES } from '../../services/tela/eventTemplateCollection';
import { objectToSvg } from '../../services/tela/telaSvg';

export interface TelaEventTemplateArtworkProps {
 templateId:string;
 eventTitle:string;
 date:string;
 time:string;
 venue:string;
 mode:'print'|'digital'|'evite';
 motionEnabled?:boolean;
}

/** Explicit template selection is required. Review templates never auto-activate. */
export default function TelaEventTemplateArtwork({templateId,eventTitle,date,time,venue,mode,motionEnabled=true}:TelaEventTemplateArtworkProps){
 const host=useRef<HTMLDivElement>(null);
 const template=EVENT_REVIEW_TEMPLATES.find(t=>t.id===templateId);
 const objects=useMemo(()=>{
  if(!template)return [];
  return template.build().map(o=>{
   if(o.kind!=='TEXT')return o;
   const role=o.id.slice(template.id.length+1);
   const values:Record<string,string>={title:eventTitle,date:template.kind==='ticket'?[date,time].filter(Boolean).join(' · '):date,time,venue,subtitle:mode==='evite'?'You are invited':'Event admission',sample:'',rsvp:''};
   if(!(role in values))return o;
   const text=values[role];
   // Preserve the composition with long real event names, keeping every value
   // available to assistive technology through the complete figure label.
   const estimated=text.length*(o.fontSize||24)*.61;
   const fontSize=estimated>o.w?Math.max(10,(o.fontSize||24)*o.w/estimated):(o.fontSize||24);
   return {...o,text,fontSize};
  });
 },[template,eventTitle,date,time,venue,mode]);
 useEffect(()=>{
  const element=host.current;
  if(!element||!template||mode==='print'||!motionEnabled)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let animations:Animation[]=[];
  const cancel=()=>{animations.forEach(a=>a.cancel());animations=[];};
  const start=()=>{
   cancel();
   if(preference.matches)return;
   for(const track of template.motion.tracks){
    const target=Array.from(element.querySelectorAll<SVGGElement>('g[data-event-layer]')).find(g=>g.dataset.eventLayer===track.objectId);
    if(!target||typeof target.animate!=='function')continue;
    let frames:Keyframe[];
    if(track.property==='opacity')frames=[{opacity:1},{opacity:track.from?track.to/track.from:track.to}];
    else if(track.property==='rotation')frames=[{transform:'rotate(0deg)'},{transform:`rotate(${track.to-track.from}deg)`}];
    else frames=[{transform:'translate(0px,0px)'},{transform:`translate(${track.property==='x'?track.to-track.from:0}px,${track.property==='y'?track.to-track.from:0}px)`}];
    animations.push(target.animate(frames,{duration:track.duration,delay:track.delay,iterations:Infinity,direction:'alternate',easing:'ease-in-out'}));
   }
  };
  start();preference.addEventListener('change',start);
  return()=>{cancel();preference.removeEventListener('change',start);};
 },[template,objects,mode,motionEnabled]);
 if(!template)return null;
 return <div ref={host} className="tela-event-template-artwork" role="img" aria-label={[eventTitle,date,time,venue].filter(Boolean).join(' · ')}>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${template.width} ${template.height}`} style={{display:'block',width:'100%',height:'auto'}} aria-hidden="true">
   {objects.map(o=><g key={o.id} data-event-layer={o.id} style={{transformBox:'fill-box',transformOrigin:'center'}} dangerouslySetInnerHTML={{__html:objectToSvg(o)}} />)}
  </svg>
 </div>;
}
