import React, { useState } from 'react';
import { canonBooks, canonMark, type BibleCanon } from '../../services/bibleCanon';
import type { BibleBook } from '../../services/bibleService';

export default function CanonBookPicker({canon,book,onCanon,onBook}:{canon:BibleCanon;book:BibleBook;onCanon:(canon:BibleCanon)=>void;onBook:(book:BibleBook)=>void}) {
  const [open,setOpen]=useState(false);
  return <div className="relative flex flex-wrap gap-2 text-xs">
    <select aria-label="Bible canon" value={canon} onChange={e=>{onCanon(e.target.value as BibleCanon);setOpen(false);}} className="bg-[#17141f] border border-white/20 rounded px-2 py-1">
      <option value="protestant">Protestant · 66 books</option><option value="catholic">Catholic · 73 books</option><option value="orthodox">Eastern Orthodox · collection</option>
    </select>
    <button aria-expanded={open} aria-controls="lectio-book-menu" onClick={()=>setOpen(!open)} className="border border-white/20 rounded px-2 py-1" style={{color:canonMark(book).color}}>{book.name} ▾</button>
    {open && <div id="lectio-book-menu" className="absolute top-full left-0 z-50 mt-1 w-[min(340px,85vw)] rounded-lg border border-white/20 bg-[#17141f] shadow-xl" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
      <p className="p-3 text-[11px] border-b border-white/15"><span style={{color:'#e2e8f0'}}>Shared</span> · <span style={{color:'#fbbf24'}}>Catholic & Orthodox</span> · <span style={{color:'#c084fc'}}>Additional Orthodox</span></p>
      {canon==='orthodox' && <p className="px-3 py-2 text-[11px] text-white/65">Greek Septuagint collection; canon and appendices vary by Orthodox tradition. Additions to Daniel and Baruch appear separately here.</p>}
      <div className="max-h-80 overflow-y-auto p-1">{canonBooks(canon).map(b=>{const mark=canonMark(b);return <button key={b.num} aria-current={b.num===book.num?'true':undefined} onClick={()=>{onBook(b);setOpen(false);}} className="block w-full text-left rounded px-3 py-2 hover:bg-white/10 focus:bg-white/10" style={{color:mark.color}}><span className="font-semibold">{b.name}</span><span className="block text-[10px] opacity-80">{mark.label}</span></button>;})}</div>
    </div>}
  </div>;
}
