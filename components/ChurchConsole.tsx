// ChurchConsole — Part 3, Phase 4: reach & learn.
//   Messages: broadcast to all members (in-app + push).
//   People:   Servant Keeper CSV import/export of congregants.
//   Classes:  spin up a church class on the EdTech stack.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Send, Loader2, Check, Users, GraduationCap, Upload, Download, Mail } from 'lucide-react';
import type { Organization } from '../types';
import {
  broadcastToChurch, importCongregantsCSV, fetchCongregants, exportCongregantsCSV, exportGivingCSV,
  createChurchClass, emailBroadcast, type Congregant,
} from '../services/churchConsoleService';

const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-small-orange/50 transition-all placeholder:text-white/25';
const dl = (name: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); };

const ChurchConsole: React.FC<{ church: Organization; onClose: () => void }> = ({ church, onClose }) => {
  const [tab, setTab] = useState<'messages' | 'people' | 'classes'>('messages');

  // Messages
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [emailNote, setEmailNote] = useState('');

  // People
  const [people, setPeople] = useState<Congregant[]>([]);
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedN, setImportedN] = useState<number | null>(null);
  const loadPeople = () => fetchCongregants(church.id).then(setPeople).catch(() => {});
  useEffect(() => { if (tab === 'people') loadPeople(); }, [tab]);

  // Classes
  const [clsTitle, setClsTitle] = useState('');
  const [clsDesc, setClsDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [classDone, setClassDone] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true); setSentCount(null); setEmailNote('');
    try {
      const n = await broadcastToChurch(church, { title: title.trim(), message: body.trim() });
      if (alsoEmail) {
        const emails = (await fetchCongregants(church.id)).map(c => c.email || '').filter(Boolean);
        const r = await emailBroadcast(title.trim() || church.name, body.trim(), emails);
        setEmailNote(r.configured ? `Emailed ${r.sent} congregant${r.sent === 1 ? '' : 's'}` : `Email not configured — set RESEND_API_KEY to send email (${emails.length} on file)`);
      }
      setSentCount(n); setTitle(''); setBody('');
    } catch { alert('Could not send.'); }
    setSending(false);
  };

  const doImport = async () => {
    if (!csv.trim()) return;
    setImporting(true); setImportedN(null);
    try { setImportedN(await importCongregantsCSV(church.id, csv)); setCsv(''); loadPeople(); }
    catch { alert('Import failed.'); }
    setImporting(false);
  };

  const createClass = async () => {
    if (!clsTitle.trim()) return;
    setCreating(true);
    try { await createChurchClass(church, { title: clsTitle.trim(), description: clsDesc.trim() }); setClassDone(true); setClsTitle(''); setClsDesc(''); }
    catch { alert('Could not create the class.'); }
    setCreating(false);
  };

  return (
    <div className="min-h-full p-6 lg:p-12 max-w-2xl mx-auto">
      <button onClick={onClose} className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-8"><ArrowLeft size={14} /> Back</button>

      <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-1">Church Console</h1>
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-8">{church.name} · reach & learn</p>

      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl w-fit mb-8">
        {([['messages', 'Messages', Mail], ['people', 'People', Users], ['classes', 'Classes', GraduationCap]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {tab === 'messages' && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/40">Push an announcement to every member — delivered in-app and as a push notification.</p>
          {sentCount !== null && <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-500/10 border border-green-500/25 text-green-400 text-[11px] font-black uppercase tracking-widest"><Check size={14} /> Sent to {sentCount} member{sentCount === 1 ? '' : 's'}{emailNote ? ` · ${emailNote}` : ''}</div>}
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Subject" className={field} />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Your message to the congregation…" className={`${field} resize-none`} />
          <button onClick={() => setAlsoEmail(v => !v)} className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${alsoEmail ? 'bg-small-orange/15 border-small-orange/40 text-small-orange' : 'bg-white/5 border-white/10 text-white/50'}`}>
            <Mail size={13} /> Also email congregants {alsoEmail && <Check size={13} />}
          </button>
          <button onClick={send} disabled={sending || !body.trim()} className="w-full py-3.5 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
            {sending ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <><Send size={16} /> Send to all members</>}
          </button>
          <p className="text-[9px] text-white/25">In-app + push reaches every member instantly. Email goes to congregants with an address on file (needs RESEND_API_KEY).</p>
        </div>
      )}

      {tab === 'people' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-white/40">{people.length} congregant{people.length === 1 ? '' : 's'} on file</p>
            <div className="flex gap-2">
              <button onClick={() => dl(`${church.name}-people.csv`, exportCongregantsCSV(people))} disabled={!people.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-30"><Download size={12} /> People CSV</button>
              <button onClick={async () => dl(`${church.name}-giving.csv`, await exportGivingCSV(church.id))} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white"><Download size={12} /> Giving CSV</button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><Upload size={12} className="text-small-orange" /> Import from Servant Keeper (CSV)</p>
            {importedN !== null && <p className="text-[10px] font-black uppercase tracking-widest text-green-400 flex items-center gap-1.5"><Check size={12} /> Imported {importedN} people</p>}
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white cursor-pointer w-fit">
              <Upload size={12} /> Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} />
            </label>
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={4} placeholder="…or paste CSV (Full Name, Email, Phone, Household)" className={`${field} resize-none font-mono text-[11px]`} />
            <button onClick={doImport} disabled={importing || !csv.trim()} className="w-full py-3 bg-small-orange text-black rounded-full font-black text-[11px] uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
              {importing ? <><Loader2 size={15} className="animate-spin" /> Importing…</> : <>Import congregants</>}
            </button>
          </div>

          {people.length > 0 && (
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
              {people.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10">
                  <div className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-[10px] font-black text-white/50 shrink-0">{p.name[0]}</div>
                  <div className="min-w-0 flex-1"><p className="text-xs font-bold text-white truncate">{p.name}</p>{(p.email || p.phone) && <p className="text-[9px] text-white/35 truncate">{[p.email, p.phone].filter(Boolean).join(' · ')}</p>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'classes' && (
        <div className="space-y-4">
          <p className="text-[11px] text-white/40">Create a class on the education stack — Sunday school, Bible study, discipleship — with lessons, assignments, and a learning record.</p>
          {classDone && <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-green-500/10 border border-green-500/25 text-green-400 text-[11px] font-black uppercase tracking-widest"><Check size={14} /> Class created — manage it in Classrooms</div>}
          <input value={clsTitle} onChange={e => setClsTitle(e.target.value)} placeholder="Class title (e.g. Foundations of Faith)" className={field} />
          <textarea value={clsDesc} onChange={e => setClsDesc(e.target.value)} rows={4} placeholder="What will this class cover?" className={`${field} resize-none`} />
          <button onClick={createClass} disabled={creating || !clsTitle.trim()} className="w-full py-3.5 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-30 flex items-center justify-center gap-2">
            {creating ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <><GraduationCap size={16} /> Create class</>}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChurchConsole;
