// typoTextDriver — the studio side of typoText: keeps every channel current.
//
//   scripture   ProPresenter calls publishScriptureToTypo() when the verse on Program changes
//   lyrics      the song follower's line, else the playing file's synced line
//   transcript  rolling words from ANY live transcription session (word tap)
//   data        polls the configured URL
//
// When a song with no lyric file is playing and something wants its words (a
// typographic visualizer is up, or Song follow is listening), it transcribes
// the Ambo program mix — that is how "the lyrics of anything playing" are
// pulled with no lyric file at all.

import { claimTypoTextOwner, getTypoTextState, publishTypoChannel, subscribeTypoText, dataBodyToText } from './typoText';
import { subscribeTranscript, startLiveTranscription, type TranscriberHandle } from './liveTranscriber';
import { getLyricClock, lyricsFor } from './lyricFeed';
import { followerCurrentLine, getSongFollowState, installSongFollower } from './songFollower';

let demand = false;
/** ProPresenter: is a typographic visualizer on Program or Preview right now? */
export function setTypoTextDemand(on: boolean): void { demand = on; }

/** The verse on Program (lines joined) → the scripture channel. */
export function publishScriptureToTypo(content: { lines?: string[]; reference?: string } | null | undefined): void {
  if (!content) return;
  const text = (content.lines || []).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return;
  publishTypoChannel('scripture', { text, label: content.reference });
}

function playingLine(): { text: string; title: string } | null {
  for (const id of ['live', 'dj', 'bus'] as const) {
    const c = getLyricClock(id);
    const t = c?.track();
    if (!c || !t || !c.isPlaying()) continue;
    const lines = lyricsFor(t);
    if (!lines.length) continue;
    const pos = c.getTime();
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= pos) idx = i; else break; }
    if (idx >= 0) return { text: lines[idx].text, title: t.title };
  }
  return null;
}

/** A song is playing from a file that has no lyric file. */
function playingUnsynced(): boolean {
  for (const id of ['dj', 'bus'] as const) {
    const c = getLyricClock(id);
    const t = c?.track();
    if (c && t && c.isPlaying() && !lyricsFor(t).length) return true;
  }
  return false;
}

let started = false;

/** Studio window only. Idempotent; returns a stop function. */
export function startTypoTextDriver(): () => void {
  if (started) return () => {};
  started = true;
  claimTypoTextOwner();
  const unFollower = installSongFollower();

  // transcript channel — words from ANY live transcription session (mic, dj, playlist, program, system)
  let words: string[] = [];
  let lastPub = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const pub = () => { pending = null; lastPub = Date.now(); publishTypoChannel('transcript', { text: words.join(' ') }); };
  const unTap = subscribeTranscript(text => {
    words = words.concat(text.split(/\s+/).filter(Boolean)).slice(-24);
    if (Date.now() - lastPub > 250) pub();
    else if (!pending) pending = setTimeout(pub, 250);
  });

  // lyrics channel + playback / source transcription
  let pbHandle: TranscriberHandle | null = null;
  let pbStarting = false;
  let idleSince = 0;
  const tick = async () => {
    const f = followerCurrentLine();
    const line = f ?? playingLine();
    if (line) publishTypoChannel('lyrics', { text: line.text, label: line.title, adlib: (line as { adlib?: boolean }).adlib });

    const p = getTypoTextState().prefs;
    const reqSrc = p.transcribeAudioSource || 'auto';
    const want = (p.autoTranscribePlayback && (demand || getSongFollowState().listening) && playingUnsynced()) ||
                 (demand && reqSrc !== 'auto');
    if (want) {
      idleSince = 0;
      if (!pbHandle && !pbStarting) {
        pbStarting = true;
        try {
          const { amboAudio } = await import('./amboAudioEngine');
          let src: import('./liveTranscriber').TranscribeSource | null = null;
          if (reqSrc === 'playlist') {
            const s = amboAudio.channelStream('playlist');
            if (s) src = { kind: 'stream', stream: s };
          } else if (reqSrc === 'dj') {
            const s = amboAudio.channelStream('dj');
            if (s) src = { kind: 'stream', stream: s };
          } else if (reqSrc === 'mic') {
            src = { kind: 'mic' };
          } else {
            const s = amboAudio.programStream();
            if (s) src = { kind: 'stream', stream: s };
          }
          if (src) {
            pbHandle = await startLiveTranscription(src, { onWords: () => { /* via the tap */ } }, 'en-US', 'Playback lyrics');
          }
        } catch { /* the transcriber reports its own errors */ }
        pbStarting = false;
      }
    } else if (pbHandle) {
      // a short grace period so a track change doesn't tear the session down and rebuild it
      if (!idleSince) idleSince = Date.now();
      if (Date.now() - idleSince > 4000) { try { pbHandle.stop(); } catch { /* */ } pbHandle = null; idleSince = 0; }
    }
  };
  const timer = setInterval(() => { void tick(); }, 300);

  // data channel
  let dataTimer: ReturnType<typeof setTimeout> | null = null;
  let dataKey = '';
  const pollData = async () => {
    const { dataUrl, dataPath, dataIntervalSec } = getTypoTextState().prefs;
    if (dataTimer) { clearTimeout(dataTimer); dataTimer = null; }
    if (!dataUrl.trim()) return;
    try {
      let res: Response;
      try { res = await fetch(dataUrl, { cache: 'no-store' }); }
      catch { res = await fetch(`/api/proxy?url=${encodeURIComponent(dataUrl)}`, { cache: 'no-store' }); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      publishTypoChannel('data', { text: dataBodyToText(await res.text(), dataPath), label: dataUrl });
    } catch (e) {
      publishTypoChannel('data', { text: getTypoTextState().data.text, label: dataUrl, error: String((e as Error)?.message || e) });
    }
    dataTimer = setTimeout(() => { void pollData(); }, Math.max(5, dataIntervalSec) * 1000);
  };
  const unPrefs = subscribeTypoText(() => {
    const p = getTypoTextState().prefs;
    const k = `${p.dataUrl}|${p.dataPath}|${p.dataIntervalSec}`;
    if (k !== dataKey) { dataKey = k; void pollData(); }
  });
  const p0 = getTypoTextState().prefs;
  dataKey = `${p0.dataUrl}|${p0.dataPath}|${p0.dataIntervalSec}`;
  void pollData();

  return () => {
    started = false;
    clearInterval(timer);
    if (pending) clearTimeout(pending);
    if (dataTimer) clearTimeout(dataTimer);
    unTap(); unPrefs(); unFollower();
    try { pbHandle?.stop(); } catch { /* */ }
  };
}
