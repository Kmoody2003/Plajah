// FilmVersionsManager — add/manage alternate cuts of a film (extended, director's,
// unrated, …). Optional: the main film is the primary version; these are extra
// selectable cuts. Can be added now or anytime later by re-opening the project.

import React, { useState } from 'react';
import { Plus, Trash2, Film, UploadCloud, Loader2 } from 'lucide-react';
import type { FilmVersion } from '../types';

const VERSION_TYPES: { id: FilmVersion['type']; label: string }[] = [
  { id: 'EXTENDED', label: 'Extended Cut' },
  { id: 'DIRECTORS', label: "Director's Cut" },
  { id: 'THEATRICAL', label: 'Theatrical' },
  { id: 'UNRATED', label: 'Unrated' },
  { id: 'ALTERNATE', label: 'Alternate Ending' },
  { id: 'OTHER', label: 'Other' },
];

const uid = () => `ver_${Math.random().toString(36).slice(2, 9)}`;

const FilmVersionsManager: React.FC<{
  value: FilmVersion[];
  onChange: (v: FilmVersion[]) => void;
  onUpload: (file: File, type: string) => Promise<string>;
}> = ({ value, onChange, onUpload }) => {
  const [type, setType] = useState<FilmVersion['type']>('EXTENDED');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const addFromFile = async (file: File) => {
    setBusy(true);
    try {
      const url = await onUpload(file, 'VIDEO');
      onChange([...value, { id: uid(), label: label.trim() || VERSION_TYPES.find(t => t.id === type)!.label, type, url }]);
      setLabel('');
    } catch { /* */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Film size={14} className="text-small-orange" />
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Alternate versions</h4>
        <span className="text-[9px] text-white/30">· optional — extended / director's cuts</span>
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map(v => (
            <div key={v.id} className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-small-orange shrink-0">{VERSION_TYPES.find(t => t.id === v.type)?.label || v.type}</span>
              <input value={v.label} onChange={e => onChange(value.map(x => x.id === v.id ? { ...x, label: e.target.value } : x))}
                className="flex-1 min-w-0 bg-transparent text-white text-[12px] font-bold outline-none" placeholder="Label" />
              <span className="text-[9px] text-white/30 shrink-0">{v.url ? 'file set' : 'no file'}</span>
              <button type="button" onClick={() => onChange(value.filter(x => x.id !== v.id))} className="text-white/20 hover:text-red-500 transition-colors shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-2.5">
        <select value={type} onChange={e => setType(e.target.value as FilmVersion['type'])}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] font-bold text-white outline-none">
          {VERSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)"
          className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none placeholder:text-white/20" />
        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${busy ? 'bg-white/5 text-white/30' : 'bg-small-orange text-white hover:brightness-110'}`}>
          {busy ? <><Loader2 size={13} className="animate-spin" /> Uploading</> : <><UploadCloud size={13} /> Add cut</>}
          <input type="file" className="hidden" accept="video/*" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) addFromFile(f); }} />
        </label>
      </div>
    </div>
  );
};

export default FilmVersionsManager;
