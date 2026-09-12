import { useEffect, useMemo, useState } from 'react';
import TelaChart from '../tela/TelaChart';
import { buildRenderMaps } from '../tela/renderDevice';
import { makeTelaChart, resolveTelaChartData } from '../../services/telaChartData';
import { listTelaDocs, loadTelaDoc } from '../../services/telaStore';
import { DATA_VIZ_ART_DIRECTIONS, DATA_VIZ_STYLES } from '../../services/fabula/dataVizArtDirection';

const KINDS=['BAR','LINE','AREA','DONUT','SCATTER','RADAR','WATERFALL','FUNNEL','GAUGE','BAR_3D','SCATTER_3D','SURFACE_3D'];
const strip=(block)=>String(block?.text||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

function csvBinding(text){
  const rows=text.trim().split(/\r?\n/).map(line=>line.split(/,|\t/).map(v=>v.trim()));
  if(rows.length<2)return null;
  const headers=rows[0],body=rows.slice(1),labels=body.map((r,i)=>r[0]||`Row ${i+1}`);
  const series=headers.slice(1).map((name,si)=>({id:`series_${si+1}`,name:name||`Series ${si+1}`,values:body.map(row=>{const n=Number(String(row[si+1]||'').replace(/[$,%]/g,''));return Number.isFinite(n)?n:0})}));
  return {sourceType:'INLINE',labels,series:series.length?series:[{id:'series_1',name:'Value',values:body.map(r=>Number(r[1])||0)}]};
}

export default function DataVizBuilder({onAddToPool,ping}){
  const [chart,setChart]=useState(()=>makeTelaChart('fabula_chart'));
  const [csv,setCsv]=useState('Month,Audience,Engagement\nJan,32,22\nFeb,48,31\nMar,44,39\nApr,68,51\nMay,74,63\nJun,92,79');
  const [docs,setDocs]=useState([]),[doc,setDoc]=useState(null);
  useEffect(()=>{listTelaDocs().then(setDocs).catch(()=>setDocs([]))},[]);
  const maps=useMemo(()=>doc?buildRenderMaps(doc.devices,doc.frames,strip):null,[doc]);
  const devices=doc?.devices||{};
  const patch=(p)=>setChart(c=>({...c,...p}));
  const bindCsv=()=>{const binding=csvBinding(csv);if(!binding){ping?.('Paste a header row and at least one data row.');return}patch({binding});};
  const loadDoc=async(id)=>{if(!id){setDoc(null);return}const found=await loadTelaDoc(id);setDoc(found)};
  const bindDevice=(id)=>{const source=devices[id];if(!source)return;if(source.type==='GRID')patch({binding:{sourceType:'GRID',sourceDeviceId:id,labelRange:'A2:A8',series:[{id:'series_1',name:'Series 1',range:'B2:B8'}]}});if(source.type==='BASE'){const label=source.fields.find(f=>f.type==='TEXT')||source.fields[0],nums=source.fields.filter(f=>f.type==='NUMBER');patch({binding:{sourceType:'BASE',sourceDeviceId:id,labelFieldId:label?.id,series:(nums.length?nums:[source.fields[1]]).filter(Boolean).map((f,i)=>({id:`series_${i+1}`,name:f.name,fieldId:f.id}))}})}};
  const add=()=>{const resolved=resolveTelaChartData(chart,devices,maps?.formulaContext);const portable={...chart,id:`chart_${Date.now()}`,binding:{sourceType:'INLINE',labels:resolved.labels,series:resolved.series.map(s=>({...s}))}};onAddToPool?.(portable,chart.title);ping?.(`Chart “${chart.title}” added to the media pool.`)};
  return <div style={{display:'grid',gridTemplateColumns:'minmax(250px,360px) minmax(0,1fr)',gap:12,height:'100%',minHeight:420}}>
    <div className="glass-dark" style={{padding:12,overflow:'auto'}}>
      <div className="paneltitle">DATA MOTION STUDIO</div>
      <div className="lbl">TITLE</div><input className="in" value={chart.title} onChange={e=>patch({title:e.target.value})}/>
      <div className="btnrow" style={{marginTop:8}}><select className="sel grow" value={chart.kind} onChange={e=>patch({kind:e.target.value})}>{KINDS.map(x=><option key={x}>{x.replace('_',' ')}</option>)}</select><select className="sel grow" value={chart.style} onChange={e=>patch({style:e.target.value})}>{DATA_VIZ_STYLES.map(x=><option key={x} value={x}>{DATA_VIZ_ART_DIRECTIONS[x].name}</option>)}</select></div>
      <div style={{marginTop:6,padding:'8px 9px',border:'1px solid rgba(255,255,255,.08)',fontSize:9,lineHeight:1.45,color:'var(--w55)'}}><b style={{color:'var(--w80)'}}>{DATA_VIZ_ART_DIRECTIONS[chart.style].studioVoice}</b><br/>{DATA_VIZ_ART_DIRECTIONS[chart.style].premise}</div>
      <div className="lbl" style={{marginTop:10}}>PASTE CSV / TSV</div><textarea className="in" rows={7} value={csv} onChange={e=>setCsv(e.target.value)} style={{width:'100%',resize:'vertical'}}/><button className="minibtn blue" onClick={bindCsv} style={{marginTop:5}}>USE PASTED DATA</button>
      <div className="lbl" style={{marginTop:12}}>OR BIND A TELA DOCUMENT</div><select className="sel" value={doc?.id||''} onChange={e=>loadDoc(e.target.value)} style={{width:'100%'}}><option value="">Choose Tela document…</option>{docs.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select>
      {doc&&<select className="sel" value={chart.binding.sourceDeviceId||''} onChange={e=>bindDevice(e.target.value)} style={{width:'100%',marginTop:5}}><option value="">Choose Grid or Base…</option>{Object.values(devices).filter(d=>d.type==='GRID'||d.type==='BASE').map(d=><option key={d.id} value={d.id}>{d.name||doc.frames.find(f=>f.deviceIds.includes(d.id))?.label||d.type}</option>)}</select>}
      {chart.binding.sourceType==='GRID'&&<div className="btnrow" style={{marginTop:6}}><input className="in grow" value={chart.binding.labelRange||''} placeholder="Labels A2:A8" onChange={e=>patch({binding:{...chart.binding,labelRange:e.target.value}})}/><input className="in grow" value={chart.binding.series[0]?.range||''} placeholder="Values B2:B8" onChange={e=>patch({binding:{...chart.binding,series:chart.binding.series.map((s,i)=>i?s:{...s,range:e.target.value})}})}/></div>}
      <div className="lbl" style={{marginTop:12}}>MOTION</div><div className="btnrow"><select className="sel grow" value={chart.animation.preset} onChange={e=>patch({animation:{...chart.animation,preset:e.target.value}})}>{['NONE','RISE','DRAW','CASCADE','ORBIT','MORPH'].map(x=><option key={x}>{x}</option>)}</select><select className="sel grow" value={chart.transition.in} onChange={e=>patch({transition:{...chart.transition,in:e.target.value}})}>{['NONE','FADE','WIPE','ZOOM','FLIP'].map(x=><option key={x}>{x} IN</option>)}</select></div>
      <div className="btnrow" style={{marginTop:8}}><button className={`minibtn grow ${chart.interactive?'blue':''}`} onClick={()=>patch({interactive:!chart.interactive})}>INTERACTIVE {chart.interactive?'ON':'OFF'}</button><button className={`minibtn grow ${chart.showValues?'blue':''}`} onClick={()=>patch({showValues:!chart.showValues})}>VALUES {chart.showValues?'ON':'OFF'}</button></div>
      {chart.kind.includes('3D')&&<><div className="lbl" style={{marginTop:10}}>CAMERA · YAW {chart.camera?.yaw||0}°</div><input type="range" min="-60" max="60" value={chart.camera?.yaw||0} onChange={e=>patch({camera:{...(chart.camera||{pitch:18,depth:26}),yaw:Number(e.target.value)}})} style={{width:'100%'}}/></>}
      <button className="cta" onClick={add} style={{width:'100%',marginTop:12}}>ADD EDITABLE CHART TO POOL</button>
    </div>
    <div style={{display:'grid',placeItems:'center',minWidth:0,overflow:'auto',background:'#08070b'}}><div style={{width:'min(100%,960px)'}}><TelaChart device={chart} devices={devices} formulaContext={maps?.formulaContext} readOnly onUpdate={()=>{}}/></div></div>
  </div>;
}
