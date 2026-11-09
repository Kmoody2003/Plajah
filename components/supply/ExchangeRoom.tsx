// Maker Exchange: find suppliers and manufacturers (electronics, PCBs, machining, printing, fabric,
// plush and clothing), local maker shops near you, and post a request for quotes. Plajah connects
// people; payments go directly between them.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Store, ExternalLink, Send, ShieldAlert } from 'lucide-react';
import { SUPPLIERS, CATEGORY_LABEL, SHOP_CAPABILITIES, type Category } from '../../services/supply/directory';

const C = { bg: '#0c0d12', panel: '#12141b', line: 'rgba(255,255,255,.08)', dim: 'rgba(255,255,255,.55)', accent: '#fbbf24' };
type Tab = 'suppliers' | 'shops' | 'requests' | 'myshop';
const CONNECT: Record<string, string> = { api: 'Live API', upload: 'Upload files', link: 'Website' };

export default function ExchangeRoom({ onClose, getToken, apiBase = '', initialCategory, prefill }: { onClose: () => void; getToken?: () => Promise<string | null>; apiBase?: string; initialCategory?: Category; prefill?: { title?: string; processes?: string[]; details?: string; hazards?: string[] } }) {
  const [tab, setTab] = useState<Tab>(prefill ? 'requests' : 'suppliers');
  const [cat, setCat] = useState<Category | 'all'>(initialCategory ?? 'all');
  const [cap, setCap] = useState('');
  const [shops, setShops] = useState<any[] | null>(null); const [reqs, setReqs] = useState<any[] | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: prefill?.title ?? '', details: prefill?.details ?? '', processes: prefill?.processes ?? [] as string[], qty: 1, city: '', country: '' });
  const [shop, setShop] = useState({ name: '', about: '', city: '', region: '', country: '', capabilities: [] as string[], machines: '', materials: '', leadDays: 7, website: '', contact: '', shipping: false, safetyAck: false });
  const list = useMemo(() => SUPPLIERS.filter(s => cat === 'all' || s.categories.includes(cat)), [cat]);
  const api = async (path: string, init?: RequestInit, auth = false) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) { const t = getToken ? await getToken() : null; if (!t) throw new Error('Sign in to Plajah first.'); headers.Authorization = `Bearer ${t}`; }
    const r = await fetch(`${apiBase}/api/build${path}`, { ...init, headers });
    if (!/json/.test(r.headers.get('content-type') ?? '')) throw new Error('The Maker Exchange needs the Plajah server (not available here).');
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j;
  };
  useEffect(() => { if (tab === 'shops') api(`/shops${cap ? `?cap=${cap}` : ''}`).then(j => setShops(j.shops)).catch(e => { setShops([]); setMsg(String(e.message)); }); if (tab === 'requests') api(`/requests${cap ? `?cap=${cap}` : ''}`).then(j => setReqs(j.requests)).catch(e => { setReqs([]); setMsg(String(e.message)); }); }, [tab, cap]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  const post = async () => { setBusy(true); setMsg(''); try { await api('/requests', { method: 'POST', body: JSON.stringify({ ...form, hazards: prefill?.hazards ?? [] }) }, true); setMsg('Request posted. Shops with these capabilities can quote; you will read quotes here.'); setForm(f => ({ ...f, title: '', details: '' })); const j = await api('/requests'); setReqs(j.requests); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const saveShop = async () => { setBusy(true); setMsg(''); try { await api('/shops', { method: 'PUT', body: JSON.stringify(shop) }, true); setMsg('Your shop is listed.'); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const input = (v: string, on: (s: string) => void, ph: string, w = 'w-full') => <input value={v} onChange={e => on(e.target.value)} placeholder={ph} aria-label={ph} className={`${w} h-8 rounded-md bg-white/5 border border-white/10 px-2 text-[12px] text-white`}/>;
  const capChips = (sel: string[], on: (id: string) => void) => <div className="flex flex-wrap gap-1">{SHOP_CAPABILITIES.map(c => <button key={c.id} onClick={() => on(c.id)} className="text-[10.5px] px-2 py-0.5 rounded-full border" style={{ borderColor: sel.includes(c.id) ? C.accent : C.line, background: sel.includes(c.id) ? 'rgba(251,191,36,.12)' : 'transparent' }}>{c.label}</button>)}</div>;

  return createPortal(<div className="fixed inset-0 z-[250] flex flex-col" style={{ background: C.bg, color: '#e8eaf0', fontFamily: 'Inter, system-ui, sans-serif' }} data-testid="exchange-room">
    <div className="flex items-center gap-2 px-3 h-12 border-b shrink-0 overflow-x-auto" style={{ borderColor: C.line }}>
      <Store size={16} color={C.accent}/><span className="font-extrabold text-[13px] mr-2">Maker Exchange</span>
      {([['suppliers', 'Suppliers & manufacturers'], ['shops', 'Local makers'], ['requests', 'Requests for quotes'], ['myshop', 'List my shop']] as const).map(([k, l]) => <button key={k} onClick={() => { setTab(k); setMsg(''); }} className="h-8 px-3 rounded-lg text-[12px] font-semibold shrink-0" style={{ background: tab === k ? 'rgba(251,191,36,.14)' : 'transparent', color: tab === k ? C.accent : 'rgba(255,255,255,.75)' }} data-testid={`exchange-tab-${k}`}>{l}</button>)}
      <button className="ml-auto h-8 w-8 grid place-items-center rounded-lg bg-white/5" onClick={onClose} aria-label="Close" data-testid="exchange-close"><X size={15}/></button>
    </div>
    <div className="flex-1 overflow-y-auto p-4"><div className="max-w-5xl mx-auto">
      {msg && <div className="mb-3 text-[12px] px-3 py-2 rounded-lg" style={{ background: C.panel, border: `1px solid ${C.line}` }} data-testid="exchange-msg">{msg}</div>}
      {tab === 'suppliers' && <>
        <div className="flex flex-wrap gap-1.5 mb-3">{(['all', ...Object.keys(CATEGORY_LABEL)] as Array<Category | 'all'>).map(c => <button key={c} onClick={() => setCat(c)} className="text-[11.5px] px-2.5 py-1 rounded-full border" style={{ borderColor: cat === c ? C.accent : C.line, color: cat === c ? C.accent : undefined }} data-testid={`exchange-cat-${c}`}>{c === 'all' ? 'Everything' : CATEGORY_LABEL[c]}</button>)}</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{list.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="p-3 rounded-xl block" style={{ background: C.panel, border: `1px solid ${C.line}` }} data-testid={`supplier-${s.id}`}>
          <div className="flex items-center gap-2"><b className="text-[13px]">{s.name}</b><ExternalLink size={11} color={C.dim}/><span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded-full" style={{ background: s.connect === 'api' ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.06)', color: s.connect === 'api' ? '#4ade80' : C.dim }}>{CONNECT[s.connect]}</span></div>
          <div className="text-[11.5px] mt-1 leading-snug" style={{ color: 'rgba(255,255,255,.75)' }}>{s.about}</div>
          <div className="text-[10.5px] mt-1.5" style={{ color: C.dim }}>{s.categories.map(c => CATEGORY_LABEL[c]).join(' · ')} · ships {s.ships}{s.minOrder ? ` · min ${s.minOrder}` : ''}</div>
          {s.api && <div className="text-[10px] mt-0.5" style={{ color: C.dim }}>API: {s.api}</div>}
        </a>)}</div>
        <div className="text-[11px] mt-4 leading-relaxed" style={{ color: C.dim }}>Soft goods: print-on-demand APIs (Printful, Printify, Gooten, Contrado) take your artwork for pillows, throws, blankets and all-over-print clothing. Spoonflower prints your pattern on fabric by the yard, including minky for plush. For cut-and-sew clothing and custom plush, Sewport and Makeship take your tech pack or design and match you with manufacturers; local seamstresses list themselves under Local makers. Listings are not endorsements; check samples before ordering quantities.</div>
      </>}
      {(tab === 'shops' || tab === 'requests') && <div className="mb-3 flex items-center gap-2"><select value={cap} onChange={e => setCap(e.target.value)} className="h-8 rounded-md bg-white/5 border border-white/10 text-[12px] text-white" aria-label="Capability"><option value="" style={{ background: C.panel }}>Any capability</option>{SHOP_CAPABILITIES.map(c => <option key={c.id} value={c.id} style={{ background: C.panel }}>{c.label}</option>)}</select></div>}
      {tab === 'shops' && (shops === null ? <div style={{ color: C.dim }}>Loading…</div> : !shops.length ? <div style={{ color: C.dim }}>No maker shops listed for this yet. Run a machine, a sewing room or a workshop? List it.</div>
        : <div className="grid gap-2 sm:grid-cols-2">{shops.map(s => <div key={s.id} className="p-3 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.line}` }}><b>{s.name}</b><div className="text-[11px]" style={{ color: C.dim }}>{[s.city, s.region, s.country].filter(Boolean).join(', ')}{s.shipping ? ' · ships' : ''}{s.leadDays ? ` · ~${s.leadDays} days` : ''}</div>
          <div className="text-[11.5px] mt-1">{s.about}</div><div className="text-[10.5px] mt-1" style={{ color: C.dim }}>{(s.capabilities ?? []).map((c: string) => SHOP_CAPABILITIES.find(x => x.id === c)?.label ?? c).join(' · ')}</div>
          {s.machines && <div className="text-[10.5px]" style={{ color: C.dim }}>Machines: {s.machines}</div>}<div className="text-[11px] mt-1 flex gap-3">{s.website && <a href={s.website} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>Website</a>}{s.contact && <span>{s.contact}</span>}</div></div>)}</div>)}
      {tab === 'requests' && <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>{reqs === null ? <div style={{ color: C.dim }}>Loading…</div> : !reqs.length ? <div style={{ color: C.dim }}>No open requests.</div> : reqs.map(r => <div key={r.id} className="p-3 rounded-xl mb-2" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <b>{r.title}</b> <span className="text-[11px]" style={{ color: C.dim }}>· {r.qty} pcs{r.city ? ` · ${r.city}` : ''}</span><div className="text-[11.5px] mt-1 whitespace-pre-wrap">{r.details}</div>
          <div className="text-[10.5px] mt-1" style={{ color: C.dim }}>{(r.processes ?? []).map((c: string) => SHOP_CAPABILITIES.find(x => x.id === c)?.label ?? c).join(' · ')}</div>
          {r.hazards?.length ? <div className="text-[10.5px] mt-1 flex gap-1" style={{ color: '#fb923c' }}><ShieldAlert size={11} className="mt-0.5"/>Safety notes: {r.hazards.join('; ')}</div> : null}</div>)}</div>
        <div className="p-3 rounded-xl h-fit" style={{ background: C.panel, border: `1px solid ${C.line}` }} data-testid="exchange-post">
          <div className="font-bold mb-2">Post a request</div>
          <div className="space-y-1.5">{input(form.title, v => setForm(f => ({ ...f, title: v })), 'What do you need made?')}
            <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} rows={4} placeholder="Size, material, finish, deadline, links to your files…" aria-label="Details" className="w-full rounded-md bg-white/5 border border-white/10 p-2 text-[12px] text-white"/>
            <div className="flex gap-1.5"><input type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: +e.target.value }))} aria-label="Quantity" className="w-20 h-8 rounded-md bg-white/5 border border-white/10 px-2 text-[12px] text-white"/>{input(form.city, v => setForm(f => ({ ...f, city: v })), 'City', 'flex-1')}</div>
            <div className="text-[11px]" style={{ color: C.dim }}>Processes</div>{capChips(form.processes, id => setForm(f => ({ ...f, processes: toggle(f.processes, id) })))}
            {prefill?.hazards?.length ? <div className="text-[10.5px]" style={{ color: '#fb923c' }}>Your design's safety notes go with the request so makers can plan for them.</div> : null}
            <button className="w-full h-8 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1.5" style={{ background: C.accent, color: '#14110a' }} disabled={busy || !form.title || !form.processes.length} onClick={() => void post()}><Send size={13}/>Post request</button>
            <div className="text-[10px]" style={{ color: C.dim }}>Makers quote with their price, lead time and how to pay them directly. Plajah never holds payments.</div></div>
        </div></div>}
      {tab === 'myshop' && <div className="max-w-xl space-y-1.5" data-testid="exchange-myshop">
        <div className="text-[12px] mb-2" style={{ color: C.dim }}>Machine shops, makerspaces, seamstresses, plush makers and small factories: list what you can make and get requests that match.</div>
        {input(shop.name, v => setShop(s => ({ ...s, name: v })), 'Shop name')}
        <textarea value={shop.about} onChange={e => setShop(s => ({ ...s, about: e.target.value }))} rows={3} placeholder="What you make, minimums, specialities" aria-label="About" className="w-full rounded-md bg-white/5 border border-white/10 p-2 text-[12px] text-white"/>
        <div className="flex gap-1.5">{input(shop.city, v => setShop(s => ({ ...s, city: v })), 'City', 'flex-1')}{input(shop.region, v => setShop(s => ({ ...s, region: v })), 'State / region', 'flex-1')}{input(shop.country, v => setShop(s => ({ ...s, country: v })), 'Country', 'flex-1')}</div>
        <div className="text-[11px]" style={{ color: C.dim }}>Capabilities</div>{capChips(shop.capabilities, id => setShop(s => ({ ...s, capabilities: toggle(s.capabilities, id) })))}
        {input(shop.machines, v => setShop(s => ({ ...s, machines: v })), 'Machines (e.g. Prusa MK4 ×3, 60 W CO₂ laser, Juki DDL-8700)')}
        {input(shop.materials, v => setShop(s => ({ ...s, materials: v })), 'Materials you stock')}
        <div className="flex gap-1.5">{input(shop.website, v => setShop(s => ({ ...s, website: v })), 'https:// website', 'flex-1')}{input(shop.contact, v => setShop(s => ({ ...s, contact: v })), 'Public contact (email or phone)', 'flex-1')}</div>
        <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={shop.shipping} onChange={e => setShop(s => ({ ...s, shipping: e.target.checked }))}/>I ship</label>
        <label className="flex items-start gap-1.5 text-[12px]"><input type="checkbox" checked={shop.safetyAck} onChange={e => setShop(s => ({ ...s, safetyAck: e.target.checked }))} data-testid="exchange-shop-safety"/>I run my machines safely, follow the laws for my trade, and carry my own insurance. I will refuse jobs I cannot make safely.</label>
        <button className="h-8 px-4 rounded-lg font-bold text-[12px]" style={{ background: C.accent, color: '#14110a' }} disabled={busy || !shop.name || !shop.capabilities.length || !shop.safetyAck} onClick={() => void saveShop()}>Save listing</button>
      </div>}
    </div></div>
  </div>, document.body);
}
