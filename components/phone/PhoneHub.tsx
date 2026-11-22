// components/phone/PhoneHub.tsx — Plajah as the phone: Keypad · Recents · Contacts · Messages,
// plus the in-call screen for carrier calls (PlajahInCallService) and a contact editor.
// Android only for the carrier side; Plajah calls/DMs work wherever the user is signed in.
//
// Reached as view PHONE_HUB (?view=phone) — the OS opens it for dial / sms: intents and call
// notifications (android/.../telecom/PhoneIntents.kt).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Ban, Bluetooth, ChevronLeft, Delete, Grid3x3, Headphones, History,
  Mail, MessageSquare, MessageSquareText, Mic, MicOff, Pause, Pencil, Phone, PhoneMissed, PhoneOff,
  Plus, Search, Shield, Smartphone, Star, Trash2, UserPlus, Users, Video, Volume2, X, Merge, Repeat,
} from 'lucide-react';
import { useCall } from '../../contexts/CallContext';
import { cleanDial, displayPhone, formatPhone, keypadMatches } from '../../services/phone/phoneNumber';
import type { MergedPerson } from '../../services/phone/contactsMerge';
import {
  becomeDefault, onTelecom, requestTelecomPermissions, telecom,
  type AudioRoute, type CallLogEntry, type CallsSnapshot, type ContactInput, type LiveCall, type PhoneLaunch,
} from '../../services/phone/telecom';
import { usePhoneBook } from './usePhoneBook';
import { PersonAvatar, SmsConversation, SmsThreadRow, timeLabel } from './SmsViews';
import { RcsConversation, RcsSetupCard, RcsThreadRow } from './RcsViews';
import type { RcsThread, SmsThread } from '../../services/phone/telecom';

type Tab = 'KEYPAD' | 'RECENTS' | 'CONTACTS' | 'MESSAGES';

interface PhoneHubProps {
  onBack?: () => void;
  /** Open a Plajah chat room in the Chat view. */
  onOpenChat?: (roomId: string) => void;
}

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

// ─── In-call screen ───────────────────────────────────────────────────────────
const KEYS: [string, string][] = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];

const KeyGrid: React.FC<{ onKey: (k: string) => void; onLong0?: () => void; compact?: boolean }> = ({ onKey, onLong0, compact }) => (
  <div className="grid grid-cols-3 gap-x-6 gap-y-3 mx-auto" style={{ maxWidth: 300 }}>
    {KEYS.map(([k, letters]) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (
        <button
          key={k}
          onPointerDown={() => { if (k === '0' && onLong0) timer = setTimeout(() => { timer = null; onLong0(); }, 550); }}
          onPointerUp={() => { if (k === '0' && onLong0) { if (timer) { clearTimeout(timer); timer = null; onKey(k); } } else onKey(k); }}
          onPointerLeave={() => { if (timer) { clearTimeout(timer); timer = null; } }}
          className={`${compact ? 'w-14 h-14' : 'w-[72px] h-[72px]'} justify-self-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/20 transition-colors flex flex-col items-center justify-center select-none`}
        >
          <span className="text-2xl font-light text-white leading-none">{k}</span>
          {letters && <span className="text-[9px] tracking-[0.2em] text-white/35 font-bold mt-0.5">{letters}</span>}
        </button>
      );
    })}
  </div>
);

