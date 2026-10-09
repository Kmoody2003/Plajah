import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Mic, Play, Save, Square, Copy, FileAudio } from 'lucide-react';
import { Button, Chip, Input, Surface, Textarea } from '../ui';
import { newInterview } from '../../services/journalist/newsroomStore';
import { attributionLine, extractQuotes, formatTimestamp, parseTranscript, quoteBlocked, verifyQuote } from '../../services/journalist/quotes';
import type { InterviewRecord, InterviewTranscriptSegment, SourceAttribution, SourceContact } from '../../services/journalist/types';
import { useNewsroomList } from './useNewsroom';

type Rec = { start: number } | null;

export const InterviewNotes: React.FC = () => {
  const interviews = useNewsroomList<InterviewRecord>('newsroom_interviews');
  const sources = useNewsroomList<SourceContact>('newsroom_sources');
  const [title, setTitle] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [segments, setSegments] = useState<InterviewTranscriptSegment[]>([]);
  const [paste, setPaste] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [recording, setRecording] = useState<Rec>(null);
  const [elapsed, setElapsed] = useState(0);
  const [engine, setEngine] = useState<InterviewRecord['transcriptEngine']>('none');
  const [estimated, setEstimated] = useState(false);
  const [note, setNote] = useState('');
  const [check, setCheck] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<any>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const blobRef = useRef<Blob | null>(null);

  const source = sources.items.find(s => s.id === sourceId);
  const defaultAttr: SourceAttribution = source?.attribution || 'ON_RECORD';
  const SpeechRec = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((Date.now() - recording.start) / 1000), 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => { speechRef.current?.stop?.(); recorderRef.current?.stream?.getTracks().forEach(t => t.stop()); if (audioUrl) URL.revokeObjectURL(audioUrl); }, []); // eslint-disable-line

  const start = async () => {
    setNote('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        blobRef.current = blob;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start(1000);
      recorderRef.current = rec;
      const t0 = Date.now();
      setRecording({ start: t0 }); setElapsed(0); setSegments([]); setEngine('none'); setEstimated(false);
      if (SpeechRec) {
        const sr = new SpeechRec(); sr.continuous = true; sr.interimResults = false; sr.lang = 'en-US';
        sr.onresult = (ev: any) => {
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (!ev.results[i].isFinal) continue;
            const text = String(ev.results[i][0].transcript || '').trim(); if (!text) continue;
            const at = (Date.now() - t0) / 1000;
            setSegments(prev => [...prev, { start: Math.max(0, Math.round((at - Math.max(2, text.split(' ').length / 2.5)) * 10) / 10), end: Math.round(at * 10) / 10, text }]);
          }
        };
        sr.onend = () => { if (recorderRef.current?.state === 'recording') { try { sr.start(); } catch { /* already started */ } } };
        sr.onerror = () => undefined;
        sr.start(); speechRef.current = sr; setEngine('browser-speech');
      } else setNote('This browser has no live speech recognition. Record now, then paste or import a transcript below.');
    } catch (e) { setNote(e instanceof Error ? `Microphone unavailable: ${e.message}` : 'Microphone unavailable.'); }
  };
  const stop = () => {
    speechRef.current?.stop?.(); speechRef.current = null;
    recorderRef.current?.stop();
    if (recording) setDuration((Date.now() - recording.start) / 1000);
    setRecording(null);
  };

  const importPaste = () => {
    const r = parseTranscript(paste, duration);
    setSegments(r.segments); setEstimated(r.estimated); setEngine('manual');
    if (r.estimated) setNote('Some lines had no timestamps; their times are ESTIMATED and spread across the recording. Check them against the audio before relying on a timestamp.');
  };

  const quotes = useMemo(() => extractQuotes(segments, { sourceId: sourceId || undefined, defaultAttribution: defaultAttr }), [segments, sourceId, defaultAttr]);
  const seek = (sec: number) => { const a = audioEl.current; if (a) { a.currentTime = sec; void a.play(); } };
  const verify = verifyQuote(check, segments);

  const saveInterview = async () => {
    const rec = newInterview(title.trim() || 'Untitled interview', { sourceId: sourceId || undefined, durationSec: Math.round(duration || segments[segments.length - 1]?.end || 0), segments, transcriptEngine: engine, audioRef: audioUrl ? 'this-device-only' : undefined });
    await interviews.save(rec); setNote('Transcript saved to your account (owner-only). The audio file was NOT uploaded; keep your own copy.');
  };
  const [busy, setBusy] = useState(false);
  const transcribeWithGemini = async () => {
    const blob = blobRef.current; if (!blob) return;
    if (!window.confirm('This sends the recording to Google (Gemini) to be transcribed. Do not do this for an off-the-record or sensitive source. Continue?')) return;
    setBusy(true); setNote('');
    try {
      const b64: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
      const { transcribeSpeech } = await import('../../services/geminiService');
      const text = await transcribeSpeech(b64, blob.type || 'audio/webm');
      if (!text.trim()) { setNote('The transcription service returned nothing (it may not be configured). Paste a transcript instead.'); return; }
      const r = parseTranscript(text.split(/(?<=[.!?])\s+/).join(String.fromCharCode(10)), duration);
      setSegments(r.segments); setEstimated(true); setEngine('gemini');
      setNote('Machine transcript with ESTIMATED timestamps (the service gives text, not timings). Check every quote against the audio before it runs.');
    } catch (e) { setNote(e instanceof Error ? e.message : 'Transcription failed.'); }
    finally { setBusy(false); }
  };
  const downloadAudio = () => { if (!blobRef.current) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blobRef.current); a.download = `${(title || 'interview').replace(/\W+/g, '-')}.webm`; a.click(); };

  return (
    <div className="flex flex-col gap-4">
      <Surface level={2} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Input label="Interview title" value={title} onChange={e => setTitle(e.target.value)} className="flex-1 min-w-[200px]" />
          <label className="flex flex-col gap-1 text-sm min-w-[200px]">Source
            <select className="pj-input" value={sourceId} onChange={e => setSourceId(e.target.value)}>
              <option value="">Unlinked</option>
              {sources.items.map(s => <option key={s.id} value={s.id}>{s.confidential ? '(confidential) ' : ''}{s.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs flex gap-2 items-start rounded-xl p-2" style={{ background: 'rgba(255,140,0,.08)', color: '#FF8C00' }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Live transcription uses your browser's speech service. In Chrome and Edge that sends the audio to Google or Microsoft. For a sensitive source, record only and transcribe offline, then paste the text below.
        </p>
        <div className="pj-actions">
          {!recording ? <Button variant="accent" icon={<Mic />} onClick={start}>Record{SpeechRec ? ' + live transcript' : ''}</Button> : <Button variant="danger" icon={<Square />} onClick={stop}>Stop ({formatTimestamp(elapsed)})</Button>}
          {blobRef.current && <Button variant="secondary" icon={<FileAudio />} onClick={downloadAudio}>Save audio file</Button>}
          {blobRef.current && !recording && <Button variant="outline" loading={busy} onClick={transcribeWithGemini}>Transcribe with Gemini</Button>}
          <Button variant="primary" icon={<Save />} onClick={saveInterview} disabled={!segments.length}>Save transcript</Button>
        </div>
        {audioUrl && <audio ref={audioEl} src={audioUrl} controls className="w-full" onLoadedMetadata={e => { const d = (e.target as HTMLAudioElement).duration; if (isFinite(d) && d > 0) setDuration(d); }} />}
        {note && <p role="status" className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{note}</p>}
      </Surface>

      <Surface level={1} className="flex flex-col gap-2">
        <Textarea label="Paste a transcript (e.g. [01:23] Lee: text, or one line per statement)" rows={4} value={paste} onChange={e => setPaste(e.target.value)} />
        <div><Button variant="secondary" onClick={importPaste} disabled={!paste.trim()}>Import transcript</Button></div>
      </Surface>

      {segments.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Surface level={1} className="flex flex-col gap-2">
            <p className="pj-eyebrow">Transcript {estimated && <Chip style={{ color: '#FF8C00' }}>estimated times</Chip>}</p>
            <ol className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto text-sm">
              {segments.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <button type="button" className="text-[11px] font-mono shrink-0 w-12 text-left hover:underline" style={{ color: 'var(--pj-cyan)' }} onClick={() => seek(s.start)} aria-label={`Play from ${formatTimestamp(s.start)}`}>{formatTimestamp(s.start)}</button>
                  <span>{s.speaker && <strong>{s.speaker}: </strong>}{s.text}</span>
                </li>
              ))}
            </ol>
          </Surface>
          <Surface level={1} className="flex flex-col gap-3">
            <p className="pj-eyebrow">Suggested quotes</p>
            <p className="text-[11px]" style={{ color: 'var(--on-surface-variant)' }}>Pulled by rule (complete, first-person, not a question). They are suggestions; you choose what runs. Each links to its moment in the recording and to the source.</p>
            {quotes.length === 0 && <p className="text-sm opacity-60">No quotable passages found yet.</p>}
            {quotes.map(q => {
              const blocked = quoteBlocked(q);
              return (
                <div key={q.id} className="rounded-xl p-2 text-sm flex flex-col gap-1" style={{ background: 'var(--pj-glass-2, rgba(255,255,255,.04))', opacity: blocked ? 0.6 : 1 }}>
                  <p>&ldquo;{q.text}&rdquo;</p>
                  <p className="text-[11px] flex flex-wrap gap-2 items-center" style={{ color: 'var(--on-surface-variant)' }}>
                    <button type="button" className="hover:underline inline-flex items-center gap-1" onClick={() => seek(q.startSec)}><Play size={10} />{formatTimestamp(q.startSec)}</button>
                    <span>{q.attribution.replace('_', ' ').toLowerCase()}</span>
                    {source && <span>{source.confidential ? 'confidential source' : source.name}</span>}
                  </p>
                  {blocked ? <p className="text-xs" style={{ color: 'var(--pj-danger)' }}>{blocked}</p> : (
                    <Button size="xs" variant="secondary" icon={<Copy />} onClick={() => void navigator.clipboard?.writeText(`"${q.text}" ${attributionLine(q, source?.confidential ? undefined : source?.name, source?.role)} [${formatTimestamp(q.startSec)}]`.replace(/\s+\[/, ' ['))}>Copy with attribution</Button>
                  )}
                </div>
              );
            })}
            <Textarea label="Check a quote from your draft against the transcript" rows={2} value={check} onChange={e => setCheck(e.target.value)} />
            {check.trim() && (
              <p className="text-xs" style={{ color: verify.exact ? 'var(--pj-success)' : verify.score >= 0.8 ? '#FF8C00' : 'var(--pj-danger)' }}>
                {verify.exact ? `Verbatim match at ${formatTimestamp(verify.best!.start)}.` : verify.best ? `Not verbatim (${Math.round(verify.score * 100)}% of words match; closest is at ${formatTimestamp(verify.best.start)}). Fix the quote or mark the change.` : 'No match in this transcript.'}
              </p>
            )}
          </Surface>
        </div>
      )}
      {interviews.items.length > 0 && (
        <Surface level={1} className="flex flex-col gap-2">
          <p className="pj-eyebrow">Saved interviews</p>
          {interviews.items.sort((a, b) => b.recordedAt - a.recordedAt).map(i => (
            <div key={i.id} className="flex items-center gap-2 text-sm">
              <button type="button" className="flex-1 text-left hover:underline" onClick={() => { setTitle(i.title); setSourceId(i.sourceId || ''); setSegments(i.segments); setEngine(i.transcriptEngine); setDuration(i.durationSec); }}>{i.title} <span className="opacity-60">({new Date(i.recordedAt).toLocaleDateString()}, {i.segments.length} lines)</span></button>
              <Button size="xs" variant="danger-quiet" onClick={() => { if (window.confirm('Delete this saved transcript?')) void interviews.remove(i.id); }}>Delete</Button>
            </div>
          ))}
        </Surface>
      )}
    </div>
  );
};

export default InterviewNotes;
