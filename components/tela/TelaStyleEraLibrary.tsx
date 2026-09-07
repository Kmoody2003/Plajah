import React, { useMemo, useState } from 'react';
import { BookOpen, Check, Clock3, Compass, Search, Sparkles } from 'lucide-react';
import { TELA_STYLE_CATEGORIES, TELA_STYLE_ERAS, type StyleEraCategory, type TelaStyleEra } from '../../services/telaStyleEraLibrary';

function StylePreview({entry,active}:{entry:TelaStyleEra;active:boolean}) {
  const [paper,ink,accent,secondary]=entry.palette; const dark=entry.tone==='BOLD'; const fg=dark?'#fff':ink;
  const special = entry.id==='gothic' ? <div className="absolute right-4 top-7 w-14 h-24 rounded-t-full border-[3px]" style={{borderColor:accent}}/>
    : entry.id==='art-deco' ? <div className="absolute right-4 top-5 w-16 h-20 border-[3px] p-1" style={{borderColor:accent}}><div className="w-full h-full border" style={{borderColor:secondary,transform:'rotate(45deg) scale(.55)'}}/></div>
    : entry.id==='bauhaus' ? <><i className="absolute right-5 top-6 w-16 h-16 rounded-full" style={{background:accent}}/><i className="absolute right-14 top-16 w-6 h-20" style={{background:secondary}}/></>
    : entry.id==='de-stijl' ? <><i className="absolute right-4 top-5 w-16 h-14" style={{background:accent,border:`4px solid ${ink}`}}/><i className="absolute right-4 top-[76px] w-9 h-16" style={{background:secondary,border:`4px solid ${ink}`}}/></>
    : entry.id==='punk' ? <div className="absolute -left-2 right-2 top-16 h-10 -rotate-3 text-[10px] font-black p-2 text-white" style={{background:accent,clipPath:'polygon(0 12%,8% 0,16% 14%,25% 2%,34% 16%,44% 0,55% 12%,67% 1%,78% 14%,88% 0,100% 16%,98% 88%,88% 100%,76% 86%,65% 100%,53% 87%,41% 100%,28% 86%,15% 100%,0 86%)'}}>NO POLISH</div>
    : entry.id==='memphis' ? <>{[0,1,2,3,4,5].map(i=><i key={i} className="absolute w-3 h-3" style={{right:14+(i%3)*22,top:20+Math.floor(i/3)*30,background:i%2?accent:secondary,borderRadius:i%3===0?'50%':'2px',transform:`rotate(${i*24}deg)`}}/>)}</>
    : entry.id==='vaporwave' ? <div className="absolute right-0 top-0 w-24 h-full opacity-60" style={{background:`repeating-linear-gradient(90deg,transparent 0 13px,${secondary} 14px 15px),repeating-linear-gradient(0deg,transparent 0 13px,${secondary} 14px 15px)`,transform:'perspective(80px) rotateY(-18deg)'}}/>
    : null;
  return <div className="relative aspect-[4/3] overflow-hidden p-4" style={{background:dark?ink:paper}}>
    {entry.layout==='GRID'&&<div className="absolute inset-0 opacity-25" style={{background:`repeating-linear-gradient(90deg,transparent 0 23%,${accent} 23.5% 24%)`}}/>}
    {entry.layout==='ORGANIC'&&<div className="absolute -right-9 -top-12 w-32 h-32 rounded-[44%_56%_61%_39%] rotate-12" style={{background:secondary}}/>}
    {entry.layout==='MANUSCRIPT'&&<div className="absolute inset-2 border-[3px]" style={{borderColor:accent,boxShadow:`inset 0 0 0 3px ${paper},inset 0 0 0 4px ${secondary}`}}/>}
    {entry.layout==='COLLAGE'&&<div className="absolute left-[-8px] right-8 top-7 h-7 -rotate-6" style={{background:accent}}/>}
    {special}<div className="relative mt-5 text-[7px] font-black tracking-[.15em]" style={{color:fg,opacity:.58}}>{entry.period.toUpperCase()}</div><div className="relative mt-2 max-w-[78%] text-[17px] leading-[.92] font-black" style={{color:fg,fontFamily:entry.typography.toLowerCase().includes('serif')?'Georgia,serif':'system-ui,sans-serif',transform:entry.layout==='COLLAGE'?'rotate(-2deg)':undefined}}>{entry.name}</div><div className="absolute left-4 bottom-4 w-[48%] h-1 rounded-full" style={{background:accent}}/>{!special&&entry.layout==='GEOMETRIC'&&<div className="absolute right-4 bottom-4 w-12 h-12 rounded-full" style={{background:secondary,opacity:.75}}/>}{active&&<span className="absolute right-3 top-3 grid place-items-center w-6 h-6 rounded-full text-white" style={{background:'#8C2CB7'}}><Check size={13}/></span>}
  </div>;
}

