// BagTagsPanel - bag tags (print Code 128 + QR labels), rack/shelf location, missing-bag flag.
import React, { useState } from 'react';
import { cleanRack, makeTagCodes, suggestRack, tagLabels, tagRows } from '../../../services/laundryCore';
import { printHtml, rackLabelHtml, tagSheetHtml, type TagLayout } from '../../../services/laundryPrint';
import { Section, useRun, Err, Ok, inp, pill, type PanelProps } from './shared';

export default function BagTagsPanel({ api, ticket: t, apply, closed }: PanelProps) {
  const { busy, err, setErr, run } = useRun();
  const [msg, setMsg] = useState('');
  const [rack, setRack] = useState(String(t.subject.rack || ''));
  const rows = tagRows(t.subject);
  const bags = Number(t.subject.bags) || rows.length || 0;
  const due = t.subject.due_at ? new Date(String(t.subject.due_at)).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  const print = (layout: TagLayout, only?: string[]) => {
    const codes = rows.map(r => r.code).filter(c => !only || only.includes(c)); if (!codes.length) return setErr('Make tags first.');
    const all = tagLabels(t, rows.map(r => r.code), due).filter(l => codes.includes(l.code));
    if (!printHtml(tagSheetHtml(all, layout))) setErr('The browser blocked the print window. Allow pop-ups and try again.'); else setMsg('Sent to the printer.');
  };
  const makeTags = () => run(() => api.update(t.id, { subject: { tags: makeTagCodes(t.number, bags || 1), bags: bags || 1 } }), apply);
  const saveRack = (v: string) => run(() => api.update(t.id, { subject: { rack: cleanRack(v) } }), nt => { apply(nt); setRack(cleanRack(v)); });
  const suggest = async () => { try { const all = await api.list(); setRack(suggestRack(all.filter(x => x.id !== t.id && !['picked_up', 'cancelled'].includes(x.stage)))); } catch { setErr('Could not look up free racks.'); } };
  const flagMissing = (code: string, missing: boolean) => {
    const cur = new Set(rows.filter(r => r.state === 'MISSING').map(r => r.code)); if (missing) cur.add(code); else cur.delete(code);
    return run(() => api.update(t.id, { subject: { missing_tags: [...cur] }, ...(missing ? { note: { text: `Bag ${code} reported missing`, internal: true } } : {}) }), apply);
  };

  return (
    <Section title="Bag tags & rack" right={<div className="flex gap-1.5">
      {!rows.length ? <button disabled={busy || closed} onClick={makeTags} className={pill}>Make {bags || 1} tag{(bags || 1) === 1 ? '' : 's'}</button>
        : <><button onClick={() => print('label')} className={pill}>Print labels</button><button onClick={() => print('sheet')} className={pill}>Print sheet</button></>}
    </div>}>
      <Err text={err} /><Ok text={msg} />
      {rows.length === 0 && <div className="text-xs text-white/40">Each bag gets its own scannable code ({t.number}-1, {t.number}-2 ...). Scan any tag at any stage on the Laundry desk to open this ticket.</div>}
      <div className="space-y-1">{rows.map(r => (
        <div key={r.code} className="flex items-center gap-2 text-sm rounded-lg bg-white/5 px-2.5 py-1.5">
          <b className="font-mono text-xs">{r.code}</b>
          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${r.state === 'MISSING' ? 'bg-[#D40055]/25 text-[#ff7aa8]' : r.state === 'PICKED_UP' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{r.state === 'IN_STORE' ? 'in store' : r.state === 'PICKED_UP' ? 'picked up' : 'missing'}</span>
          <span className="ml-auto flex gap-1">
            <button onClick={() => print('label', [r.code])} className="text-[10px] font-bold text-white/50 hover:text-white">reprint</button>
            {r.state !== 'PICKED_UP' && <button disabled={busy} onClick={() => flagMissing(r.code, r.state !== 'MISSING')} className="text-[10px] font-bold text-white/50 hover:text-[#ff7aa8]">{r.state === 'MISSING' ? 'found it' : 'missing?'}</button>}
          </span>
        </div>))}</div>
      <div className="flex gap-2 items-center pt-1">
        <input value={rack} onChange={e => setRack(cleanRack(e.target.value))} placeholder="Rack / shelf (e.g. R12)" aria-label="Rack or shelf" className={inp} />
        <button onClick={suggest} className={pill}>Free</button>
        <button disabled={busy || rack === String(t.subject.rack || '')} onClick={() => saveRack(rack)} className={pill}>Save</button>
        {t.subject.rack ? <button onClick={() => printHtml(rackLabelHtml(String(t.subject.rack), t.number, t.customer.name))} className={pill}>Label</button> : null}
      </div>
    </Section>
  );
}
