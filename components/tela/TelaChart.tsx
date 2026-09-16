import React, { useMemo, useState } from 'react';
import type { TelaChartDevice, TelaChartKind, TelaChartStyle, TelaDevice } from '../../types';
import type { TelaFormulaContext } from './TelaGrid';
import { resolveTelaChartData } from '../../services/telaChartData';
import { DATA_VIZ_ART_DIRECTIONS, DATA_VIZ_STYLES } from '../../services/fabula/dataVizArtDirection';

const KINDS:TelaChartKind[]=['BAR','LINE','AREA','DONUT','SCATTER','RADAR','WATERFALL','FUNNEL','GAUGE','BAR_3D','SCATTER_3D','SURFACE_3D'];

type Props={device:TelaChartDevice;devices:Record<string,TelaDevice>;formulaContext?:TelaFormulaContext;readOnly?:boolean;onUpdate:(patch:Partial<TelaChartDevice>)=>void};
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
const pts=(values:number[],W:number,H:number,pad:number,max:number)=>values.map((v,i)=>[pad+(i*Math.max(1,W-pad*2))/Math.max(1,values.length-1),H-pad-(v/max)*(H-pad*2)] as const);

export default function TelaChart({device,devices,formulaContext,readOnly,onUpdate}:Props){
  const [hover,setHover]=useState<{label:string;value:number;name:string;x:number;y:number}|null>(null);
  const data=useMemo(()=>resolveTelaChartData(device,devices,formulaContext),[device,devices,formulaContext]);
  const p=DATA_VIZ_ART_DIRECTIONS[device.style], W=device.width,H=device.height,pad=Math.max(44,Math.min(W,H)*.11);
  const all=data.series.flatMap(s=>s.values); const max=Math.max(1,...all.map(Math.abs));
  const updateBinding=(patch:Partial<TelaChartDevice['binding']>)=>onUpdate({binding:{...device.binding,...patch}});
  const animStyle=(i:number):React.CSSProperties=>device.animation.preset==='NONE'?{}:{animation:`telaChartIn ${device.animation.durationMs}ms cubic-bezier(.2,.8,.2,1) ${i*device.animation.staggerMs}ms both`,transformBox:'fill-box',transformOrigin:'center'};
  const tip=(series:string,label:string,value:number,x:number,y:number)=>device.interactive&&setHover({name:series,label,value,x,y});
  const clear=()=>setHover(null);
  const title=p.titleCase==='UPPER'?device.title.toUpperCase():device.title;
  const axes=<g opacity=".32" stroke={p.muted} strokeWidth="1">
    {p.grid!=='NONE'&&<><line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad}/><line x1={pad} y1={pad} x2={pad} y2={H-pad}/></>}
    {p.grid==='RULES'&&[0,.25,.5,.75,1].map(t=><line key={t} x1={pad} y1={pad+t*(H-pad*2)} x2={W-pad} y2={pad+t*(H-pad*2)}/>)}
    {p.grid==='DOTS'&&Array.from({length:9},(_,x)=>Array.from({length:5},(_,y)=><circle key={`${x}_${y}`} cx={pad+x*(W-pad*2)/8} cy={pad+y*(H-pad*2)/4} r="1.5" fill={p.muted} stroke="none"/>))}
    {p.grid==='CROSSHAIR'&&<><line x1={W/2} y1={pad} x2={W/2} y2={H-pad}/><line x1={pad} y1={H/2} x2={W-pad} y2={H/2}/></>}
    {p.grid==='RADIAL'&&[.25,.5,.75,1].map(t=><ellipse key={t} cx={W*.72} cy={H*.5} rx={(W-pad*2)*.34*t} ry={(H-pad*2)*.5*t} fill="none"/>)}
    {p.grid==='CONTOUR'&&[0,1,2,3].map(n=><path key={n} d={`M${pad-20},${H-pad-n*25} Q${W*.28},${pad+n*34} ${W*.52},${H-pad-n*31} T${W-pad+35},${pad+n*29}`} fill="none"/>)}
  </g>;
  const backdrop=<g pointerEvents="none">
    <defs><filter id={`glow_${device.id}`}><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id={`glass_${device.id}`} x2="1" y2="1"><stop stopColor={p.series[0]} stopOpacity=".28"/><stop offset="1" stopColor={p.series[1]} stopOpacity=".02"/></linearGradient></defs>
    {p.texture==='GLOW'&&<><circle cx={W*.82} cy={H*.18} r={Math.min(W,H)*.25} fill={p.series[1]} opacity=".12" filter={`url(#glow_${device.id})`}/><path d={`M0 ${H*.77} Q${W*.32} ${H*.2} ${W*.62} ${H*.66} T${W} ${H*.3}`} fill="none" stroke={p.series[0]} opacity=".12" strokeWidth="28"/></>}
    {p.texture==='GLASS'&&<><polygon points={`${W*.55},0 ${W},0 ${W*.78},${H} ${W*.34},${H}`} fill={`url(#glass_${device.id})`}/><circle cx={W*.76} cy={H*.36} r={Math.min(W,H)*.2} fill="none" stroke={p.fg} opacity=".12" strokeWidth="18"/></>}
    {p.texture==='INK'&&<path d={`M${-W*.05} ${H*.78} Q${W*.19} ${H*.25} ${W*.39} ${H*.7} T${W*.76} ${H*.35} T${W*1.08} ${H*.65}`} fill="none" stroke={p.fg} strokeWidth="24" strokeLinecap="round" opacity=".08"/>}
    {p.texture==='PAPER'&&Array.from({length:45},(_,i)=><circle key={i} cx={(i*83)%W} cy={(i*47)%H} r={(i%3)+.4} fill={p.fg} opacity=".025"/>)}
    {p.texture==='SCAN'&&Array.from({length:Math.ceil(H/12)},(_,i)=><line key={i} x1="0" x2={W} y1={i*12} y2={i*12} stroke={p.fg} opacity=".025"/>)}
    {device.style==='SWISS'&&<><rect x="0" y="0" width="12" height={H} fill={p.series[0]}/><text x={W-pad} y={pad*.55} textAnchor="end" fill={p.series[0]} fontSize="11" fontWeight="800">FIG. 01 / LIVE</text></>}
    {device.style==='BAUHAUS'&&<><circle cx={W*.86} cy={H*.2} r={Math.min(W,H)*.13} fill={p.series[2]} opacity=".9"/><rect x={W*.08} y={H*.68} width={W*.2} height={H*.17} fill={p.series[1]} opacity=".22"/></>}
    {device.style==='SPORTS'&&<path d={`M${W*.66} 0H${W}L${W*.82} ${H}H${W*.48}Z`} fill={p.series[0]} opacity=".1"/>}
    {device.style==='BROADCAST'&&<><rect x={W*.82} y="0" width={W*.18} height="7" fill={p.series[0]}/><rect x={W*.65} y="0" width={W*.16} height="7" fill={p.series[1]}/></>}
    {device.style==='MONO'&&<text x={W-pad} y={H-pad*.25} textAnchor="end" fill={p.fg} fontSize={Math.min(W,H)*.3} fontWeight="900" opacity=".035">DATA</text>}
  </g>;

  const renderCartesian=()=>{
    if(device.kind==='BAR'||device.kind==='BAR_3D'||device.kind==='WATERFALL'){
      const groups=Math.max(1,data.labels.length), seriesN=Math.max(1,data.series.length), slot=(W-pad*2)/groups, bw=Math.max(3,slot*.72/seriesN), depth=device.kind==='BAR_3D'?(device.camera?.depth||22):0;
      return <>{axes}{data.series.flatMap((series,si)=>series.values.map((value,i)=>{const h=Math.abs(value)/max*(H-pad*2),x=pad+i*slot+slot*.14+si*bw,y=H-pad-h,c=p.series[si%p.series.length],label=data.labels[i]||String(i+1);return <g key={`${series.id}_${i}`} style={animStyle(i+si)} onPointerEnter={()=>tip(series.name,label,value,x+bw/2,y)} onPointerLeave={clear}>
        {depth>0&&<><polygon points={`${x},${y} ${x+depth},${y-depth*.55} ${x+bw+depth},${y-depth*.55} ${x+bw},${y}`} fill={c} opacity=".82"/><polygon points={`${x+bw},${y} ${x+bw+depth},${y-depth*.55} ${x+bw+depth},${H-pad-depth*.55} ${x+bw},${H-pad}`} fill={c} opacity=".55"/></>}
        <rect x={x+(p.mark==='TICK'?bw*.34:0)} y={y} width={p.mark==='TICK'?bw*.32:bw} height={h} rx={p.mark==='CAPSULE'?bw/2:p.mark==='ROUNDED'?Math.min(9,bw*.25):0} fill={c} opacity={p.mark==='FACET' ? .86 : 1}/>{device.showValues&&<text x={x+bw/2} y={y-9-depth*.3} textAnchor="middle" fill={p.fg} fontSize="12" fontFamily={p.font}>{value}</text>}
      </g>}))}{data.labels.map((label,i)=><text key={i} x={pad+i*slot+slot/2} y={H-pad+23} textAnchor="middle" fill={p.muted} fontSize="11">{label.slice(0,12)}</text>)}</>;
    }
    const paths=data.series.map((series,si)=>{const points=pts(series.values,W,H,pad,max),d=points.map((q,i)=>`${i?'L':'M'}${q[0]},${q[1]}`).join(' '),c=p.series[si%p.series.length];return <g key={series.id} style={animStyle(si)} filter={p.texture==='GLOW'?`url(#glow_${device.id})`:undefined}>{device.kind==='AREA'&&<path d={`${d} L${points.at(-1)?.[0]},${H-pad} L${points[0]?.[0]},${H-pad} Z`} fill={c} opacity={p.texture==='INK' ? .12 : .22}/>}<path d={d} fill="none" stroke={c} strokeWidth={p.lineWidth} strokeLinecap={p.mark==='SHARP'?'square':'round'} strokeLinejoin={p.mark==='SHARP'?'miter':'round'} strokeDasharray={p.mark==='TICK'?'2 10':undefined}/>{points.map((q,i)=>p.mark==='FACET'?<rect key={i} x={q[0]-5} y={q[1]-5} width="10" height="10" transform={`rotate(45 ${q[0]} ${q[1]})`} fill={c} onPointerEnter={()=>tip(series.name,data.labels[i]||String(i+1),series.values[i],q[0],q[1])} onPointerLeave={clear}/>:p.mark==='TICK'?<line key={i} x1={q[0]} x2={q[0]} y1={q[1]-7} y2={q[1]+7} stroke={c} strokeWidth="3"/>:<circle key={i} cx={q[0]} cy={q[1]} r={device.kind.includes('SCATTER')?p.mark==='DOT'?9:7:p.mark==='DOT'?6:4} fill={c} stroke={p.mark==='DOT'?p.bg:undefined} strokeWidth={p.mark==='DOT'?3:undefined} onPointerEnter={()=>tip(series.name,data.labels[i]||String(i+1),series.values[i],q[0],q[1])} onPointerLeave={clear}/>)}</g>});
    return <>{axes}{paths}{data.labels.map((label,i)=><text key={i} x={pad+i*Math.max(1,W-pad*2)/Math.max(1,data.labels.length-1)} y={H-pad+23} textAnchor="middle" fill={p.muted} fontSize="11">{label.slice(0,10)}</text>)}</>;
  };

  const renderRadial=()=>{
    const values=data.series[0]?.values||[],sum=Math.max(1,values.reduce((a,b)=>a+Math.max(0,b),0)),cx=W/2,cy=H/2,r=Math.min(W,H)*.28;
    if(device.kind==='GAUGE'){const value=clamp((values[0]||0)/max),angle=-135+270*value,end=[cx+Math.cos(angle*Math.PI/180)*r,cy+Math.sin(angle*Math.PI/180)*r];return <g style={animStyle(0)}><path d={`M${cx-r*.707},${cy+r*.707} A${r},${r} 0 1 1 ${cx+r*.707},${cy+r*.707}`} fill="none" stroke={p.muted} strokeWidth={r*.18} opacity=".25"/><line x1={cx} y1={cy} x2={end[0]} y2={end[1]} stroke={p.series[0]} strokeWidth="7"/><circle cx={cx} cy={cy} r="13" fill={p.series[0]}/><text x={cx} y={cy+r*.6} textAnchor="middle" fill={p.fg} fontSize="40" fontWeight="800">{values[0]||0}</text></g>}
    let angle=-Math.PI/2;return <g transform={`rotate(${device.camera?.yaw||0} ${cx} ${cy})`} style={animStyle(0)}>{values.map((value,i)=>{const portion=Math.max(0,value)/sum,start=angle,end=angle+portion*Math.PI*2;angle=end;const large=portion>.5?1:0,outer=`M${cx+Math.cos(start)*r},${cy+Math.sin(start)*r} A${r},${r} 0 ${large} 1 ${cx+Math.cos(end)*r},${cy+Math.sin(end)*r}`,inner=r*.56,d=`${outer} L${cx+Math.cos(end)*inner},${cy+Math.sin(end)*inner} A${inner},${inner} 0 ${large} 0 ${cx+Math.cos(start)*inner},${cy+Math.sin(start)*inner} Z`;return <path key={i} d={d} fill={p.series[i%p.series.length]} onPointerEnter={()=>tip(data.series[0]?.name||'Value',data.labels[i]||String(i+1),value,cx,cy-r)} onPointerLeave={clear}/>})}</g>;
  };

  const renderSpecial=()=>{
    const values=data.series[0]?.values||[];
    if(device.kind==='FUNNEL'){return <g>{values.map((v,i)=>{const width=(W-pad*2)*(v/max),x=(W-width)/2,y=pad+i*(H-pad*2)/Math.max(1,values.length),h=(H-pad*2)/Math.max(1,values.length)-5;return <g key={i} style={animStyle(i)} onPointerEnter={()=>tip(data.series[0]?.name||'Value',data.labels[i]||String(i+1),v,W/2,y)} onPointerLeave={clear}><polygon points={`${x},${y} ${x+width},${y} ${W/2+width*.4},${y+h} ${W/2-width*.4},${y+h}`} fill={p.series[i%p.series.length]}/></g>})}</g>}
    const n=Math.max(3,values.length),cx=W/2,cy=H/2,r=Math.min(W,H)*.31,points=values.map((v,i)=>{const a=-Math.PI/2+i*Math.PI*2/n,rr=r*v/max;return [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]});return <g>{[.25,.5,.75,1].map(s=><polygon key={s} points={Array.from({length:n},(_,i)=>{const a=-Math.PI/2+i*Math.PI*2/n;return `${cx+Math.cos(a)*r*s},${cy+Math.sin(a)*r*s}`}).join(' ')} fill="none" stroke={p.muted} opacity=".25"/>)}<polygon points={points.map(q=>q.join(',')).join(' ')} fill={p.series[0]} fillOpacity=".28" stroke={p.series[0]} strokeWidth="3" style={animStyle(0)}/></g>;
  };
  const radial=device.kind==='DONUT'||device.kind==='GAUGE'; const special=device.kind==='RADAR'||device.kind==='FUNNEL'||device.kind==='SURFACE_3D';
  return <div style={{width:'100%',color:p.fg,background:p.bg,position:'relative',overflow:'hidden'}}>
    <style>{`@keyframes telaChartIn{from{opacity:0;transform:scale(.68) translateY(18px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    {!readOnly&&<div style={{display:'flex',gap:6,flexWrap:'wrap',padding:8,background:'rgba(0,0,0,.28)',position:'relative',zIndex:2}}>
      <input aria-label="Chart title" value={device.title} onChange={e=>onUpdate({title:e.target.value})} style={{flex:'2 1 150px'}}/>
      <select aria-label="Chart type" value={device.kind} onChange={e=>onUpdate({kind:e.target.value as TelaChartKind})}>{KINDS.map(k=><option key={k}>{k}</option>)}</select>
      <select aria-label="Visual style" value={device.style} onChange={e=>onUpdate({style:e.target.value as TelaChartStyle})}>{DATA_VIZ_STYLES.map(s=><option key={s} value={s}>{DATA_VIZ_ART_DIRECTIONS[s].name}</option>)}</select>
      <select aria-label="Data source" value={device.binding.sourceType} onChange={e=>updateBinding({sourceType:e.target.value as any,sourceDeviceId:undefined})}><option>INLINE</option><option>GRID</option><option>BASE</option></select>
      {device.binding.sourceType!=='INLINE'&&<select aria-label="Source device" value={device.binding.sourceDeviceId||''} onChange={e=>updateBinding({sourceDeviceId:e.target.value})}><option value="">Choose data…</option>{Object.values(devices).filter(d=>d.type===device.binding.sourceType).map(d=><option key={d.id} value={d.id}>{('name'in d&&d.name)||d.id}</option>)}</select>}
      {device.binding.sourceType==='GRID'&&<><input aria-label="Label range" value={device.binding.labelRange||''} placeholder="A2:A8" onChange={e=>updateBinding({labelRange:e.target.value})}/><input aria-label="Value range" value={device.binding.series[0]?.range||''} placeholder="B2:B8" onChange={e=>updateBinding({series:device.binding.series.map((s,i)=>i? s:{...s,range:e.target.value})})}/></>}
      <select aria-label="Animation" value={device.animation.preset} onChange={e=>onUpdate({animation:{...device.animation,preset:e.target.value as any}})}>{['NONE','RISE','DRAW','CASCADE','ORBIT','MORPH'].map(a=><option key={a}>{a}</option>)}</select>
    </div>}
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${device.title}, ${device.kind} chart`} style={{display:'block',fontFamily:p.font}}>
      <rect width={W} height={H} fill={p.bg}/>{backdrop}<text x={pad} y={pad*.58} fill={p.fg} fontSize={device.style==='MONO'?31:26} fontWeight={device.style==='EDITORIAL'?400:800} fontStyle={p.titleCase==='ITALIC'?'italic':'normal'} letterSpacing={p.titleCase==='UPPER'?'1.5':'-.5'}>{title}</text>{device.subtitle&&<text x={pad} y={pad*.58+22} fill={p.muted} fontSize="12">{device.subtitle}</text>}
      {radial?renderRadial():special?renderSpecial():renderCartesian()}
      {device.showLegend&&<g>{data.series.map((s,i)=><g key={s.id} transform={`translate(${pad+i*150},${H-12})`}><rect width="12" height="4" y="-8" fill={p.series[i%p.series.length]}/><text x="18" fill={p.muted} fontSize="11">{s.name}</text></g>)}</g>}
      {hover&&<g pointerEvents="none"><rect x={Math.min(W-175,hover.x+12)} y={Math.max(10,hover.y-58)} width="164" height="46" rx="8" fill={p.fg}/><text x={Math.min(W-163,hover.x+24)} y={Math.max(30,hover.y-37)} fill={p.bg} fontSize="11">{hover.label} · {hover.name}</text><text x={Math.min(W-163,hover.x+24)} y={Math.max(47,hover.y-20)} fill={p.bg} fontSize="15" fontWeight="800">{hover.value}</text></g>}
    </svg>
    {!!data.errors.length&&!readOnly&&<div style={{padding:'7px 10px',color:'#FFD166',fontSize:11}}>{data.errors.join(' ')}</div>}
  </div>;
}
