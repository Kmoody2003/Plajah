// The device browser — Bitwig's "+ device" pop-up browser, in Chora's language.
//
// A full overlay (portaled to <body>, so no parent panel can clip it) with three columns:
// categories (plus Recent and Airwindows' own folds) · the device list · a detail pane with the
// device's controls and factory presets. Type to search from the moment it opens; ↑/↓ move,
// Enter adds, Esc closes, double-click adds. `insertAt` is the slot the caller opened it from,
// so a device lands exactly where the "+" was pressed in the chain.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Clock, Star, Plus } from 'lucide-react';
import { DEVICES, type FxCategory, type FxDescriptor } from '../../../../services/melos/beats/fx/devices';
import { presetsForFx } from '../../../../services/melos/beats/fx/presets';

export const CAT_LABEL: Record<FxCategory, string> = {
  eq: 'EQ', dynamics: 'Dynamics', saturation: 'Saturation', stereo: 'Stereo', space: 'Space', mod: 'Modulation', dj: 'DJ / Performance', repair: 'Repair', utility: 'Utility', amp: 'Amps & Rigs', airwindows: 'Airwindows',
};
export const CAT_ORDER: FxCategory[] = ['eq', 'dynamics', 'saturation', 'space', 'mod', 'stereo', 'dj', 'amp', 'repair', 'utility', 'airwindows'];

type Cat = FxCategory | 'all' | 'recent';

const RECENT_KEY = 'chora.deviceBrowser.recent';
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]; } catch { return []; } };
const pushRecent = (type: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([type, ...readRecent().filter((t) => t !== type)].slice(0, 16))); } catch { /* private mode */ }
};

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (type: string) => void;
  /** Shown in the header ("Insert into Bass · slot 3"). */
  context?: string;
}

