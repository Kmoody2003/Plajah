import React, { useEffect, useMemo, useState } from 'react';
import { X, Play, Download, FileText, Cpu, Cloud, ListChecks, Send, Trash2, Search, Loader2, HardDrive } from 'lucide-react';
import Portal from '../Portal';
import { auth } from '../../services/backendService';
import {
  loadCaptions, fetchCloudRecording, availableRecapLanes, writeRecap, publishRecap, cloudRecapEstimate,
  deleteCloudCopy, localCopyStreamId, type RecapLane,
} from '../../services/meetings/meetingRecording';
import {
  mergeTranscript, transcriptText, transcriptVtt, clock, type CaptionLine, type MeetingRecap, type MeetingRecording,
} from '../../services/meetings/meetingRecordingCore';
import { listLocalRecordings, assembleLocalRecording, downloadLocalRecording } from '../../services/localRecordingStore';

const saveText = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
const fileBase = (title: string) => title.replace(/[^\w.\- ]+/g, '_').trim() || 'meeting';

/** One recording: replay, transcript, and (for the host) the recap that gets posted to the room. */
const MeetingRecordingView: React.FC<{ roomId: string; recording: MeetingRecording; onClose: () => void }> = ({ roomId, recording: rec, onClose }) => {
  const isHost = auth.currentUser?.uid === rec.hostUid;
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [query, setQuery] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [localId, setLocalId] = useState<string | null>(null);
  const [lanes, setLanes] = useState<{ local: boolean; cloud: boolean; localModel?: string } | null>(null);
  const [draft, setDraft] = useState<MeetingRecap | null>(rec.recap || null);
  const [working, setWorking] = useState<RecapLane | 'post' | 'delete' | null>(null);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadCaptions(roomId, rec.id).then(setLines).catch(() => setLines([])); }, [roomId, rec.id]);
  useEffect(() => { if (isHost) availableRecapLanes().then(setLanes).catch(() => setLanes({ local: false, cloud: true })); }, [isHost]);
  useEffect(() => {
    const sid = localCopyStreamId(roomId, rec.id);
    listLocalRecordings().then(all => setLocalId(all.find(m => m.streamId === sid && m.bytes > 0)?.id || null)).catch(() => {});
  }, [roomId, rec.id]);
  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl); }, [mediaUrl]);

  const blocks = useMemo(() => mergeTranscript(lines || []), [lines]);
  const shownBlocks = query.trim() ? blocks.filter(b => `${b.name} ${b.text}`.toLowerCase().includes(query.trim().toLowerCase())) : blocks;
  const estimate = useMemo(() => cloudRecapEstimate(lines || []), [lines]);
  const hasCloud = rec.mode === 'CLOUD' && !!rec.segmentUrls?.length;

  const loadMedia = async () => {
    setLoadingMedia(true); setError('');
    try {
      const blob = localId ? await assembleLocalRecording(localId) : await fetchCloudRecording(rec);
      if (!blob) throw new Error('This recording has no saved media yet.');
      setMediaUrl(URL.createObjectURL(blob));
    } catch (e: any) { setError(e?.message || 'The recording could not be loaded.'); }
    finally { setLoadingMedia(false); }
  };

  const recap = async (lane: RecapLane) => {
    if (!lines) return;
    setWorking(lane); setError(''); setPosted(false);
    try { setDraft(await writeRecap(rec.title, lines, lane)); }
    catch (e: any) { setError(e?.message || 'The recap could not be written.'); }
    finally { setWorking(null); }
  };
  const post = async () => {
    if (!draft || !lines) return;
    setWorking('post'); setError('');
    try { await publishRecap(roomId, rec, draft, lines); setPosted(true); }
    catch (e: any) { setError(e?.message || 'The recap could not be posted.'); }
    finally { setWorking(null); }
  };
  const removeCloud = async () => {
    if (!window.confirm('Delete the cloud copy of this recording? The transcript and recap stay.')) return;
    setWorking('delete');
    try { await deleteCloudCopy(roomId, rec); onClose(); }
    catch (e: any) { setError(e?.message || 'The cloud copy could not be deleted.'); setWorking(null); }
  };

  const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40';

  return (
    <Portal>
      <div className="fixed inset-0 z-[330] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Recording: ${rec.title}`}>
        <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-[#111] border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-3 px-5 py-4 border-b border-white/10">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-black text-white truncate">{rec.title}</h2>
              <p className="text-[11px] text-white/50">
                {new Date(rec.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                {rec.durationSec ? ` · ${clock(rec.durationSec * 1000)}` : rec.status === 'RECORDING' ? ' · recording now' : ''}
                {` · recorded by ${isHost ? 'you' : rec.hostName}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-white/10"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            {/* Media */}
            <section className="flex flex-col gap-2">
              {mediaUrl ? (
                rec.kind === 'AUDIO'
                  ? <audio src={mediaUrl} controls className="w-full" />
                  : <video src={mediaUrl} controls playsInline className="w-full max-h-[40vh] rounded-2xl bg-black" />
              ) : (localId || hasCloud) ? (
                <button onClick={loadMedia} disabled={loadingMedia} className={`${btn} self-start bg-white text-black hover:bg-white/90`}>
                  {loadingMedia ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {loadingMedia ? 'Loading…' : 'Play recording'}
                </button>
              ) : (
                <p className="text-[12px] text-white/50 flex items-center gap-1.5"><HardDrive size={13} />
                  {rec.mode === 'LOCAL' ? `The video is saved on ${rec.hostName}'s device.` : rec.status === 'RECORDING' ? 'Still recording.' : 'The cloud copy was removed. The transcript is below.'}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {localId && <button onClick={() => downloadLocalRecording(localId, `${fileBase(rec.title)}.webm`)} className={`${btn} bg-white/[0.08] text-white hover:bg-white/[0.14]`}><Download size={13} /> Save file</button>}
                {isHost && hasCloud && <button onClick={removeCloud} disabled={working === 'delete'} className={`${btn} bg-white/[0.04] text-red-300 hover:bg-red-500/15`}><Trash2 size={13} /> Delete cloud copy</button>}
                {rec.expiresAt && hasCloud && <span className="text-[10px] text-white/40 self-center">Cloud copy kept until {new Date(rec.expiresAt).toLocaleDateString()}</span>}
              </div>
            </section>

            {/* Recap */}
            <section className="flex flex-col gap-2">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5"><ListChecks size={13} /> Recap</h3>
              {draft ? (
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col gap-3">
                  <p className="text-[13px] text-white/90 leading-relaxed">{draft.summary}</p>
                  {!!draft.actionItems.length && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">Action items</p>
                      <ul className="flex flex-col gap-1">
                        {draft.actionItems.map((a, i) => <li key={i} className="text-[12px] text-white/85">☐ {a.text}{a.owner ? <span className="text-white/45"> · {a.owner}</span> : null}</li>)}
                      </ul>
                    </div>
                  )}
                  {!!draft.decisions.length && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/45 mb-1">Decisions</p>
                      <ul className="flex flex-col gap-1">{draft.decisions.map((d, i) => <li key={i} className="text-[12px] text-white/85">• {d}</li>)}</ul>
                    </div>
                  )}
                  <p className="text-[10px] text-white/35">{draft.lane === 'local' ? 'Written on this PC.' : draft.lane === 'cloud' ? 'Written by Google Gemini.' : 'Quick recap, no AI: it picks out lines that sound like plans and decisions.'}</p>
                </div>
              ) : (
                <p className="text-[12px] text-white/50">{isHost ? 'No recap yet.' : `${rec.hostName} hasn't shared a recap yet.`}</p>
              )}
              {isHost && lines && (
                <div className="flex flex-wrap gap-2">
                  {lanes?.local && (
                    <button onClick={() => recap('local')} disabled={!!working || !lines.length} className={`${btn} bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25`}>
                      {working === 'local' ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />} Recap on this PC{lanes.localModel ? ` (${lanes.localModel})` : ''}
                    </button>
                  )}
                  <button onClick={() => recap('cloud')} disabled={!!working || !lines.length} className={`${btn} bg-white/[0.06] text-white hover:bg-white/[0.12]`}
                    title={`Sends the transcript (about ${estimate.tokens.toLocaleString()} tokens) to Google Gemini. Plajah pays.`}>
                    {working === 'cloud' ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />} Recap in the cloud · {estimate.usd == null ? 'under 1¢' : estimate.usd < 0.01 ? 'under 1¢' : `$${estimate.usd.toFixed(2)}`}
                  </button>
                  <button onClick={() => recap('rules')} disabled={!!working} className={`${btn} bg-white/[0.04] text-white/70 hover:bg-white/[0.1]`}>
                    <ListChecks size={13} /> Quick recap (no AI)
                  </button>
                  {draft && (
                    <button onClick={post} disabled={!!working || posted} className={`${btn} bg-small-orange text-white hover:bg-small-orange/80`}>
                      {working === 'post' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {posted ? 'Posted to chat' : 'Post recap to chat'}
                    </button>
                  )}
                </div>
              )}
              {isHost && !lanes?.local && <p className="text-[10px] text-white/40">The cloud recap sends only the transcript to Google Gemini. In the Plajah desktop app with a GPU, recaps run on your PC instead.</p>}
            </section>

            {/* Transcript */}
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5 mr-auto"><FileText size={13} /> Transcript</h3>
                {!!lines?.length && (
                  <>
                    <button onClick={() => saveText(`${fileBase(rec.title)}.txt`, transcriptText(blocks), 'text/plain')} className={`${btn} bg-white/[0.06] text-white hover:bg-white/[0.12]`}><Download size={12} /> .txt</button>
                    <button onClick={() => saveText(`${fileBase(rec.title)}.vtt`, transcriptVtt(lines), 'text/vtt')} className={`${btn} bg-white/[0.06] text-white hover:bg-white/[0.12]`}><Download size={12} /> Captions .vtt</button>
                  </>
                )}
              </div>
              {!!lines?.length && (
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input id="transcript-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the transcript"
                    className="w-full bg-white/[0.06] border border-white/10 rounded-xl pl-8 pr-3 py-2 text-[13px] text-white placeholder-white/30 outline-none focus:border-white/30" />
                </div>
              )}
              {lines === null ? <p className="text-[12px] text-white/40">Loading…</p>
                : !lines.length ? <p className="text-[12px] text-white/40">No one was captioned during this recording.</p>
                : (
                  <ol className="flex flex-col gap-2.5">
                    {shownBlocks.map((b, i) => (
                      <li key={i} className="text-[13px] leading-relaxed">
                        <span className="text-[10px] text-white/35 tabular-nums mr-2">{clock(b.at)}</span>
                        <span className="font-bold text-amber-200 mr-1.5">{b.name}</span>
                        <span className="text-white/85">{b.text}</span>
                      </li>
                    ))}
                    {!shownBlocks.length && <li className="text-[12px] text-white/40">Nothing matches “{query}”.</li>}
                  </ol>
                )}
            </section>
            {error && <p className="text-[12px] text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default MeetingRecordingView;
