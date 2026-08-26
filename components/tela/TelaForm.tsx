/**
 * TelaForm — the input device (P1). Points at a Base in the same doc
 * (baseDeviceId) and renders that Base's fields as inputs; Submit appends a row
 * to the Base (ops-shaped, through the parent). Styled as a clean "form preview"
 * card consistent with the DS. When no Base is chosen it shows a picker of the
 * Bases in the document.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ClipboardList, Check, ChevronDown, FileUp, Link2, Mic, Square, Video } from 'lucide-react';
import type { TelaAssignmentSubmissionAudit, TelaBaseDevice, TelaField, TelaFormDevice, TelaSubmissionGrade } from '../../types';
import { uploadTelaImage } from '../../services/telaAssets';
import { gradeTelaAssignment, visibleFieldFeedback } from '../../services/telaAssignmentEngine';

interface BaseOption { id: string; name: string; }

interface TelaFormProps {
  device: TelaFormDevice;
  base: TelaBaseDevice | null;
  bases: BaseOption[];
  readOnly?: boolean;
  onSetBase: (baseDeviceId: string) => void;
  onSubmit: (values: Record<string, string>, grading?: TelaSubmissionGrade, audit?: TelaAssignmentSubmissionAudit) => void;
}

const INK = '#1B1523';
const HAIR = '#E3DEEA';

const TelaMediaResponse: React.FC<{
  kind: 'AUDIO' | 'VIDEO';
  maxSeconds: number;
  value: string;
  onChange: (value: string) => void;
}> = ({ kind, maxSeconds, value, onChange }) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const preview = useRef<HTMLVideoElement | null>(null);

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
  };
  useEffect(() => () => { stop(); stream.current?.getTracks().forEach(track => track.stop()); }, []);

  const start = async () => {
    setError(''); setSeconds(0);
    try {
      const media = await navigator.mediaDevices.getUserMedia(kind === 'VIDEO' ? { audio: true, video: true } : { audio: true });
      stream.current = media;
      if (preview.current && kind === 'VIDEO') { preview.current.srcObject = media; void preview.current.play().catch(() => {}); }
      const mime = kind === 'VIDEO'
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
        : ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      next.onstop = async () => {
        media.getTracks().forEach(track => track.stop()); stream.current = null;
        const type = next.mimeType || (kind === 'VIDEO' ? 'video/webm' : 'audio/webm');
        const file = new File([new Blob(chunks, { type })], `tela-response-${Date.now()}.webm`, { type });
        setBusy(true);
        try { const result = await uploadTelaImage(file); onChange(result.src); }
        catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Recording upload failed.'); }
        finally { setBusy(false); }
      };
      recorder.current = next; next.start(500); setRecording(true);
      timer.current = setInterval(() => setSeconds(current => { const nextSecond = current + 1; if (nextSecond >= maxSeconds) setTimeout(stop, 0); return Math.min(nextSecond, maxSeconds); }), 1000);
    } catch (mediaError) { setError(mediaError instanceof Error ? mediaError.message : 'Camera or microphone permission was denied.'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {kind === 'VIDEO' && (
        <video ref={preview} muted playsInline style={{ display: recording ? 'block' : 'none', width: '100%', maxHeight: 100, borderRadius: 7, background: '#130f18', objectFit: 'cover' }}/>
      )}
      <button type="button" disabled={busy} onClick={recording ? stop : start} style={{ height: 34, borderRadius: 8, border: `1px solid ${recording ? '#D40055' : '#D9D1E3'}`, background: recording ? 'rgba(212,0,85,.09)' : '#fff', color: recording ? '#B00048' : '#4D4359', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
        {recording ? <Square size={12} fill="currentColor"/> : kind === 'VIDEO' ? <Video size={14}/> : <Mic size={14}/>} {busy ? 'Saving…' : recording ? `Stop · ${seconds}s / ${maxSeconds}s` : value ? 'Record again' : `Record up to ${maxSeconds}s`}
      </button>
      {value && !recording && (kind === 'AUDIO' ? <audio src={value} controls style={{ width: '100%', height: 32 }}/> : <video src={value} controls playsInline style={{ width: '100%', maxHeight: 110, borderRadius: 7 }}/>) }
      {error && <span style={{ fontSize: 10, color: '#C0354A' }}>{error}</span>}
    </div>
  );
};

const TelaForm: React.FC<TelaFormProps> = ({ device, base, bases, readOnly, onSetBase, onSubmit }) => {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState(false);
  const [checkedGrade, setCheckedGrade] = useState<TelaSubmissionGrade | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const openedAt = useRef(Date.now());

  const set = (fieldId: string, value: string) => { setDraft(d => ({ ...d, [fieldId]: value })); setCheckedGrade(null); };

  const attach = async (field: TelaField, file?: File) => {
    if (!file) return;
    setUploadingField(field.id);
    try { const result = await uploadTelaImage(file); set(field.id, result.src); }
    catch (error) { console.error('[Tela assignment] attachment upload failed', error); }
    finally { setUploadingField(null); }
  };

  const submit = () => {
    if (!base) return;
    const values: Record<string, string> = {};
    for (const f of base.fields) {
      const v = draft[f.id];
      if (v !== undefined && v !== '') values[f.id] = v;
    }
    const grading = device.assignment?.enabled ? gradeTelaAssignment(base, values) : undefined;
    if (grading) setCheckedGrade(grading);
    const submittedAt = Date.now();
    onSubmit(values, grading, device.assignment?.enabled ? {
      studentId: 'local-user', studentName: 'Current student', status: 'TURNED_IN',
      assignedAt: device.assignment.createdAt, openedAt: openedAt.current,
      submittedAt, turnedInAt: Date.now(), durationMs: Math.max(0, submittedAt - openedAt.current),
    } : undefined);
    if (!device.assignment?.enabled) setDraft({});
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.02em', color: '#6E6480', marginBottom: 4 };
  const inputStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 11px', border: `1px solid ${HAIR}`, borderRadius: 9, background: '#fff', color: INK, font: 'inherit', fontSize: 13.5, outline: 'none' };

  const renderInput = (f: TelaField) => {
    const v = draft[f.id] ?? '';
    const responseType = f.interaction?.responseType;
    if (responseType === 'ATTACHMENT') return <label style={{ ...inputStyle, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', color: v ? '#18765F' : '#6E6480', fontSize: 11, fontWeight: 800 }}><FileUp size={14}/>{uploadingField === f.id ? 'Uploading…' : v ? 'Attachment ready' : 'Attach a file'}<input type="file" hidden accept={(f.interaction?.allowedFileTypes || []).join(',')} onChange={event => void attach(f, event.target.files?.[0])}/></label>;
    if (responseType === 'AUDIO' || responseType === 'VIDEO') return <div><TelaMediaResponse kind={responseType} maxSeconds={f.interaction?.maxRecordingSeconds || 60} value={v} onChange={value => set(f.id, value)}/>{responseType === 'VIDEO' && <div style={{ marginTop: 6, position: 'relative' }}><Link2 size={12} style={{ position: 'absolute', left: 9, top: 10, color: '#8C8098' }}/><input value={v.startsWith('http') ? v : ''} onChange={event => set(f.id, event.target.value)} placeholder="Longer video? Paste a Reelo or other link" style={{ ...inputStyle, paddingLeft: 28, fontSize: 10.5 }}/></div>}</div>;
    if (responseType === 'LINK') return <input type="url" value={v} onChange={e => set(f.id, e.target.value)} placeholder="https://…" style={inputStyle}/>;
    if (responseType === 'LONG_TEXT') return <textarea value={v} onChange={e => set(f.id, e.target.value)} rows={5} style={{ ...inputStyle, height: 104, paddingTop: 9, resize: 'vertical' }}/>;
    if (f.type === 'CHECKBOX') {
      const on = v === '1';
      return (
        <button
          type="button"
          onClick={() => set(f.id, on ? '' : '1')}
          style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? 'var(--pj-purple,#6B0099)' : '#C9C2D6'}`, background: on ? 'var(--pj-purple,#6B0099)' : '#fff', cursor: 'pointer' }}
        >
          {on && <Check size={14} color="#fff" strokeWidth={3} />}
        </button>
      );
    }
    if (f.type === 'SELECT') {
      return (
        <select value={v} onChange={e => set(f.id, e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
          <option value="">Choose…</option>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <input
        type={f.type === 'DATE' ? 'date' : 'text'}
        inputMode={f.type === 'NUMBER' ? 'decimal' : undefined}
        value={v}
        onChange={e => set(f.id, e.target.value)}
        placeholder={f.type === 'NUMBER' ? '0' : ''}
        style={{ ...inputStyle, textAlign: f.type === 'NUMBER' ? 'right' : 'left', fontVariantNumeric: f.type === 'NUMBER' ? 'tabular-nums' : undefined }}
      />
    );
  };

  const checkWork = () => { if (base) setCheckedGrade(gradeTelaAssignment(base, draft)); };
  const feedbackFor = (field: TelaField) => {
    const result = checkedGrade?.fields.find(item => item.fieldId === field.id);
    if (!result) return null;
    const role = device.assignment?.previewRole || 'STUDENT';
    const feedback = visibleFieldFeedback(field, result, role);
    const color = feedback.tone === 'GOOD' ? '#087B65' : feedback.tone === 'WAIT' ? '#8A5A00' : '#B24220';
    return <div style={{ marginTop: 4, padding: '5px 7px', borderRadius: 7, background: `${color}12`, color, fontSize: 10.5, lineHeight: 1.35 }}><b>{feedback.label}</b>{feedback.detail ? ` · ${feedback.detail}` : ''}</div>;
  };

  // Worksheet posture: inputs occupy the exact regions detected on the page.
  // Printed labels remain in the underlying Vector/Image device, so this layer
  // is transparent and only supplies the interactive response surfaces.
  if (device.presentation === 'POSITIONED' && base) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', fontFamily: 'var(--font-sans,system-ui,sans-serif)' }}>
        {base.fields.filter(field => field.layout).map(field => {
          const box = field.layout!; const value = draft[field.id] ?? '';
          const common: React.CSSProperties = {
            position: 'absolute', left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`,
            minWidth: 18, minHeight: 18, boxSizing: 'border-box', pointerEvents: readOnly ? 'none' : 'auto',
            border: '1.5px solid rgba(0,168,188,.75)', borderRadius: Math.min(9, Math.max(3, box.h * .7)),
            background: 'rgba(255,255,255,.86)', color: INK, padding: '3px 7px', outline: 'none',
            fontSize: 'clamp(10px,1.45cqw,16px)', boxShadow: '0 1px 5px rgba(0,0,0,.08)',
          };
          if (field.interaction?.responseType === 'ATTACHMENT') return <label key={field.id} title={field.name} style={{ ...common, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', fontSize: 10, fontWeight: 800 }}><FileUp size={12}/>{uploadingField === field.id ? 'Uploading…' : value ? 'File ready' : 'Attach'}<input type="file" hidden onChange={event => void attach(field, event.target.files?.[0])}/></label>;
          if (field.interaction?.responseType === 'AUDIO' || field.interaction?.responseType === 'VIDEO') return <div key={field.id} style={{ ...common, height: 'auto', minHeight: 54, padding: 4, overflow: 'auto' }}><TelaMediaResponse kind={field.interaction.responseType} maxSeconds={field.interaction.maxRecordingSeconds || 60} value={value} onChange={next => set(field.id, next)}/></div>;
          if (field.type === 'CHECKBOX') return <button key={field.id} aria-label={field.name} title={field.name} disabled={readOnly} onClick={() => set(field.id, value === '1' ? '' : '1')} style={{ ...common, display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer' }}>{value === '1' && <Check size={15} color="#6B0099" strokeWidth={3}/>}</button>;
          if (field.type === 'SELECT') return <select key={field.id} aria-label={field.name} title={field.name} disabled={readOnly} value={value} onChange={e => set(field.id, e.target.value)} style={common}><option value="">Choose…</option>{(field.options || []).map(option => <option key={option}>{option}</option>)}</select>;
          if (box.h > 6) return <textarea key={field.id} aria-label={field.name} title={field.name} readOnly={readOnly} value={value} onChange={e => set(field.id, e.target.value)} style={{ ...common, resize: 'none' }} />;
          return <input key={field.id} aria-label={field.name} title={field.name} readOnly={readOnly} inputMode={field.type === 'NUMBER' ? 'decimal' : undefined} value={value} onChange={e => set(field.id, e.target.value)} style={common}/>;
        })}
        {checkedGrade && <div style={{ position: 'absolute', left: 14, bottom: 14, width: 'min(360px,58%)', maxHeight: 150, overflow: 'auto', pointerEvents: 'auto', padding: 10, borderRadius: 12, background: 'rgba(255,255,255,.96)', border: '1px solid rgba(107,0,153,.16)', boxShadow: '0 8px 26px rgba(31,20,41,.16)' }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#4D4359', marginBottom: 5 }}>{device.assignment?.previewRole === 'STUDENT' || !device.assignment?.previewRole ? 'Coaching for your next step' : `${checkedGrade.earned}/${checkedGrade.possible} points · ${checkedGrade.percent}%`}</div>
          {base.fields.map(field => <React.Fragment key={field.id}>{feedbackFor(field)}</React.Fragment>)}
        </div>}
        {!readOnly && base.fields.length > 0 && <div style={{ position: 'absolute', right: 14, bottom: 14, pointerEvents: 'auto', display: 'flex', gap: 7 }}>
          {device.assignment?.enabled && <button type="button" onClick={checkWork} style={{ height: 38, padding: '0 15px', borderRadius: 999, border: '1px solid rgba(107,0,153,.3)', color: '#6B0099', fontWeight: 850, fontSize: 11, cursor: 'pointer', background: '#fff' }}>Check my work</button>}
          <button type="button" onClick={submit} style={{ height: 38, padding: '0 18px', borderRadius: 999, border: 0, color: '#fff', fontWeight: 850, fontSize: 12, cursor: 'pointer', background: 'var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))', boxShadow: '0 7px 22px rgba(107,0,153,.25)' }}>{flash ? 'Submitted ✓' : 'Submit assignment'}</button>
        </div>}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'linear-gradient(180deg,#FBFAFD,#F3F0F8)', color: INK, fontFamily: 'var(--font-sans, system-ui, sans-serif)' }} className="custom-scrollbar">
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '26px 22px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, color: '#fff', background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}>
            <ClipboardList size={16} />
          </span>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.01em' }}>{device.title || (base ? `${base.name || 'Base'} form` : 'Form')}</span>
        </div>

        {!base ? (
          <div style={{ marginTop: 16, padding: 16, border: `1px dashed ${HAIR}`, borderRadius: 12, background: '#fff' }}>
            <div style={{ fontSize: 12.5, color: '#6E6480', marginBottom: 10 }}>This form isn’t connected yet. Point it at a Base in this canvas.</div>
            {bases.length ? (
              <div style={{ position: 'relative' }}>
                <select
                  defaultValue=""
                  onChange={e => e.target.value && onSetBase(e.target.value)}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="" disabled>Choose a Base…</option>
                  {bases.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: 11, pointerEvents: 'none', color: '#A398B4' }} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#A398B4' }}>No Base in this canvas yet — add a Base device first.</div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: '#A398B4', marginBottom: 16 }}>Writes a new row into <b style={{ color: '#6E6480' }}>{base.name || 'the base'}</b>.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {base.fields.map(f => (
                <label key={f.id} style={{ display: 'block' }}>
                  <span style={labelStyle}>{f.name}</span>
                  {renderInput(f)}
                  {feedbackFor(f)}
                </label>
              ))}
              {!base.fields.length && <div style={{ fontSize: 12, color: '#A398B4' }}>The linked Base has no fields yet.</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              {device.assignment?.enabled && <button type="button" disabled={readOnly || !base.fields.length} onClick={checkWork} style={{ flex: 1, height: 42, borderRadius: 11, border: '1px solid rgba(107,0,153,.25)', color: '#6B0099', fontWeight: 800, fontSize: 12, cursor: 'pointer', background: '#fff' }}>Check my work</button>}
              <button type="button" disabled={readOnly || !base.fields.length} onClick={submit} style={{ flex: 1.3, height: 42, borderRadius: 11, border: 'none', color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: '.01em', cursor: 'pointer', background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))', opacity: base.fields.length ? 1 : 0.5 }}>{flash ? 'Submitted ✓' : device.assignment?.enabled ? 'Submit assignment' : 'Submit'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TelaForm;
