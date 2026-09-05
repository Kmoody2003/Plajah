import { useEffect, useMemo, useState } from 'react';
import { FABULA_BROADCAST_PACKS } from '../../services/fabula/broadcastPacks';
import { systemBoardSvg } from '../../services/fabula/systemBoardSvg';
import { fontKeysFor, makeBroadcastTemplate, renderBroadcastTemplateSvg } from '../../services/fabula/broadcastTemplateFactory';
import { BROADCAST_DESIGNS } from '../../services/fabula/broadcastDesigns';
import { embedBroadcastFonts } from '../../services/fabula/broadcastFontEmbed';
import { ensureFontsLoaded, FONTS } from '../../services/tela/telaFonts';
import { useAriaSurface } from '../../services/aria/useAriaSurface';
import CouncilRoom from '../council/CouncilRoom';

const FAMILIES=[['ALL','ALL SYSTEMS'],['GLOBAL_TRADITIONS','GLOBAL'],['SPORTS','SPORTS'],['IMAGE_MATTE','CUTOUT + MATTE'],['COUNTERCULTURE','PUNK / POSTMODERN']];
const familyName={GLOBAL_TRADITIONS:'Authored traditions',SPORTS:'Sports',IMAGE_MATTE:'User media',COUNTERCULTURE:'Counterculture'};

// The previews are inline SVG, not <img>, so the page's Google Fonts reach the type. An <img>
// would fall back to system faces for every identity — which is what the library used to show.
function Inline({svg,style}){ return <div style={{lineHeight:0,...style}} dangerouslySetInnerHTML={{__html:svg.replace(/<svg /,'<svg style="width:100%;height:100%;display:block" ')}}/>; }