const InCallScreen: React.FC<{ snap: CallsSnapshot; lookup: (n: string) => MergedPerson | undefined; onMinimize: () => void }> = ({ snap, lookup, onMinimize }) => {
  const [now, setNow] = useState(Date.now());
  const [showKeys, setShowKeys] = useState(false);
  const [dtmfTyped, setDtmfTyped] = useState('');
  const [showReplies, setShowReplies] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const live = snap.calls.filter(c => c.state !== 'disconnected');
  const ringing = live.find(c => c.state === 'ringing');
  const primary = ringing || live.find(c => c.state === 'active') || live.find(c => c.state === 'dialing' || c.state === 'connecting') || live[0];
  const others = live.filter(c => c !== primary);
  if (!primary) return null;

  const person = lookup(primary.number);
  const name = person?.name || primary.name || formatPhone(primary.number) || 'Unknown';
  const statusLine = primary.state === 'active' && primary.connectedAt ? fmtDuration(Math.floor((now - primary.connectedAt) / 1000))
    : primary.state === 'ringing' ? 'Incoming call'
    : primary.state === 'holding' ? 'On hold'
    : primary.state === 'dialing' || primary.state === 'connecting' ? 'Calling…'
    : primary.state;

  const routes = snap.routes || [];
  const route: AudioRoute = snap.route || 'earpiece';
  const nextRoute = (): AudioRoute => {
    const order: AudioRoute[] = ['earpiece', 'speaker', 'bluetooth', 'wired'].filter(r => routes.includes(r as AudioRoute)) as AudioRoute[];
    if (!order.length) return route === 'speaker' ? 'earpiece' : 'speaker';
    return order[(order.indexOf(route) + 1) % order.length];
  };
  const RouteIcon = route === 'speaker' ? Volume2 : route === 'bluetooth' ? Bluetooth : route === 'wired' ? Headphones : Smartphone;

  const quickReplies = ["Can't talk now. What's up?", "I'll call you right back.", "I'll call you later.", "Can't talk now. Text me?"];

  const CtlBtn: React.FC<{ on?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ on, label, onClick, children, disabled }) => (
    <button disabled={disabled} onClick={onClick} className="flex flex-col items-center gap-1.5 disabled:opacity-30">
      <span className={`w-16 h-16 rounded-full grid place-items-center transition-colors ${on ? 'bg-white text-black' : 'bg-white/[0.08] text-white hover:bg-white/15'}`}>{children}</span>
      <span className="text-[10px] text-white/50 font-bold">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[400] flex flex-col bg-gradient-to-b from-[#0d1512] via-[#07090a] to-black text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-between px-4 pt-3">
        <button onClick={onMinimize} className="p-2 text-white/50 hover:text-white rounded-xl" title="Back to Plajah"><ChevronLeft size={20} /></button>
        <span className="text-[9px] uppercase tracking-[0.3em] font-black text-white/30 flex items-center gap-1.5"><Phone size={10} /> Plajah Phone</span>
        <span className="w-9" />
      </div>

      {others.length > 0 && (
        <div className="mx-4 mt-3 space-y-2">
          {others.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/[0.05] border border-white/[0.06]">
              <Pause size={13} className="text-white/40" />
              <span className="text-sm font-semibold truncate flex-1">{lookup(c.number)?.name || c.name || formatPhone(c.number)}</span>
              <span className="text-[10px] text-white/40 uppercase font-black">{c.state === 'holding' ? 'On hold' : c.state}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 min-h-0">
        {!showKeys && <PersonAvatar name={name} photoUrl={person?.photoUrl} size={112} plajah={!!person?.plajah} />}
        <div className="text-3xl font-light text-center leading-tight">{name}</div>
        {person && primary.number && <div className="text-sm text-white/40">{formatPhone(primary.number)}</div>}
        <div className={`text-sm font-semibold ${primary.state === 'active' ? 'text-emerald-300' : 'text-white/50'}`}>{statusLine}</div>
        {showKeys && (
          <div className="w-full mt-4">
            <div className="text-center text-2xl tracking-widest h-9 text-white/80">{dtmfTyped}</div>
            <KeyGrid compact onKey={k => { setDtmfTyped(t => (t + k).slice(-24)); telecom.dtmf(k, primary.id); }} />
          </div>
        )}
      </div>

      {ringing ? (
        <div className="pb-10 px-8">
          {showReplies ? (
            <div className="space-y-2 mb-6">
              {quickReplies.map(r => (
                <button key={r} onClick={() => telecom.reject(ringing.id, r)} className="w-full text-left px-4 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] text-sm">{r}</button>
              ))}
              <button onClick={() => setShowReplies(false)} className="w-full py-2 text-xs text-white/40">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowReplies(true)} className="mx-auto mb-8 flex items-center gap-2 text-xs text-white/50 hover:text-white"><MessageSquare size={14} /> Reply with a text</button>
          )}
          <div className="flex items-center justify-around">
            <button onClick={() => telecom.reject(ringing.id)} className="flex flex-col items-center gap-2">
              <span className="w-[72px] h-[72px] rounded-full bg-red-500 grid place-items-center shadow-[0_0_40px_rgba(239,68,68,0.35)]"><PhoneOff size={28} /></span>
              <span className="text-xs text-white/60 font-bold">Decline</span>
            </button>
            <button onClick={() => telecom.answer(ringing.id)} className="flex flex-col items-center gap-2">
              <span className="w-[72px] h-[72px] rounded-full bg-emerald-500 grid place-items-center animate-pulse shadow-[0_0_40px_rgba(16,185,129,0.45)]"><Phone size={28} /></span>
              <span className="text-xs text-white/60 font-bold">Answer</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="pb-8 px-6">
          <div className="grid grid-cols-3 gap-y-5 justify-items-center mb-8 mx-auto" style={{ maxWidth: 320 }}>
            <CtlBtn on={snap.muted} label={snap.muted ? 'Unmute' : 'Mute'} onClick={() => telecom.setMuted(!snap.muted)}>{snap.muted ? <MicOff size={24} /> : <Mic size={24} />}</CtlBtn>
            <CtlBtn on={showKeys} label="Keypad" onClick={() => setShowKeys(s => !s)}><Grid3x3 size={24} /></CtlBtn>
            <CtlBtn on={route !== 'earpiece'} label={route === 'earpiece' ? 'Speaker' : route[0].toUpperCase() + route.slice(1)} onClick={() => telecom.setAudioRoute(nextRoute())}><RouteIcon size={24} /></CtlBtn>
            <CtlBtn on={primary.state === 'holding'} disabled={!primary.canHold} label={primary.state === 'holding' ? 'Resume' : 'Hold'} onClick={() => telecom.hold(primary.id, primary.state !== 'holding')}><Pause size={24} /></CtlBtn>
            {others.length > 0
              ? <CtlBtn label="Swap" onClick={() => telecom.hold(others[0].id, false)}><Repeat size={24} /></CtlBtn>
              : <CtlBtn label="Add call" onClick={onMinimize}><Plus size={24} /></CtlBtn>}
            <CtlBtn disabled={!primary.canMerge && others.length === 0} label="Merge" onClick={() => telecom.merge(primary.id)}><Merge size={24} /></CtlBtn>
          </div>
          <button onClick={() => telecom.hangup(primary.id)} className="mx-auto w-[72px] h-[72px] rounded-full bg-red-500 grid place-items-center shadow-[0_0_40px_rgba(239,68,68,0.35)]">
            <PhoneOff size={28} />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Contact editor ───────────────────────────────────────────────────────────
const ContactEditor: React.FC<{ initial?: MergedPerson; presetNumber?: string; onClose: () => void; onSaved: () => void }> = ({ initial, presetNumber, onClose, onSaved }) => {
  const d = initial?.device;
  const [given, setGiven] = useState(d?.givenName || (d ? d.displayName : initial?.name) || '');
  const [family, setFamily] = useState(d?.familyName || '');
  const [org, setOrg] = useState(d?.organization || '');
  const [starred, setStarred] = useState(!!d?.starred);
  const [phones, setPhones] = useState<{ number: string; label: string }[]>(
    d?.phones.length ? d.phones.map(p => ({ number: p.number, label: p.label || 'Mobile' })) : [{ number: presetNumber || initial?.phones[0] || '', label: 'Mobile' }]);
  const [emails, setEmails] = useState<{ address: string; label: string }[]>(
    d?.emails.length ? d.emails.map(e => ({ address: e.address, label: e.label || 'Home' })) : initial?.emails.length ? initial.emails.map(address => ({ address, label: 'Home' })) : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!given.trim() && !family.trim() && !phones.some(p => p.number.trim())) { setErr('Add a name or a number'); return; }
    setBusy(true); setErr(null);
    try {
      const input: ContactInput = { id: d?.id, givenName: given.trim(), familyName: family.trim(), organization: org.trim(), starred, phones, emails };
      await telecom.saveContact(input);
      onSaved();
    } catch (e: any) { setErr(e?.message || 'Could not save'); setBusy(false); }
  };

  const remove = async () => {
    if (!d || !confirm(`Delete ${initial?.name || 'this contact'} from this phone?`)) return;
    await telecom.deleteContact(d.id);
    onSaved();
  };

  const field = 'w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-small-orange/40';
  const labelSel = 'bg-white/[0.05] border border-white/[0.08] rounded-xl px-2 py-2.5 text-xs text-white/70 outline-none';

  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.06]">
        <button onClick={onClose} className="p-2 text-white/50 hover:text-white rounded-xl"><X size={18} /></button>
        <span className="font-black text-white flex-1">{d ? 'Edit contact' : 'New contact'}</span>
        <button onClick={() => setStarred(s => !s)} className={`p-2 rounded-xl ${starred ? 'text-amber-300' : 'text-white/30'}`} title="Favourite"><Star size={18} fill={starred ? 'currentColor' : 'none'} /></button>
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-small-orange text-black text-xs font-black uppercase tracking-widest disabled:opacity-40">Save</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-lg w-full mx-auto">
        <div className="flex justify-center py-2"><PersonAvatar name={`${given} ${family}`} photoUrl={initial?.photoUrl} size={84} plajah={!!initial?.plajah} /></div>
        <input className={field} placeholder="First name" value={given} onChange={e => setGiven(e.target.value)} />
        <input className={field} placeholder="Last name" value={family} onChange={e => setFamily(e.target.value)} />
        <input className={field} placeholder="Company" value={org} onChange={e => setOrg(e.target.value)} />
        <div className="pt-2 text-[9px] uppercase tracking-widest font-black text-white/30">Phone</div>
        {phones.map((p, i) => (
          <div key={i} className="flex gap-2">
            <select className={labelSel} value={p.label} onChange={e => setPhones(ps => ps.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}>
              {['Mobile', 'Home', 'Work', 'Main'].map(l => <option key={l}>{l}</option>)}
            </select>
            <input className={field} type="tel" inputMode="tel" placeholder="Phone number" value={p.number} onChange={e => setPhones(ps => ps.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} />
            <button onClick={() => setPhones(ps => ps.filter((_, j) => j !== i))} className="p-2 text-white/30 hover:text-red-400"><X size={16} /></button>
          </div>
        ))}
        <button onClick={() => setPhones(ps => [...ps, { number: '', label: 'Mobile' }])} className="text-xs text-small-orange font-bold flex items-center gap-1"><Plus size={13} /> Add phone</button>
        <div className="pt-2 text-[9px] uppercase tracking-widest font-black text-white/30">Email</div>
        {emails.map((em, i) => (
          <div key={i} className="flex gap-2">
            <select className={labelSel} value={em.label} onChange={e => setEmails(es => es.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}>
              {['Home', 'Work', 'Other'].map(l => <option key={l}>{l}</option>)}
            </select>
            <input className={field} type="email" placeholder="Email" value={em.address} onChange={e => setEmails(es => es.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} />
            <button onClick={() => setEmails(es => es.filter((_, j) => j !== i))} className="p-2 text-white/30 hover:text-red-400"><X size={16} /></button>
          </div>
        ))}
        <button onClick={() => setEmails(es => [...es, { address: '', label: 'Home' }])} className="text-xs text-small-orange font-bold flex items-center gap-1"><Plus size={13} /> Add email</button>
        {err && <div className="text-xs text-red-300">{err}</div>}
        {d && <button onClick={remove} className="mt-6 w-full py-3 rounded-xl border border-red-500/25 text-red-300 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"><Trash2 size={14} /> Delete contact</button>}
        <p className="text-[10px] text-white/25 pt-2">Saved to this phone's contacts. Plajah never uploads your phone book.</p>
      </div>
    </div>
  );
};

// ─── Contact detail sheet ─────────────────────────────────────────────────────
const ContactSheet: React.FC<{
  person: MergedPerson;
  canCarrier: boolean;
  onClose: () => void;
  onCall: (n: string) => void;
  onText: (n: string) => void;
  onPlajahCall: (uid: string, video: boolean) => void;
  onPlajahMessage: (uid: string) => void;
  onEdit: () => void;
}> = ({ person, canCarrier, onClose, onCall, onText, onPlajahCall, onPlajahMessage, onEdit }) => (
  <div className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="w-full sm:max-w-md bg-[#0c0c0f] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={e => e.stopPropagation()} style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
      <div className="flex items-center gap-4">
        <PersonAvatar name={person.name} photoUrl={person.photoUrl} size={64} plajah={!!person.plajah} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-black text-white truncate">{person.name}</div>
          {person.plajah && <div className="text-xs text-small-orange font-bold truncate">On Plajah{person.plajah.username ? ` · @${person.plajah.username}` : ''}</div>}
          {person.device?.organization && <div className="text-xs text-white/40 truncate">{person.device.organization}</div>}
        </div>
        {canCarrier && <button onClick={onEdit} className="p-2 text-white/40 hover:text-white rounded-xl" title="Edit"><Pencil size={17} /></button>}
      </div>

      {person.plajah && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => onPlajahMessage(person.plajah!.uid)} className="py-3 rounded-2xl bg-small-orange/15 border border-small-orange/25 text-small-orange flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest"><MessageSquare size={18} /> Message</button>
          <button onClick={() => onPlajahCall(person.plajah!.uid, false)} className="py-3 rounded-2xl bg-small-orange/15 border border-small-orange/25 text-small-orange flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest"><Phone size={18} /> Plajah call</button>
          <button onClick={() => onPlajahCall(person.plajah!.uid, true)} className="py-3 rounded-2xl bg-small-orange/15 border border-small-orange/25 text-small-orange flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-widest"><Video size={18} /> Video</button>
        </div>
      )}

      {person.phones.map(n => (
        <div key={n} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04]">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white">{formatPhone(n)}</div>
            <div className="text-[10px] text-white/35">{person.device?.phones.find(p => p.number === n)?.label || 'Phone'}</div>
          </div>
          {canCarrier && <>
            <button onClick={() => onText(n)} className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-300" title="Text"><MessageSquareText size={17} /></button>
            <button onClick={() => onCall(n)} className="p-2.5 rounded-xl bg-emerald-500 text-black" title="Call"><Phone size={17} /></button>
          </>}
        </div>
      ))}
      {person.emails.map(e => (
        <a key={e} href={`mailto:${e}`} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04] text-sm text-white/80"><Mail size={15} className="text-white/40" /> {e}</a>
      ))}
    </div>
  </div>
);

// ─── Setup card ───────────────────────────────────────────────────────────────
const SetupCard: React.FC<{ isDialer: boolean; isSms: boolean; onDone: () => void }> = ({ isDialer, isSms, onDone }) => (
  <div className="m-3 p-4 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-small-orange/10 border border-white/[0.08] space-y-3">
    <div className="flex items-center gap-2 text-white font-black"><Shield size={16} className="text-emerald-300" /> Make Plajah your phone</div>
    <p className="text-xs text-white/55 leading-relaxed">Calls and texts then live next to your Plajah chats. Your carrier texts and call history stay on this phone — Plajah doesn't upload them.</p>
    <div className="flex flex-wrap gap-2">
      {!isDialer && <button onClick={async () => { await becomeDefault('dialer'); onDone(); }} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><Phone size={13} /> Default phone app</button>}
      {!isSms && <button onClick={async () => { await becomeDefault('sms'); onDone(); }} className="px-4 py-2 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><MessageSquareText size={13} /> Default texting app</button>}
    </div>
  </div>
);

// ─── Hub ──────────────────────────────────────────────────────────────────────
const PhoneHub: React.FC<PhoneHubProps> = ({ onBack, onOpenChat }) => {
  const book = usePhoneBook();
  const { placeCall: placePlajahCall } = useCall();
  const [tab, setTab] = useState<Tab>('KEYPAD');
  const [dial, setDial] = useState('');
  const [recents, setRecents] = useState<CallLogEntry[]>([]);
  const [recentFilter, setRecentFilter] = useState<'all' | 'missed'>('all');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<MergedPerson | null>(null);
  const [editor, setEditor] = useState<{ person?: MergedPerson; number?: string } | null>(null);
  const [conversation, setConversation] = useState<{ threadId?: string; addresses: string[]; body?: string } | null>(null);
  const [rcsOpen, setRcsOpen] = useState<RcsThread | null>(null);
  const [snap, setSnap] = useState<CallsSnapshot>({ calls: [] });
  const [callUiHidden, setCallUiHidden] = useState(false);

  const status = book.status;
  const carrier = !!status?.available && !!status.hasTelephony;
  const perms = status?.permissions;

  const loadRecents = useCallback(async () => {
    if (!carrier || perms?.callLog !== 'granted') return;
    try { setRecents(await telecom.callLog(300)); } catch { /* */ }
  }, [carrier, perms?.callLog]);
  useEffect(() => { loadRecents(); }, [loadRecents]);

  // Live calls + OS launches (dial / sms: / call notification).
  useEffect(() => {
    if (!book.available) return;
    telecom.calls().then(setSnap).catch(() => {});
    const handle = (l: PhoneLaunch | null) => {
      if (!l) return;
      if (l.kind === 'dial') { setTab('KEYPAD'); setDial(cleanDial(l.number)); }
      else if (l.kind === 'sms') { setTab('MESSAGES'); setConversation({ addresses: l.addresses, body: l.body }); }
      else if (l.kind === 'call') setCallUiHidden(false);
    };
    telecom.pendingLaunch().then(handle).catch(() => {});
    const offLaunch = onTelecom('phoneLaunch', (l: PhoneLaunch) => handle(l));
    const offCalls = onTelecom('calls', (s: CallsSnapshot) => {
      setSnap(prev => {
        // A new ringing call always brings the in-call screen back.
        if (s.calls.some(c => c.state === 'ringing') && !prev.calls.some(c => c.state === 'ringing')) setCallUiHidden(false);
        return s;
      });
    });
    const offEnded = onTelecom('callEnded', () => { loadRecents(); });
    return () => { offLaunch(); offCalls(); offEnded(); };
  }, [book.available]); // eslint-disable-line react-hooks/exhaustive-deps

  const callNumber = useCallback(async (n: string) => {
    const num = cleanDial(n);
    if (!num) return;
    setCallUiHidden(false);
    try { await telecom.placeCall(num); } catch (e: any) { alert(e?.message || 'Could not place the call'); }
  }, []);

  const textNumber = useCallback((n: string) => { setSheet(null); setTab('MESSAGES'); setConversation({ addresses: [cleanDial(n)] }); }, []);

  const plajahCall = useCallback(async (uid: string, video: boolean) => {
    setSheet(null);
    const room = await book.plajah.roomFor(uid);
    if (room) await placePlajahCall(room, video ? 'VIDEO' : 'AUDIO');
  }, [book.plajah, placePlajahCall]);

  const plajahMessage = useCallback(async (uid: string) => {
    setSheet(null);
    const room = await book.plajah.roomFor(uid);
    if (room) onOpenChat?.(room.id);
  }, [book.plajah, onOpenChat]);

  const keypadSuggestions = useMemo(() => dial.length < 2 ? [] :
    book.merged.filter(m => keypadMatches(dial, m.name, m.phones)).slice(0, 4), [dial, book.merged]);

  const contactList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? book.merged.filter(m => m.name.toLowerCase().includes(q) || m.phones.some(p => p.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '__')) || m.emails.some(e => e.includes(q))) : book.merged;
    return list;
  }, [book.merged, query]);

  const filteredRecents = recentFilter === 'missed' ? recents.filter(r => r.type === 'missed' || r.type === 'rejected') : recents;
  const liveCalls = snap.calls.filter(c => c.state !== 'disconnected');
  const showCallUi = liveCalls.length > 0 && !callUiHidden;

  const tabs: { id: Tab; label: string; icon: React.FC<any>; badge?: number }[] = [
    { id: 'KEYPAD', label: 'Keypad', icon: Grid3x3 },
    { id: 'RECENTS', label: 'Recents', icon: History, badge: recents.filter(r => r.isNew && r.type === 'missed').length },
    { id: 'CONTACTS', label: 'Contacts', icon: Users },
    { id: 'MESSAGES', label: 'Messages', icon: MessageSquareText, badge: book.unreadTexts },
  ];

  const needsPerm = (alias: 'contacts' | 'callLog' | 'sms', label: string) => perms && perms[alias] !== 'granted' ? (
    <div className="m-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-center space-y-3">
      <p className="text-xs text-white/50">Plajah needs access to your {label} to show them here.</p>
      <button onClick={async () => { await requestTelecomPermissions([alias]); const s = await book.refreshStatus(); if (s.permissions.contacts === 'granted') book.refreshContacts(); if (s.permissions.sms === 'granted') book.refreshThreads(); loadRecents(); }}
        className="px-4 py-2 rounded-xl bg-small-orange text-black text-[10px] font-black uppercase tracking-widest">Allow {label}</button>
    </div>
  ) : null;

  if (status && !status.available) {
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Smartphone size={40} className="text-white/20" />
        <div className="text-lg font-black">Plajah Phone lives in the Android app</div>
        <p className="text-sm text-white/50 max-w-sm">Install Plajah on an Android phone and set it as your phone and texting app to call, text and manage contacts next to your chats.</p>
        {onBack && <button onClick={onBack} className="px-5 py-2.5 rounded-xl bg-white/10 text-xs font-black uppercase tracking-widest">Back</button>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
        {onBack && <button onClick={onBack} className="p-2 text-white/50 hover:text-white rounded-xl"><ChevronLeft size={18} /></button>}
        <div className="flex-1 font-black tracking-tight flex items-center gap-2"><Phone size={16} className="text-emerald-400" /> Phone</div>
        {liveCalls.length > 0 && callUiHidden && (
          <button onClick={() => setCallUiHidden(false)} className="px-3 py-1.5 rounded-full bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-pulse"><Phone size={12} /> Return to call</button>
        )}
        {tab === 'CONTACTS' && carrier && <button onClick={() => setEditor({})} className="p-2 text-white/50 hover:text-white rounded-xl" title="New contact"><UserPlus size={18} /></button>}
        {tab === 'MESSAGES' && carrier && !conversation && !rcsOpen && <button onClick={() => { const n = prompt('Text to (phone number)'); if (n) setConversation({ addresses: [cleanDial(n)] }); }} className="p-2 text-white/50 hover:text-white rounded-xl" title="New text"><Plus size={18} /></button>}
      </div>

      {status && carrier && (!status.isDefaultDialer || !(status.isDefaultSms || book.rcsStatus?.enabled)) && tab !== 'KEYPAD' && !conversation && (
        <SetupCard isDialer={status.isDefaultDialer} isSms={status.isDefaultSms || !!book.rcsStatus?.enabled} onDone={() => book.refreshStatus()} />
      )}
      {status && !status.hasTelephony && (
        <div className="m-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">This device has no SIM / phone radio. Plajah calls and chats still work.</div>
      )}

      {/* Body — two panes on wide / unfolded screens (list + conversation) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'KEYPAD' && (
          <div className="h-full flex flex-col justify-end pb-6 overflow-y-auto">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 space-y-1">
              {keypadSuggestions.map(m => (
                <button key={m.key} onClick={() => m.phones[0] && setDial(cleanDial(m.phones[0]))} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white/[0.04] text-left">
                  <PersonAvatar name={m.name} photoUrl={m.photoUrl} size={36} plajah={!!m.plajah} />
                  <div className="min-w-0"><div className="text-sm font-semibold truncate">{m.name}</div><div className="text-xs text-white/40">{formatPhone(m.phones[0] || '')}</div></div>
                </button>
              ))}
            </div>
            <div className="text-center px-6 mb-1 min-h-[52px] flex items-center justify-center">
              <span className="text-[34px] font-light tracking-wide break-all">{formatPhone(dial)}</span>
            </div>
            {dial && !book.lookup(dial) && carrier && (
              <button onClick={() => setEditor({ number: dial })} className="mx-auto mb-3 text-xs text-small-orange font-bold flex items-center gap-1"><UserPlus size={13} /> Add to contacts</button>
            )}
            <KeyGrid onKey={k => setDial(d => (d + k).slice(0, 32))} onLong0={() => setDial(d => (d + '+').slice(0, 32))} />
            <div className="grid grid-cols-3 items-center mt-5 mx-auto w-full" style={{ maxWidth: 300 }}>
              <span />
              <button disabled={!dial || !carrier} onClick={() => callNumber(dial)} className="mx-auto w-[68px] h-[68px] rounded-full bg-emerald-500 disabled:bg-white/10 text-black disabled:text-white/30 grid place-items-center shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <Phone size={26} />
              </button>
              {dial ? (
                <button onClick={() => setDial(d => d.slice(0, -1))} onContextMenu={e => { e.preventDefault(); setDial(''); }} className="mx-auto p-3 text-white/50 hover:text-white"><Delete size={24} /></button>
              ) : <span />}
            </div>
          </div>
        )}

        {tab === 'RECENTS' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {needsPerm('callLog', 'call history') || (
              <>
                <div className="flex gap-1 px-3 pt-3">
                  {(['all', 'missed'] as const).map(f => (
                    <button key={f} onClick={() => setRecentFilter(f)} className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${recentFilter === f ? 'bg-white/10 text-white' : 'text-white/35'}`}>{f}</button>
                  ))}
                </div>
                <div className="p-2 space-y-0.5">
                  {filteredRecents.length === 0 && <div className="py-16 text-center text-white/25 text-xs">No calls yet</div>}
                  {filteredRecents.map(r => {
                    const person = book.lookup(r.number);
                    const missed = r.type === 'missed' || r.type === 'rejected';
                    const Icon = missed ? PhoneMissed : r.type === 'outgoing' ? ArrowUpRight : r.type === 'blocked' ? Ban : ArrowDownLeft;
                    const title = person?.name || r.name || displayPhone(r.number) || 'Unknown';
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-white/[0.04]">
                        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => person ? setSheet(person) : setEditor({ number: r.number })}>
                          <PersonAvatar name={title} photoUrl={person?.photoUrl || r.photoUrl} size={40} plajah={!!person?.plajah} />
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold truncate ${missed ? 'text-red-300' : 'text-white'}`}>{title}</div>
                            <div className="text-[11px] text-white/35 flex items-center gap-1"><Icon size={11} /> {timeLabel(r.date)}{r.duration > 0 ? ` · ${fmtDuration(r.duration)}` : ''}</div>
                          </div>
                        </button>
                        <button onClick={() => textNumber(r.number)} className="p-2 text-white/35 hover:text-emerald-300" title="Text"><MessageSquareText size={17} /></button>
                        <button onClick={() => callNumber(r.number)} className="p-2 text-emerald-400 hover:text-emerald-300" title="Call back"><Phone size={17} /></button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'CONTACTS' && (
          <div className="h-full flex flex-col min-h-0">
            <div className="p-3 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people" className="w-full bg-white/[0.05] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-small-orange/40" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
              {carrier && needsPerm('contacts', 'contacts')}
              {contactList.length === 0 && <div className="py-16 text-center text-white/25 text-xs">No contacts</div>}
              {contactList.map((m, i) => {
                const letter = m.starred ? '★' : ((m.name[0] || '#').toUpperCase().match(/[A-Z]/) ? m.name[0].toUpperCase() : '#');
                const prev = contactList[i - 1];
                const prevLetter = prev ? (prev.starred ? '★' : ((prev.name[0] || '#').toUpperCase().match(/[A-Z]/) ? prev.name[0].toUpperCase() : '#')) : '';
                return (
                  <React.Fragment key={m.key}>
                    {letter !== prevLetter && <div className="px-3 pt-3 pb-1 text-[10px] font-black text-white/30">{letter === '★' ? 'Favourites' : letter}</div>}
                    <button onClick={() => setSheet(m)} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white/[0.04] text-left">
                      <PersonAvatar name={m.name} photoUrl={m.photoUrl} size={40} plajah={!!m.plajah} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{m.name}</div>
                        <div className="text-[11px] text-white/35 truncate">{m.plajah && !m.device ? 'Plajah' : m.phones[0] ? formatPhone(m.phones[0]) : m.emails[0] || ''}</div>
                      </div>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'MESSAGES' && (
          <div className="h-full flex min-h-0">
            <div className={`${conversation || rcsOpen ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[360px] md:border-r border-white/[0.06] min-h-0`}>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
                <RcsSetupCard status={book.rcsStatus} plajahIsDefaultSms={!!status?.isDefaultSms} onDone={book.refreshRcs} />
                {(status?.isDefaultSms ? needsPerm('sms', 'texts') : null) || (() => {
                  // SMS (Telephony provider) and RCS (notification bridge) in one list, newest first.
                  const rows: ({ kind: 'sms'; t: SmsThread } | { kind: 'rcs'; t: RcsThread })[] = [
                    ...book.threads.map(t => ({ kind: 'sms' as const, t })),
                    ...book.rcsThreads.map(t => ({ kind: 'rcs' as const, t })),
                  ].sort((a, b) => b.t.date - a.t.date);
                  if (!rows.length) return <div className="py-16 text-center text-white/25 text-xs">No texts yet</div>;
                  return rows.map(r => r.kind === 'sms' ? (
                    <SmsThreadRow key={`s${r.t.threadId}`} thread={r.t} lookup={book.lookup} active={conversation?.threadId === r.t.threadId}
                      onOpen={() => { setRcsOpen(null); setConversation({ threadId: r.t.threadId, addresses: r.t.addresses }); }} />
                  ) : (
                    <RcsThreadRow key={`r${r.t.threadKey}`} thread={r.t} active={rcsOpen?.threadKey === r.t.threadKey}
                      photoUrl={book.merged.find(m => m.name === r.t.title)?.photoUrl}
                      onOpen={() => { setConversation(null); setRcsOpen(r.t); }} />
                  ));
                })()}
              </div>
            </div>
            <div className={`${conversation || rcsOpen ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 min-h-0`}>
              {rcsOpen ? (
                <RcsConversation key={rcsOpen.threadKey} thread={rcsOpen} onBack={() => setRcsOpen(null)}
                  onDeleted={() => { setRcsOpen(null); book.refreshRcs(); }} onChanged={book.refreshRcs} />
              ) : conversation ? (
                <SmsConversation
                  key={conversation.threadId || conversation.addresses.join(',')}
                  threadId={conversation.threadId}
                  addresses={conversation.addresses}
                  initialBody={conversation.body}
                  lookup={book.lookup}
                  onBack={() => setConversation(null)}
                  onCall={callNumber}
                  onPlajahCall={plajahCall}
                  onDeleted={() => { setConversation(null); book.refreshThreads(); }}
                  onChanged={book.refreshThreads}
                />
              ) : (
                <div className="flex-1 grid place-items-center text-white/20 text-xs"><MessageSquareText size={34} className="text-white/10" /></div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom tabs */}
      <div className="shrink-0 grid grid-cols-4 border-t border-white/[0.06] bg-black/40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== 'MESSAGES') { setConversation(null); setRcsOpen(null); } }} className={`relative py-2.5 flex flex-col items-center gap-1 ${tab === t.id ? 'text-emerald-300' : 'text-white/35'}`}>
            <t.icon size={19} />
            <span className="text-[9px] font-black uppercase tracking-widest">{t.label}</span>
            {!!t.badge && <span className="absolute top-1.5 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black grid place-items-center">{t.badge}</span>}
          </button>
        ))}
      </div>

      {sheet && (
        <ContactSheet person={sheet} canCarrier={carrier} onClose={() => setSheet(null)}
          onCall={n => { setSheet(null); callNumber(n); }} onText={textNumber}
          onPlajahCall={plajahCall} onPlajahMessage={plajahMessage}
          onEdit={() => { setEditor({ person: sheet }); setSheet(null); }} />
      )}
      {editor && (
        <ContactEditor initial={editor.person} presetNumber={editor.number} onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); book.refreshContacts(); }} />
      )}
      {showCallUi && <InCallScreen snap={snap} lookup={book.lookup} onMinimize={() => setCallUiHidden(true)} />}
    </div>
  );
};

export default PhoneHub;
export type { LiveCall };
