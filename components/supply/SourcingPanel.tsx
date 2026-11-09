// Where to buy every part on the schematic: grouped buy lines, live prices from DigiKey and Mouser
// when the server has keys, search links otherwise, and safety flags (authorised sellers only for
// mains parts, boards and batteries; obsolete or non-RoHS offers called out).

import React, { useState } from 'react';
import { ExternalLink, Search, ShieldAlert } from 'lucide-react';
import type { Circuit } from '../../services/elec/circuit';
import { sourceLines, offerWarnings, type Offer } from '../../services/supply/sourcing';

const DIM = 'rgba(255,255,255,.55)';
const links = (q: string) => [
  { name: 'DigiKey', url: `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(q)}` },
  { name: 'Mouser', url: `https://www.mouser.com/c/?q=${encodeURIComponent(q)}` },
  { name: 'LCSC', url: `https://www.lcsc.com/search?q=${encodeURIComponent(q)}` },
];

export default function SourcingPanel({ circuit, apiBase = '' }: { circuit: Circuit; apiBase?: string }) {
  const lines = sourceLines(circuit);
  const [offers, setOffers] = useState<Record<string, { offers: Offer[]; note?: string } | 'loading'>>({});
  const find = async (q: string) => {
    setOffers(o => ({ ...o, [q]: 'loading' }));
    try { const r = await fetch(`${apiBase}/api/build/supply/search?q=${encodeURIComponent(q)}`); if (!/json/.test(r.headers.get('content-type') ?? '')) throw new Error('no server'); const j = await r.json();
      const note = !j.configured?.digikey && !j.configured?.mouser ? 'Live prices need DigiKey or Mouser keys on the server; use the search links.' : j.errors?.length ? j.errors.join('; ') : undefined;
      setOffers(o => ({ ...o, [q]: { offers: j.offers ?? [], note } })); }
    catch { setOffers(o => ({ ...o, [q]: { offers: [], note: 'Price lookup needs the Plajah server; use the search links.' } })); }
  };
  return <div data-testid="supply-sourcing" className="text-[12px]">
    {lines.map(l => { const o = offers[l.query]; return <div key={l.query} className="p-2 rounded-lg mb-1.5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
      <div className="flex items-start gap-2"><b className="tabular-nums">{l.qty}×</b><div className="flex-1 min-w-0"><div className="font-semibold">{l.part} <span className="font-normal" style={{ color: DIM }}>{l.refs.join(', ')}</span></div><div className="text-[10.5px] truncate" style={{ color: DIM }}>{l.query}</div></div>
        <button className="elec-btn" onClick={() => void find(l.query)} title="Live price and stock" style={{ height: 24, padding: '0 6px' }}><Search size={11}/></button></div>
      {l.note && <div className="text-[10.5px] mt-1 flex gap-1" style={{ color: '#fbbf24' }}><ShieldAlert size={11} className="mt-0.5 shrink-0"/>{l.note}</div>}
      {l.authorised && !l.note && <div className="text-[10.5px] mt-1" style={{ color: '#fbbf24' }}>Buy from an authorised distributor or approved reseller.</div>}
      <div className="flex gap-2 mt-1">{links(l.query).map(x => <a key={x.name} href={x.url} target="_blank" rel="noreferrer" className="text-[10.5px] inline-flex items-center gap-0.5" style={{ color: '#93c5fd' }}>{x.name}<ExternalLink size={9}/></a>)}</div>
      {o === 'loading' && <div className="text-[10.5px] mt-1" style={{ color: DIM }}>Looking up…</div>}
      {o && o !== 'loading' && <>
        {o.note && <div className="text-[10.5px] mt-1" style={{ color: DIM }}>{o.note}</div>}
        {o.offers.slice(0, 4).map(f => <a key={`${f.supplier}${f.mpn}`} href={f.url} target="_blank" rel="noreferrer" className="block mt-1 p-1.5 rounded" style={{ background: 'rgba(255,255,255,.04)' }}>
          <div className="flex gap-2 text-[11px]"><b>{f.mpn}</b><span style={{ color: DIM }}>{f.maker}</span><span className="ml-auto tabular-nums">{f.price != null ? `${f.currency === 'USD' ? '$' : ''}${f.price.toFixed(2)}` : '—'}</span></div>
          <div className="text-[10px]" style={{ color: DIM }}>{f.supplier === 'digikey' ? 'DigiKey' : 'Mouser'} · {f.stock.toLocaleString()} in stock{f.lifecycle ? ` · ${f.lifecycle}` : ''}</div>
          {offerWarnings(f).map(w => <div key={w} className="text-[10px]" style={{ color: '#fb923c' }}>{w}</div>)}
        </a>)}
      </>}
    </div>; })}
    <div className="text-[10px] mt-1" style={{ color: DIM }}>Plajah takes no cut and holds no money: you buy directly from the supplier.</div>
  </div>;
}
