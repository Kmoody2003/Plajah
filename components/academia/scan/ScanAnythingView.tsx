// ScanAnythingView — one camera button for school paper (ACADEMIA_SCAN).
//
// Point the phone at a page and Plajah works out what it is, on device:
//   · A worksheet, scanned by a student → it is matched to the right assignment, the answers on the
//     paper are read into the digital copy, and the student lands on it to check and turn in.
//   · A worksheet, scanned by a teacher → it opens in Teacher Tools to become an assignment.
//   · A flyer (picture day, field trip, book fair…) → dates become calendar events with reminders,
//     shared to the linked family's calendars, and the flyer is filed as a Notes page.
// Nothing leaves the device until the person approves what was found.

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, UploadCloud, Loader2, FileText, CalendarDays, ClipboardCheck, Check, Users, Bell, NotebookPen, RefreshCw, MapPin } from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { opsDb } from '../../../services/firebase';
import { prepareWorksheetImage } from '../../../services/worksheetImagePipeline';
import { readPageOnDevice, warmOcr, type PageRead } from '../../../services/worksheetLocalVision';
import { readCompletedWorksheet, type DigitalWorksheet } from '../../../services/worksheetDigitizer';
import { fetchWorksheet } from '../../../services/worksheetAssignmentService';
import { classifyScan, parseFlyer, pickHeadline, rankAssignmentsForScan, confidentMatch, type FlyerEvent, type FlyerParse, type RankedAssignment, type ScanKind } from '../../../services/worksheetScanCore';
import { openWorksheetAssignment, queueTeacherWorksheetScan } from '../../../services/worksheetOpen';
import { resolveFamily, addFlyerEventsToMyCalendar, shareFlyerWithFamily, saveFlyerNote, type FamilyMember } from '../../../services/flyerCalendar';
import { openPostman } from '../../../services/postman/postmanIntent';
import { useViewport } from '../../../hooks/useViewport';

const T = { bg: '#0a0a0f', card: '#12121a', alt: '#15151f', border: '#22222e', ink: '#fff', muted: '#a0a0ac', faint: '#82828f', orange: '#FF8C00', green: '#5fd17f', gold: '#e0a400', blue: '#36c5f0', violet: '#8166e6', red: '#ff6b6b' };
type Role = 'student' | 'teacher' | 'parent';
type Stage = 'capture' | 'reading' | 'worksheet' | 'flyer' | 'done' | 'error';

export function roleFromProfile(profile: any): Role {
  const t = String(profile?.accountType || profile?.role || '').toUpperCase();
  if (/TEACHER|EDUCATOR|STAFF|INSTRUCTOR/.test(t) || profile?.isTeacher) return 'teacher';
  if (/PARENT|GUARDIAN/.test(t) || (Array.isArray(profile?.childUids) && profile.childUids.length)) return 'parent';
  return 'student';
}

