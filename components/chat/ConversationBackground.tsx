import React, { useEffect, useRef, useState } from 'react';
import { get, set, del } from 'idb-keyval';
import { Palette, X, ImagePlus } from 'lucide-react';
import { stripImageMetadata } from '../../services/exifService';

const THEMES = [
  ['Midnight', 'linear-gradient(145deg,#111827,#020617)'],
  ['Amber', 'radial-gradient(ellipse at top,#422006,#090604)'],
  ['Ocean', 'linear-gradient(145deg,#083344,#020617)'],
  ['Orchid', 'linear-gradient(145deg,#3b0764,#0c0414)'],
] as const;
type Background = { gradient?: string; photo?: Blob };

/** Personal, per-user/per-conversation preference. Photos never leave this device. */
export default function ConversationBackground({ roomId, userId }: { roomId: string; userId: string }) {
  const key = `plajah:chat:background:${userId}:${roomId}`;
  const [background, setBackground] = useState<Background | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const activeKey = useRef(key);
  activeKey.current = key;
  useEffect(() => {
    let live = true;
    setBackground(null); setOpen(false); setError('');
    get<Background>(key).then(value => { if (live) setBackground(value || null); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  useEffect(() => {
    if (!background?.photo) { setPhotoUrl(''); return; }
    const url = URL.createObjectURL(background.photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [background]);
  const save = async (value: Background | null) => {
    const target = key;
    setBusy(true); setError('');
    try {
      if (value) await set(target, value); else await del(target);
      if (activeKey.current === target) setBackground(value);
    } catch { setError('Could not save this background. Please try again.'); }
    finally { setBusy(false); }
  };
  return <>
    {background && <div aria-hidden="true" className="absolute inset-0 pointer-events-none -z-10" style={photoUrl ? { backgroundImage: `linear-gradient(#0009,#000b),url(${photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: background.gradient }} />}
    <div className="absolute right-4 bottom-24 z-30">
      <button onClick={() => setOpen(v => !v)} aria-label="Conversation background" aria-expanded={open} title="Conversation background" className="p-2 rounded-full border border-white/10 bg-black/70 text-white/60 hover:text-white"><Palette size={16} /></button>
      {open && <div className="absolute bottom-12 right-0 w-64 rounded-2xl bg-[#111119] border border-white/15 p-4 shadow-2xl text-white">
        <div className="flex justify-between mb-2"><span className="text-sm font-semibold">Chat background</span><button onClick={() => setOpen(false)} aria-label="Close backgrounds"><X size={16} /></button></div>
        <p className="text-xs text-white/50 mb-3">Personal to this chat, on this device.</p>
        <div className="grid grid-cols-2 gap-2">{THEMES.map(([label, gradient]) => <button key={label} disabled={busy} onClick={() => void save({ gradient })} className="rounded-xl border border-white/10 p-3 text-xs" style={{ background: gradient }}>{label}</button>)}</div>
        <button disabled={busy} onClick={() => input.current?.click()} className="mt-3 flex items-center gap-2 text-xs"><ImagePlus size={16} /> Choose photo</button>
        <button disabled={busy} onClick={() => void save(null)} className="mt-3 text-xs text-white/50">Reset background</button>
        {error && <p role="alert" className="text-xs text-red-300 mt-2">{error}</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP photo under 8 MB.'); return; }
          const target = key;
          try { const photo = await stripImageMetadata(file); if (activeKey.current === target) await save({ photo }); }
          catch { setError('This photo could not be opened.'); }
        }} />
      </div>}
    </div>
  </>;
}