export default function TelaStyleEraLibrary({ onChoose }:{ onChoose:(entry:TelaStyleEra)=>void }) {
  const [query,setQuery]=useState(''); const [category,setCategory]=useState<StyleEraCategory|'ALL'>('ALL'); const [selected,setSelected]=useState<TelaStyleEra|null>(null);
  const rows=useMemo(()=>TELA_STYLE_ERAS.filter(entry=>{
    const q=query.trim().toLowerCase();
    return (category==='ALL'||entry.category===category)&&(!q||[entry.name,entry.period,entry.region,entry.description,entry.traits.join(' ')].join(' ').toLowerCase().includes(q));
  }),[query,category]);
  return <section className="mb-8 overflow-hidden rounded-[20px]" style={{background:'radial-gradient(circle at 12% 0%,rgba(140,44,183,.22),transparent 31%),linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))',border:'1px solid rgba(255,255,255,.12)'}}>
    <div className="p-4 sm:p-5" style={{borderBottom:'1px solid rgba(255,255,255,.09)'}}>
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="mr-auto"><div className="flex items-center gap-2 text-[10px] font-black tracking-[.18em] text-fuchsia-200/70"><Sparkles size={13}/> DESIGN HISTORIES</div><h3 className="mt-1 font-display italic text-[1.35rem] text-white">An atlas of editable document styles</h3><p className="mt-1 max-w-2xl text-[.7rem] leading-relaxed text-white/45">{TELA_STYLE_ERAS.length} historically grounded starting systems. Learn the language, follow its museum trail, then bend it toward your own story.</p></div>
        <label className="h-10 min-w-[260px] flex items-center gap-2 px-3 rounded-[11px] bg-black/20 border border-white/10"><Search size={14} className="text-white/35"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Gothic, punk, geometric…" className="flex-1 bg-transparent outline-none text-[.72rem] text-white placeholder:text-white/25"/></label>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 custom-scrollbar"><button onClick={()=>setCategory('ALL')} className="shrink-0 h-7 px-3 rounded-full text-[8px] font-black tracking-[.08em]" style={{background:category==='ALL'?'#fff':'rgba(255,255,255,.05)',color:category==='ALL'?'#211427':'rgba(255,255,255,.48)'}}>ALL ERAS</button>{TELA_STYLE_CATEGORIES.map(c=><button key={c} onClick={()=>setCategory(c)} className="shrink-0 h-7 px-3 rounded-full text-[8px] font-black tracking-[.08em]" style={{background:category===c?'linear-gradient(135deg,#6B0099,#D40055)':'rgba(255,255,255,.05)',color:category===c?'#fff':'rgba(255,255,255,.48)',border:'1px solid rgba(255,255,255,.07)'}}>{c}</button>)}</div>
    </div>
    <div className="p-4 sm:p-5"><div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{rows.map(entry=>{
      const active=selected?.id===entry.id;
      return <button key={entry.id} onClick={()=>setSelected(active?null:entry)} className="group overflow-hidden rounded-[16px] text-left transition-transform hover:-translate-y-0.5" style={{background:'rgba(0,0,0,.2)',border:`1px solid ${active?'rgba(216,93,255,.75)':'rgba(255,255,255,.1)'}`,boxShadow:active?'0 0 0 2px rgba(140,44,183,.2),0 18px 45px rgba(0,0,0,.3)':undefined}}>
        <StylePreview entry={entry} active={active}/>
        <div className="p-3"><div className="flex items-center gap-1.5 text-[8px] text-white/35"><Clock3 size={10}/>{entry.period}<span className="mx-1">·</span><Compass size={10}/>{entry.region}</div><div className="mt-2 flex gap-1">{entry.palette.map(color=><span key={color} className="w-4 h-4 rounded-full border border-white/15" style={{background:color}}/>)}</div><div className="mt-2 flex flex-wrap gap-1">{entry.traits.slice(0,3).map(t=><span key={t} className="px-1.5 py-0.5 rounded text-[7px] text-white/42 bg-white/[.05]">{t}</span>)}</div></div>
      </button>})}</div>{!rows.length&&<div className="py-14 text-center text-white/35 text-sm">No movement found. Try a material, era, or visual trait.</div>}
      {selected&&<div className="sticky bottom-2 mt-4 p-4 rounded-[16px] backdrop-blur-xl" style={{background:'rgba(18,12,24,.94)',border:'1px solid rgba(255,255,255,.14)',boxShadow:'0 18px 60px rgba(0,0,0,.45)'}}><div className="flex flex-col md:flex-row md:items-center gap-4"><div className="grid place-items-center w-11 h-11 rounded-[13px] text-white shrink-0" style={{background:`linear-gradient(135deg,${selected.palette[2]},${selected.palette[3]})`}}><BookOpen size={18}/></div><div className="mr-auto"><div className="text-sm font-extrabold text-white">{selected.name}</div><p className="mt-0.5 max-w-2xl text-[.68rem] leading-relaxed text-white/48">{selected.description} <span className="text-white/28">Type direction: {selected.typography}. Museum path: {selected.museumPath}.</span></p>{selected.culturalNote&&<p className="mt-1 text-[.62rem] text-amber-200/65">Context note: {selected.culturalNote}</p>}</div><button onClick={()=>onChoose(selected)} className="h-10 px-5 rounded-[11px] text-[.68rem] font-black text-white shrink-0" style={{background:'linear-gradient(135deg,#6B0099,#D40055)',boxShadow:'0 8px 24px rgba(140,44,183,.3)'}}>USE THIS STYLE</button></div></div>}
    </div>
  </section>;
}