const btn = (bg: string, fg: string, border = 'none'): React.CSSProperties => ({ minHeight: 48, borderRadius: 12, border, background: bg, color: fg, fontWeight: 800, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 16px', cursor: 'pointer' });
const fmtWhen = (e: FlyerEvent) => {
  const d = new Date(e.start);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  if (e.allDay) { const days = Math.round((e.end - e.start) / 86_400_000); return days > 1 ? `${day} – ${new Date(e.end - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · all day` : `${day} · all day`; }
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–${new Date(e.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

const ScanAnythingView: React.FC<{ user?: any; profile?: any; onBack?: () => void }> = ({ user, profile, onBack }) => {
  const { isPhone } = useViewport();
  const [role, setRole] = useState<Role>(() => roleFromProfile(profile));
  const [stage, setStage] = useState<Stage>('capture');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState<(PageRead & { pageImage: string; text: string }) | null>(null);
  const [kind, setKind] = useState<ScanKind>('worksheet');
  const [ranked, setRanked] = useState<RankedAssignment[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [flyer, setFlyer] = useState<FlyerParse | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [family, setFamily] = useState<FamilyMember[] | null>(null);
  const [shareTo, setShareTo] = useState<Record<string, boolean>>({});
  const [doNote, setDoNote] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ events: number; shared: number; note: boolean } | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);

  useEffect(() => { warmOcr(); }, []);
  useEffect(() => { setRole(roleFromProfile(profile)); }, [profile]);

  const reset = () => { setStage('capture'); setFile(null); setPage(null); setRanked(null); setFlyer(null); setResult(null); setError(''); setProgress(''); setOpening(null); };

  const loadMyAssignments = async (): Promise<Array<{ id: string; sheet: DigitalWorksheet; dueDate?: number | null; assignedAt?: number }>> => {
    if (!user?.uid) return [];
    const snap = await getDocs(query(collection(opsDb, 'worksheet_assignments'), where('studentIds', 'array-contains', user.uid), limit(40))).catch(() => null);
    const rows = (snap?.docs || []).map(d => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 25);
    const sheets = await Promise.all(rows.map(r => fetchWorksheet(r.worksheetId).catch(() => null)));
    return rows.map((r, i) => sheets[i] ? { id: r.id, sheet: { ...sheets[i]!, id: r.worksheetId }, dueDate: r.dueDate, assignedAt: r.createdAt } : null).filter(Boolean) as any;
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setFile(f); setStage('reading'); setError(''); setProgress('Cleaning the photo…');
    try {
      const prepared = await prepareWorksheetImage(f);
      const read = await readPageOnDevice(prepared.cleanedDataUrl, setProgress);
      setPage(read);
      if (read.text.replace(/\s/g, '').length < 12) { setError("Couldn't find readable text. Lay the page flat in good light and fill the frame."); setStage('error'); return; }
      const k = classifyScan(read.text).kind;
      await routeAs(k, read, f);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.'); setStage('error');
    }
  };

  const routeAs = async (k: ScanKind, read = page, f = file) => {
    if (!read) return;
    setKind(k);
    if (k === 'flyer') {
      const parsed = parseFlyer(read.text, new Date(), pickHeadline(read.local.lines));
      setFlyer(parsed);
      setPicked(Object.fromEntries(parsed.events.map((_, i) => [i, true])));
      setTitles({});
      setStage('flyer');
      if (user?.uid && family === null) void resolveFamily(user.uid).then(members => { setFamily(members); setShareTo(Object.fromEntries(members.map(m => [m.uid, true]))); });
      return;
    }
    if (role === 'teacher' && f) { queueTeacherWorksheetScan(f); return; }
    setStage('worksheet'); setProgress('Finding your assignment…');
    const candidates = await loadMyAssignments();
    const r = rankAssignmentsForScan(read.text, candidates);
    setRanked(r);
    setProgress('');
    const winner = confidentMatch(r);
    if (winner) void openMatched(winner, read, f);
  };

  const openMatched = async (match: RankedAssignment, read = page, f = file) => {
    if (!read) return;
    setOpening(match.id); setProgress(`Reading your answers for “${match.sheet.title}”…`);
    try {
      const reading = await readCompletedWorksheet('', 'image/jpeg', match.sheet, { handwriting: 'auto', page: read, onProgress: setProgress });
      const answers = Object.fromEntries(Object.entries(reading.answers).filter(([, v]) => v));
      openWorksheetAssignment({
        worksheetId: match.sheet.id, assignmentId: match.id, sheet: match.sheet,
        prefill: { answers, confidence: Object.fromEntries(Object.keys(answers).map(id => [id, reading.confidence[id] ?? .5])), scanFile: f || undefined, scanPreview: read.pageImage },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the answers.'); setOpening(null);
    }
  };

  const saveAsNote = async () => {
    if (!page) return;
    setSaving(true);
    const blank: FlyerParse = { title: page.text.split('\n').find(l => l.trim().length > 3)?.trim().slice(0, 70) || 'Scanned page', events: [], notes: [], contacts: [], links: [], text: page.text };
    const id = await saveFlyerNote(user?.uid, blank, []);
    setSaving(false);
    setResult({ events: 0, shared: 0, note: !!id }); setStage('done');
  };

  const saveFlyer = async () => {
    if (!flyer || saving) return;
    setSaving(true); setError('');
    const events = flyer.events.map((e, i) => ({ ...e, title: (titles[i] ?? e.title).trim() || e.title })).filter((_, i) => picked[i]);
    try {
      const n = user?.uid && events.length ? await addFlyerEventsToMyCalendar(flyer.title, events) : 0;
      const recipients = (family || []).filter(m => shareTo[m.uid]);
      const share = user?.uid && recipients.length && events.length ? await shareFlyerWithFamily({ ownerUid: user.uid, ownerName: user.displayName || 'Family', flyer, events, recipients }).catch(() => ({ shareId: null, notified: 0 })) : { notified: 0 };
      const note = doNote ? !!(await saveFlyerNote(user?.uid, flyer, events)) : false;
      setResult({ events: n, shared: share.notified, note }); setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save to your calendar.');
    } finally { setSaving(false); }
  };

  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: isPhone ? 14 : 18 };

  return (
    <div style={{ minHeight: '100%', background: T.bg, color: T.ink, padding: `16px ${isPhone ? 12 : 16}px calc(40px + env(safe-area-inset-bottom))`, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .scan-any input,.scan-any select{font-size:16px}`}</style>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { void onFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={e => { void onFile(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      <div className="scan-any" style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && <button onClick={onBack} aria-label="Back" style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, display: 'grid', placeItems: 'center' }}><ArrowLeft size={18} /></button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900 }}>Scan school paper</h1>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Worksheets, homework and flyers · read on this device</div>
          </div>
        </div>

        {stage === 'capture' && (
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10 }}>
              <button onClick={() => cam.current?.click()} style={{ ...btn(T.orange, '#1a1a1a'), minHeight: 120, flexDirection: 'column', fontSize: 16 }}><Camera size={30} /> Take a photo</button>
              <button onClick={() => lib.current?.click()} style={{ ...btn(T.alt, T.ink, `1px solid ${T.border}`), minHeight: 120, flexDirection: 'column', fontSize: 16 }}><UploadCloud size={28} /> Choose an image</button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {(role === 'teacher'
                ? [[ClipboardCheck, 'Blank worksheet', 'becomes a graded assignment for your class'], [CalendarDays, 'School flyer', 'dates go on your calendar with reminders']]
                : role === 'parent'
                ? [[CalendarDays, 'School flyer', "dates go on your calendar and your kids' calendars"], [NotebookPen, 'Any page', 'saved to Notes so you can find it later']]
                : [[ClipboardCheck, 'Finished worksheet', 'finds your assignment, fills it in, checks it'], [CalendarDays, 'School flyer', 'dates go on your calendar and your family\'s']]
              ).map(([Icon, a, b]: any) => <div key={a} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, color: T.muted }}><Icon size={16} color={T.orange} /><span><b style={{ color: T.ink }}>{a}</b> — {b}</span></div>)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: T.faint }}>Scanning as</span>
              {(['student', 'parent', 'teacher'] as Role[]).map(r => <button key={r} onClick={() => setRole(r)} style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${role === r ? T.orange : T.border}`, background: role === r ? `${T.orange}22` : 'transparent', color: role === r ? T.orange : T.muted, fontSize: 12.5, fontWeight: 750, textTransform: 'capitalize', cursor: 'pointer' }}>{r}</button>)}
            </div>
          </div>
        )}

        {stage === 'reading' && (
          <div style={{ ...card, display: 'grid', placeItems: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
            <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: T.orange }} />
            <div style={{ fontWeight: 800 }}>Reading the page…</div>
            <div aria-live="polite" style={{ fontSize: 13, color: T.muted }}>{progress}</div>
          </div>
        )}

        {stage === 'error' && (
          <div style={card}>
            <div style={{ fontWeight: 850, color: T.red }}>That didn't work</div>
            <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6 }}>{error}</div>
            <button onClick={reset} style={{ ...btn(T.orange, '#1a1a1a'), marginTop: 14, width: '100%' }}><RefreshCw size={16} /> Try another photo</button>
          </div>
        )}

        {page && (stage === 'worksheet' || stage === 'flyer') && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: T.faint }}>This looks like a</span>
            {(['worksheet', 'flyer'] as ScanKind[]).map(k => <button key={k} onClick={() => void routeAs(k)} style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${kind === k ? T.blue : T.border}`, background: kind === k ? `${T.blue}22` : 'transparent', color: kind === k ? T.blue : T.muted, fontSize: 12.5, fontWeight: 750, cursor: 'pointer' }}>{k === 'worksheet' ? 'Worksheet' : 'Flyer / notice'}</button>)}
          </div>
        )}

        {stage === 'worksheet' && (
          <div style={card}>
            {!ranked ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: T.muted, fontSize: 13.5 }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {progress || 'Finding your assignment…'}</div>
            ) : opening ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: T.muted, fontSize: 13.5 }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {progress}</div>
            ) : (
              <>
                <div style={{ fontWeight: 850, fontSize: 15 }}>{ranked.length ? 'Which assignment is this?' : 'No assignments found for you yet'}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{ranked.length ? 'Plajah wasn\'t sure — pick the one you finished.' : user?.uid ? 'When a teacher assigns a worksheet it appears here.' : 'Sign in to match this to your assignments.'}</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {ranked.slice(0, 6).map(r => (
                    <button key={r.id} onClick={() => void openMatched(r)} style={{ textAlign: 'left', minHeight: 56, borderRadius: 12, border: `1px solid ${T.border}`, background: T.alt, color: T.ink, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                      <FileText size={18} color={T.orange} />
                      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sheet.title}</b><span style={{ fontSize: 12, color: T.muted }}>{r.sheet.subject}{r.dueDate ? ` · due ${new Date(r.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span></span>
                      <span style={{ fontSize: 12, color: r.score > .4 ? T.green : T.faint, fontWeight: 800 }}>{Math.round(r.score * 100)}% match</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => void saveAsNote()} disabled={saving} style={{ ...btn('transparent', T.muted, `1px solid ${T.border}`), width: '100%', marginTop: 12 }}><NotebookPen size={16} /> Not an assignment — save it to Notes</button>
              </>
            )}
            {error && <div style={{ color: T.red, fontSize: 13, marginTop: 10 }}>{error}</div>}
          </div>
        )}

        {stage === 'flyer' && flyer && (
          <>
            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 800, color: T.blue }}>Found on the flyer</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{flyer.title}</div>
              {flyer.events.length === 0 && <div style={{ fontSize: 13.5, color: T.muted, marginTop: 8 }}>No dates were readable. You can still save the flyer to Notes.</div>}
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {flyer.events.map((e, i) => (
                  <label key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 10, alignItems: 'start', padding: 12, borderRadius: 12, background: T.alt, border: `1px solid ${picked[i] ? (e.kind === 'deadline' ? T.gold : T.blue) + '66' : T.border}` }}>
                    <input type="checkbox" checked={!!picked[i]} onChange={ev => setPicked(p => ({ ...p, [i]: ev.target.checked }))} style={{ width: 22, height: 22, marginTop: 10, accentColor: T.blue }} aria-label={`Include ${e.title}`} />
                    <span style={{ minWidth: 0 }}>
                      <input value={titles[i] ?? e.title} onChange={ev => setTitles(t => ({ ...t, [i]: ev.target.value }))} aria-label="Event title" style={{ width: '100%', minHeight: 44, borderRadius: 10, border: `1px solid ${T.border}`, background: '#0d0d14', color: T.ink, padding: '0 10px', fontWeight: 750 }} />
                      <span style={{ display: 'block', fontSize: 13, color: e.kind === 'deadline' ? T.gold : T.blue, marginTop: 6, fontWeight: 700 }}>{e.kind === 'deadline' ? '⏰ ' : ''}{fmtWhen(e)}</span>
                      {e.location && <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5, color: T.muted, marginTop: 3 }}><MapPin size={12} /> {e.location}</span>}
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: T.faint, marginTop: 3 }}><Bell size={11} /> {e.reminders.map(m => m >= 1440 ? `${m / 1440} day${m / 1440 > 1 ? 's' : ''} before` : `${m} min before`).join(' · ')}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: T.faint, marginTop: 4, fontStyle: 'italic' }}>“{e.sourceLine}”</span>
                    </span>
                  </label>
                ))}
              </div>
              {flyer.notes.length > 0 && <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: T.muted, marginBottom: 6 }}>Remember</div>{flyer.notes.map((n, i) => <div key={i} style={{ fontSize: 13.5, padding: '4px 0', color: T.ink }}>☐ {n}</div>)}</div>}
              {(flyer.contacts.length > 0 || flyer.links.length > 0) && <div style={{ marginTop: 10, fontSize: 12.5, color: T.muted }}>{[...flyer.contacts, ...flyer.links].join(' · ')}</div>}
            </div>

            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 800, color: T.orange, display: 'flex', gap: 6, alignItems: 'center' }}><Users size={13} /> Also add to</div>
              {family === null ? <div style={{ fontSize: 13, color: T.muted, marginTop: 8 }}>{user?.uid ? 'Finding your family…' : 'Sign in to share with your family.'}</div>
                : family.length === 0 ? <div style={{ fontSize: 13, color: T.muted, marginTop: 8 }}>No linked family accounts yet — link a parent or child in Family settings to share automatically.</div>
                : <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{family.map(m => <label key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 14 }}><input type="checkbox" checked={!!shareTo[m.uid]} onChange={ev => setShareTo(s => ({ ...s, [m.uid]: ev.target.checked }))} style={{ width: 22, height: 22, accentColor: T.orange }} /> {m.name} <span style={{ fontSize: 12, color: T.faint }}>{m.relation === 'child' ? 'child' : m.relation === 'guardian' ? 'parent' : 'co-parent'}</span></label>)}</div>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 14, marginTop: 6 }}><input type="checkbox" checked={doNote} onChange={ev => setDoNote(ev.target.checked)} style={{ width: 22, height: 22, accentColor: T.orange }} /> Save the flyer to Notes with a to-do list</label>
              <button onClick={() => void saveFlyer()} disabled={saving || (!Object.values(picked).some(Boolean) && !doNote)} style={{ ...btn(T.orange, '#1a1a1a'), width: '100%', marginTop: 12, opacity: saving ? .7 : 1 }}>
                {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarDays size={16} />} {Object.values(picked).filter(Boolean).length ? `Add ${Object.values(picked).filter(Boolean).length} to calendar` : 'Save to Notes'}
              </button>
              {!user?.uid && <div style={{ fontSize: 12, color: T.gold, marginTop: 8 }}>Sign in to save to your calendar.</div>}
              {error && <div style={{ color: T.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
            </div>
          </>
        )}

        {stage === 'done' && result && (
          <div style={card}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: T.green, fontWeight: 900, fontSize: 17 }}><Check size={18} /> Done</div>
            <div style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 14, color: T.muted }}>
              {result.events > 0 && <div>📅 {result.events} added to your calendar with reminders</div>}
              {result.shared > 0 && <div>👪 Shared with {result.shared} family member{result.shared === 1 ? '' : 's'} — it's on their calendars too</div>}
              {result.note && <div>📝 Saved to Notes</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 8, marginTop: 14 }}>
              {result.events > 0 && <button onClick={() => openPostman({ room: 'CALENDAR' })} style={btn(T.blue, '#04161d')}><CalendarDays size={16} /> Open calendar</button>}
              <button onClick={reset} style={btn('transparent', T.ink, `1px solid ${T.border}`)}><Camera size={16} /> Scan another</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanAnythingView;