export default function BroadcastSystemsLibrary({onAddTemplate,ping}){
  const [family,setFamily]=useState('ALL');
  const [selected,setSelected]=useState(FABULA_BROADCAST_PACKS[0]?.id);
  const [kind,setKind]=useState('LOWER_THIRD');
  const [busy,setBusy]=useState(false);
  const [council,setCouncil]=useState(null); // null | {ask}
  const packs=useMemo(()=>family==='ALL'?FABULA_BROADCAST_PACKS:FABULA_BROADCAST_PACKS.filter(p=>p.family===family),[family]);
  // Aria can see this library and open the council room from chat ("ask the council").
  useAriaSurface({
    surface:'fabula-broadcast-systems', domain:'video', title:'Broadcast Systems',
    summary:`Choosing a broadcast identity. ${FABULA_BROADCAST_PACKS.length} hand-authored identities across four families; ${packs.length} in view.`,
    actions:[{id:'convene_council',label:'Take a brief to the Council of Art Directors',description:'Open the council room with a design brief when the user wants a look, an identity or art direction for their programme. The six directors propose, disagree, and Aria synthesises.',params:{ask:'the brief, one or two sentences in the user\'s terms',audience:'who it is for (optional)',feeling:'the feeling it should leave (optional)'}}],
    handlers:{convene_council:(params)=>{setCouncil({ask:String(params?.ask||''),audience:params?.audience,feeling:params?.feeling});return {ok:true,message:'The council room is open.'};}},
  },[packs.length]);
  const active=FABULA_BROADCAST_PACKS.find(p=>p.id===selected)||packs[0];
  const baseTemplate=useMemo(()=>active?makeBroadcastTemplate(active,kind):null,[active,kind]);
  const [draft,setDraft]=useState(baseTemplate);
  useEffect(()=>setDraft(baseTemplate),[baseTemplate]);
  // Load every face the visible identities use, once.
  useEffect(()=>{ensureFontsLoaded(packs.flatMap(p=>fontKeysFor(p.id)));},[packs]);
  const boards=useMemo(()=>Object.fromEntries(packs.map(p=>[p.id,systemBoardSvg(p)])),[packs]);
  const preview=useMemo(()=>draft?renderBroadcastTemplateSvg(draft):'',[draft]);
  const design=active?BROADCAST_DESIGNS[active.id]:null;
  const patchControl=(key,value)=>setDraft(t=>t?({...t,controls:{...t.controls,[key]:value}}):t);
  const add=async()=>{
    if(!draft) return; setBusy(true);
    try{
      // The pool asset is an <img>, so the faces travel inside the file.
      const svg=await embedBroadcastFonts(renderBroadcastTemplateSvg(draft),fontKeysFor(draft.packId));
      onAddTemplate?.(draft,`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      ping?.(`${draft.name} added as an editable motion template.`);
    } finally { setBusy(false); }
  };
  return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(260px,330px)',gap:10,height:'100%',minHeight:420}}>
    <section className="glass-dark" style={{padding:10,overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div className="btnrow" style={{marginBottom:9,flexWrap:'wrap'}}>{FAMILIES.map(([id,name])=><button key={id} className={`minibtn ${family===id?'blue':''}`} onClick={()=>setFamily(id)}>{name}</button>)}
        <button className="minibtn" style={{marginLeft:'auto',borderColor:'#8b5cf6',color:'#d0bcff'}} title="Aria takes your brief to the six art directors" onClick={()=>setCouncil({ask:''})}>ASK THE COUNCIL</button></div>
      {council&&<div style={{position:'fixed',inset:0,zIndex:80,background:'rgba(5,4,10,.78)',backdropFilter:'blur(6px)',display:'grid',placeItems:'center',padding:20}} onClick={e=>{if(e.target===e.currentTarget)setCouncil(null);}}>
        <div style={{width:'min(1240px,100%)',height:'min(860px,100%)'}}><CouncilRoom onClose={()=>setCouncil(null)} initialBrief={council} surface="fabula-broadcast-systems" domain="video" /></div>
      </div>}
      <div style={{overflow:'auto',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(185px,1fr))',gap:7,paddingRight:3}}>
        {packs.map(pack=><button key={pack.id} onClick={()=>setSelected(pack.id)} style={{padding:0,textAlign:'left',background:selected===pack.id?'rgba(255,255,255,.1)':'rgba(0,0,0,.26)',border:`1px solid ${selected===pack.id?pack.palette[1]:'rgba(255,255,255,.08)'}`,color:'inherit',cursor:'pointer',overflow:'hidden'}}>
          <div style={{aspectRatio:'16/9',position:'relative',overflow:'hidden',background:pack.palette[0]}}>
            <Inline svg={boards[pack.id]} style={{position:'absolute',inset:0}}/>
            {pack.collaborationRequired&&<div style={{position:'absolute',right:5,top:5,color:'#ffd36e',fontSize:7,border:'1px solid #ffd36e66',padding:3,background:'rgba(0,0,0,.5)'}}>PARTNER</div>}
          </div>
          <div style={{padding:'9px 10px 11px'}}><b style={{display:'block',fontSize:11}}>{pack.name}</b><span className="dim" style={{fontSize:8,textTransform:'uppercase'}}>{familyName[pack.family]} · 9 assets</span></div>
        </button>)}
      </div>
    </section>
    {active&&draft&&<aside className="glass-dark" style={{padding:14,overflow:'auto'}}>
      <div className="lbl">BROADCAST IDENTITY</div><h3 style={{fontSize:24,lineHeight:1,letterSpacing:'-.04em',margin:'9px 0'}}>{active.name}</h3>
      <div style={{display:'flex',height:5,marginBottom:14}}>{active.palette.map(c=><i key={c} style={{background:c,flex:1}}/>)}</div>
      <div style={{aspectRatio:`${draft.width}/${draft.height}`,background:draft.kind==='LOWER_THIRD'||draft.kind==='BUG'||draft.kind==='OVERLAY'?'repeating-conic-gradient(#2a2a2e 0 25%,#1c1c20 0 50%) 0 0/24px 24px':active.palette[0],border:'1px solid rgba(255,255,255,.12)',marginBottom:10,overflow:'hidden'}}><Inline svg={preview} style={{width:'100%',height:'100%'}}/></div>
      {design&&<>
        <div className="lbl">THE IDEA</div><p className="small" style={{fontStyle:'italic'}}>{design.idea}</p>
        <div className="lbl">TYPE</div><p className="small">{[design.type.display,design.type.text,design.type.utility].map(k=>FONTS[k]?.family||k).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')}</p>
      </>}
      <div className="lbl">ASSET FORMAT · {active.assets.length} BUILT</div><div className="btnrow" style={{flexWrap:'wrap',gap:4,marginBottom:10}}>{active.assets.map(a=><button key={a} className={`minibtn ${kind===a?'blue':''}`} style={{fontSize:7}} onClick={()=>setKind(a)}>{a.replace('_',' ')}</button>)}</div>
      <div className="lbl">EDITABLE COPY</div><input className="in" value={draft.controls.title} onChange={e=>patchControl('title',e.target.value)} style={{width:'100%',marginBottom:5}}/><input className="in" value={draft.controls.subtitle} onChange={e=>patchControl('subtitle',e.target.value)} style={{width:'100%',marginBottom:8}}/>
      {kind==='SCORE_STRIP'&&<div className="btnrow" style={{marginBottom:8}}><input className="in grow" value={draft.controls.scoreHome} onChange={e=>patchControl('scoreHome',e.target.value)}/><input className="in grow" value={draft.controls.scoreAway} onChange={e=>patchControl('scoreAway',e.target.value)}/></div>}
      <div className="lbl">MOTION SPEED · {draft.controls.motionSpeed.toFixed(1)}×</div><input type="range" min=".5" max="2" step=".1" value={draft.controls.motionSpeed} onChange={e=>patchControl('motionSpeed',Number(e.target.value))} style={{width:'100%'}}/>
      <div className="lbl">MATERIAL TRACE · {Math.round(draft.controls.texture*100)}%</div><input type="range" min="0" max="1" step=".05" value={draft.controls.texture} onChange={e=>patchControl('texture',Number(e.target.value))} style={{width:'100%',marginBottom:10}}/>
      <div className="lbl">PREMISE</div><p className="small">{active.premise}</p>
      <div className="lbl">MOTION GRAMMAR</div><p className="small">{active.motionGrammar}</p>
      <div className="lbl">TYPOGRAPHY</div><p className="small">{active.typography}</p>
      <div className="lbl">USER MEDIA</div><p className="small">{active.imageTreatment}</p>
      {active.guardrail&&<div style={{borderLeft:`2px solid ${active.palette[0]}`,padding:'8px 10px',background:'rgba(255,255,255,.035)',fontSize:9,lineHeight:1.5,margin:'12px 0',color:active.collaborationRequired?'#ffd36e':'var(--w55)'}}>{active.guardrail}</div>}
      <div className="lbl">EDITABLE LAYERS · {draft.layers.length}</div><div className="btnrow" style={{flexWrap:'wrap',gap:4}}>{draft.layers.map(layer=><span key={layer.id} className="chip" style={{fontSize:7}}>{layer.type}</span>)}</div>
      <button className="cta" style={{width:'100%',marginTop:14}} disabled={active.collaborationRequired||busy} onClick={add}>{active.collaborationRequired?'PARTNER AUTHORSHIP REQUIRED':busy?'EMBEDDING TYPE…':`ADD ${kind.replace('_',' ')} TO POOL`}</button>
    </aside>}
  </div>;
}