export const DeviceBrowser: React.FC<Props> = ({ open, onClose, onPick, context }) => {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  const [fold, setFold] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => { if (open) { setQuery(''); setCursor(0); setRecent(readRecent()); } }, [open]);

  const counts = useMemo(() => {
    const m = new Map<FxCategory, number>();
    for (const d of DEVICES) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, []);

  const awFolds = useMemo(() => {
    const folds = new Map<string, number>();
    for (const d of DEVICES) if (d.category === 'airwindows') folds.set(d.subgroup ?? 'Other', (folds.get(d.subgroup ?? 'Other') ?? 0) + 1);
    return [['Recommended', DEVICES.filter((d) => d.category === 'airwindows' && d.recommended).length] as [string, number], ...[...folds].sort((a, b) => a[0].localeCompare(b[0]))];
  }, []);

  const list: FxDescriptor[] = useMemo(() => {
    const match = (d: FxDescriptor) => !q || d.label.toLowerCase().includes(q) || d.blurb.toLowerCase().includes(q) || !!d.subgroup?.toLowerCase().includes(q) || CAT_LABEL[d.category].toLowerCase().includes(q);
    if (q) {
      // Search spans everything; Chora's own devices rank above the 500 Airwindows.
      const hits = DEVICES.filter(match);
      const rank = (d: FxDescriptor) => (d.label.toLowerCase().startsWith(q) ? 0 : d.label.toLowerCase().includes(q) ? 1 : 2) + (d.category === 'airwindows' ? 3 : 0);
      return hits.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)).slice(0, 300);
    }
    if (cat === 'recent') return recent.map((t) => DEVICES.find((d) => d.type === t)).filter((d): d is FxDescriptor => !!d);
    if (cat === 'all') return CAT_ORDER.filter((c) => c !== 'airwindows').flatMap((c) => DEVICES.filter((d) => d.category === c));
    if (cat === 'airwindows') {
      const f = fold ?? 'Recommended';
      return DEVICES.filter((d) => d.category === 'airwindows' && (f === 'Recommended' ? d.recommended : (d.subgroup ?? 'Other') === f));
    }
    return DEVICES.filter((d) => d.category === cat);
  }, [q, cat, fold, recent]);

  const cur = list[Math.min(cursor, list.length - 1)];
  useEffect(() => { setCursor(0); }, [q, cat, fold]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const pick = (d: FxDescriptor | undefined) => {
    if (!d) return;
    pushRecent(d.type);
    onPick(d.type);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(list.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(cur); }
  };

  const catBtn = (id: Cat, label: string, n?: number, color?: string, icon?: React.ReactNode) => {
    const on = !q && cat === id;
    return (
      <button
        key={id}
        onClick={() => { setCat(id); setQuery(''); if (id === 'airwindows') setFold('Recommended'); }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11.5px] font-semibold transition-colors"
        style={on ? { background: 'rgba(255,255,255,0.09)', color: '#fff' } : { color: 'rgba(255,255,255,0.6)' }}
      >
        {icon ?? <span className="w-2 h-2 rounded-full flex-none" style={{ background: color ?? 'rgba(255,255,255,0.3)' }} />}
        <span className="flex-1 truncate">{label}</span>
        {n !== undefined && <span className="text-[9.5px] text-white/30 font-mono">{n}</span>}
      </button>
    );
  };
  const catColor = (c: FxCategory) => DEVICES.find((d) => d.category === c)?.color;
  const presets = cur ? presetsForFx(cur.type) : [];

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="w-[min(980px,100%)] h-[min(620px,100%)] flex flex-col rounded-[16px] border border-white/15 bg-[#110e18] shadow-[0_30px_90px_rgba(0,0,0,0.7)] overflow-hidden"
        onKeyDown={onKey}
        role="dialog"
        aria-label="Add device"
      >
        {/* header: search first — typing is the fastest path */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 flex-none">
          <Search size={16} className="text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search devices — eq, comp, reverb, tape, vocoder…"
            aria-label="Search devices"
            className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none"
          />
          {context && <span className="text-[10.5px] text-white/35 hidden sm:inline">{context}</span>}
          <span className="text-[9.5px] text-white/25 hidden md:inline font-mono">↑↓ · Enter · Esc</span>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg text-white/40 hover:text-white hover:bg-white/10" aria-label="Close"><X size={15} /></button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* categories */}
          <div className="w-[190px] flex-none border-r border-white/10 overflow-y-auto p-2 hidden sm:block">
            {catBtn('recent', 'Recent', recent.length, undefined, <Clock size={11} className="text-white/45 flex-none" />)}
            {catBtn('all', 'All Chora devices', DEVICES.filter((d) => d.category !== 'airwindows').length, undefined, <Star size={11} className="text-[#D0BCFF] flex-none" />)}
            <div className="h-px bg-white/[0.07] my-1.5" />
            {CAT_ORDER.map((c) => catBtn(c, CAT_LABEL[c], counts.get(c) ?? 0, catColor(c)))}
            {cat === 'airwindows' && !q && (
              <div className="mt-1 ml-3 pl-2 border-l border-white/10">
                {awFolds.map(([name, n]) => (
                  <button key={name} onClick={() => setFold(name)} className="w-full flex items-center justify-between px-2 py-1 rounded-md text-[10.5px]"
                    style={(fold ?? 'Recommended') === name ? { color: '#fff', background: 'rgba(255,255,255,0.07)' } : { color: 'rgba(255,255,255,0.5)' }}>
                    <span className="truncate">{name}</span><span className="font-mono text-[9px] text-white/30">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* device list */}
          <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto p-2">
            {list.length === 0 && (
              <div className="h-full grid place-items-center text-[12px] text-white/30">
                {cat === 'recent' && !q ? 'Devices you add show up here.' : 'Nothing matches — try another word.'}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {list.map((d, i) => {
                const on = i === cursor;
                return (
                  <button
                    key={d.type}
                    data-idx={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => setCursor(i)}
                    onDoubleClick={() => pick(d)}
                    className="text-left px-3 py-2 rounded-[10px] border flex items-start gap-2.5 transition-colors"
                    style={on ? { borderColor: `${d.color}88`, background: `${d.color}14` } : { borderColor: 'transparent' }}
                  >
                    <span className="mt-1 w-2 h-2 rounded-full flex-none" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-bold text-white truncate">{d.label}</span>
                      <span className="block text-[10px] text-white/45 line-clamp-2">{d.blurb}</span>
                    </span>
                    <span className="text-[8.5px] uppercase tracking-[0.12em] text-white/25 flex-none mt-0.5">{d.category === 'airwindows' ? d.subgroup ?? 'AW' : CAT_LABEL[d.category]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* detail */}
          <div className="w-[260px] flex-none border-l border-white/10 p-4 overflow-y-auto hidden lg:flex flex-col">
            {cur ? (
              <>
                <span className="text-[9px] uppercase tracking-[0.18em] font-extrabold" style={{ color: cur.color }}>{CAT_LABEL[cur.category]}{cur.subgroup ? ` · ${cur.subgroup}` : ''}</span>
                <h3 className="text-[18px] font-extrabold text-white mt-1 leading-tight">{cur.label}</h3>
                <p className="text-[11px] text-white/55 mt-1.5">{cur.blurb}</p>
                <button
                  onClick={() => pick(cur)}
                  className="mt-3 h-9 rounded-[10px] text-[12px] font-bold flex items-center justify-center gap-1.5 text-black"
                  style={{ background: cur.color }}
                ><Plus size={14} /> Add {cur.label}</button>
                {cur.params.length > 0 && (
                  <div className="mt-4">
                    <span className="text-[9px] uppercase tracking-[0.16em] font-extrabold text-white/30">Controls</span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {cur.params.slice(0, 18).map((p) => <span key={p.key} className="text-[9.5px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/60">{p.label}</span>)}
                      {cur.params.length > 18 && <span className="text-[9.5px] text-white/30">+{cur.params.length - 18}</span>}
                    </div>
                  </div>
                )}
                {presets.length > 0 && (
                  <div className="mt-4">
                    <span className="text-[9px] uppercase tracking-[0.16em] font-extrabold text-white/30">Factory presets · {presets.length}</span>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {presets.slice(0, 10).map((p) => <span key={p.id} className="text-[10.5px] text-white/60 truncate" title={p.description}>{p.name}</span>)}
                    </div>
                  </div>
                )}
              </>
            ) : <span className="text-[11px] text-white/30">Pick a device to see what it does.</span>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
