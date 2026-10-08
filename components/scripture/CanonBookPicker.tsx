import React, { useMemo, useState } from 'react';
import { canonBooks, canonMark, type BibleCanon } from '../../services/bibleCanon';
import type { BibleBook } from '../../services/bibleService';
import { resolveScriptureQuery, queryLabel } from '../../services/scriptureSearch';

/**
 * Canon + book picker, with a "go to" box that anticipates: part of a book, any
 * spelling, an ordinal in any form ("2", "II", "second" → every book with one),
 * and bare numbers as chapter then verse ("2 pet 3 9"). Same engine as Ambo.
 */
export default function CanonBookPicker({canon,book,onCanon,onBook,onGo}:{canon:BibleCanon;book:BibleBook;onCanon:(canon:BibleCanon)=>void;onBook:(book:BibleBook)=>void;onGo?:(book:BibleBook,chapter:number,verse?:number)=>void}) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [focused,setFocused]=useState(false);
  const books=canonBooks(canon);
  const q=useMemo(()=>query.trim()?resolveScriptureQuery(query,books):null,[query,books]);
  const menuBooks=q&&!q.contextual?q.matches.map(m=>m.book):books;

  const go=()=>{
    if(!q) return;
    const b=q.contextual?book:q.book;
    if(!b) return;
    const ch=q.chapter??1;
    if(ch<1||ch>b.chapters) return;
    if(onGo) onGo(b,ch,q.verse); else onBook(b);
    setQuery(''); setOpen(false);
  };

  return <div className="relative flex flex-wrap gap-2 text-xs">
    <select aria-label="Bible canon" value={canon} onChange={e=>{onCanon(e.target.value as BibleCanon);setOpen(false);}} className="bg-[#17141f] border border-white/20 rounded px-2 py-1">
      <option value="protestant">Protestant · 66 books</option><option value="catholic">Catholic · 73 books</option><option value="orthodox">Eastern Orthodox · collection</option>
    </select>
    <button aria-expanded={open} aria-controls="lectio-book-menu" onClick={()=>setOpen(!open)} className="border border-white/20 rounded px-2 py-1" style={{color:canonMark(book).color}}>{book.name} ▾</button>
    <div className="relative">
      <input aria-label="Go to reference" value={query} onChange={e=>{setQuery(e.target.value);setOpen(false);}}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        onKeyDown={e=>{if(e.key==='Enter')go();if(e.key==='Escape')setQuery('');}}
        placeholder="Go to… john 3 16 · 2 pet 3 9"
        title="Part of a book (any spelling, 2 / II / second), then chapter and verse — no colon needed"
        className="w-44 bg-[#17141f] border border-white/20 rounded px-2 py-1 placeholder-white/30 focus:border-[#d4af37]/60 outline-none" />
      {focused && q && <div className="absolute top-full left-0 z-50 mt-1 w-[min(320px,85vw)] rounded-lg border border-white/20 bg-[#17141f] shadow-xl p-1">
        {q.ordinalOnly ? <p className="px-2 py-1 text-[11px] text-white/50">Books with a {['','first','second','third','fourth'][q.ordinal??0]}</p>
          : q.contextual ? <button onMouseDown={e=>{e.preventDefault();go();}} className="w-full text-left rounded px-2 py-1.5 bg-[#d4af37]/15 text-[#d4af37] font-semibold">{book.name} {q.chapter}{q.verse!=null?`:${q.verse}`:''} <span className="text-white/40 font-normal">↵</span></button>
          : q.book ? <button onMouseDown={e=>{e.preventDefault();go();}} className="w-full text-left rounded px-2 py-1.5 bg-[#d4af37]/15 text-[#d4af37] font-semibold">{queryLabel(q)}{q.chapter!==undefined&&!q.ref?<span className="text-[#F5C542] font-normal"> — {q.book.chapters} chapters</span>:<span className="text-white/40 font-normal"> ↵</span>}</button>
          : <p className="px-2 py-1 text-[11px] text-white/50">No book matches “{query}”</p>}
        {q.matches.length>(q.ordinalOnly?0:1)&&<div className="max-h-56 overflow-y-auto">
          {q.matches.slice(q.ordinalOnly?0:1,12).map(m=><button key={m.book.num} onMouseDown={e=>{e.preventDefault();const nums=q.chapter!==undefined?` ${q.chapter}${q.verse!=null?` ${q.verse}`:''}`:' ';setQuery(`${m.book.name}${nums}`);}}
            className="block w-full text-left rounded px-2 py-1 hover:bg-white/10" style={{color:canonMark(m.book).color}}>{m.book.name}</button>)}
        </div>}
      </div>}
    </div>
    {open && <div id="lectio-book-menu" className="absolute top-full left-0 z-50 mt-1 w-[min(340px,85vw)] rounded-lg border border-white/20 bg-[#17141f] shadow-xl" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
      <p className="p-3 text-[11px] border-b border-white/15"><span style={{color:'#e2e8f0'}}>Shared</span> · <span style={{color:'#fbbf24'}}>Catholic & Orthodox</span> · <span style={{color:'#c084fc'}}>Additional Orthodox</span></p>
      {canon==='orthodox' && <p className="px-3 py-2 text-[11px] text-white/65">Greek Septuagint collection; canon and appendices vary by Orthodox tradition. Additions to Daniel and Baruch appear separately here.</p>}
      <div className="max-h-80 overflow-y-auto p-1">{menuBooks.map(b=>{const mark=canonMark(b);return <button key={b.num} aria-current={b.num===book.num?'true':undefined} onClick={()=>{onBook(b);setOpen(false);}} className="block w-full text-left rounded px-3 py-2 hover:bg-white/10 focus:bg-white/10" style={{color:mark.color}}><span className="font-semibold">{b.name}</span><span className="block text-[10px] opacity-80">{mark.label}</span></button>;})}</div>
    </div>}
  </div>;
}
