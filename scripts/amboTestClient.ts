import {
  startAutoScripture,
  stopAutoScripture,
  subscribeAutoScripture,
  getAutoScriptureState,
  setAutoScriptureSink,
  subscribeLiveFeed,
  getLiveFeed,
  subscribeScriptureReading,
  getScriptureReading,
  setAutoScripturePrefs,
  getLiveAudio,
  feedAutoScriptureSpeech,
  type AutoCue,
} from '../services/ambo/autoScripture';
import {
  activeTranscriptions,
  subscribeTranscriptionSessions,
  subscribeTranscript,
} from '../services/ambo/liveTranscriber';
import {
  startSongFollow,
  stopSongFollow,
  subscribeSongFollow,
  getSongFollowState,
  feedSongFollowMusicWords,
} from '../services/ambo/songFollower';
import { saveUserSong, listSongs } from '../services/ambo/songLibrary';

// Ensure "Way Maker" is in the song library alongside the built-in hymns ("Amazing Grace", etc.)
if (!listSongs().some(s => s.title.toLowerCase().includes('way maker'))) {
  saveUserSong({
    title: 'Way Maker',
    artist: 'Sinach',
    lines: [
      'You are here moving in our midst',
      'I worship You I worship You',
      'You are here working in this place',
      'I worship You I worship You',
      'Way maker miracle worker promise keeper',
      'Light in the darkness my God that is who You are',
    ],
    sections: [{ name: 'Verse 1', start: 0 }, { name: 'Chorus', start: 4 }],
  });
}

// Force 'auto' delivery in test harness so detected verses immediately fire to the Program screen
setAutoScripturePrefs({ delivery: 'auto', listenScripture: true, listenGiving: true, versesPerScreen: 1 });

let currentCue: AutoCue | null = null;
let deliveryLog: Array<{ time: string; mode: string; ref: string; text: string; latencyNote?: string }> = [];
let speechStartTime = 0;
let customAnalyser: AnalyserNode | null = null;

const $ = (id: string) => document.getElementById(id)!;

// Register sink to receive Auto-Scripture Program & Preview cues
setAutoScriptureSink({
  fire: (cue) => {
    const elapsed = speechStartTime ? `${((performance.now() - speechStartTime) / 1000).toFixed(2)}s` : 'live';
    currentCue = cue;
    deliveryLog.unshift({
      time: new Date().toLocaleTimeString(),
      mode: 'PROGRAM (AUTO)',
      ref: `${cue.reference} (${cue.translation.toUpperCase()})`,
      text: cue.lines.join(' '),
      latencyNote: elapsed,
    });
    renderProgramScreen();
    renderDeliveryLog();
  },
  cue: (cue) => {
    currentCue = cue;
    deliveryLog.unshift({
      time: new Date().toLocaleTimeString(),
      mode: 'PREVIEW (CUE)',
      ref: `${cue.reference} (${cue.translation.toUpperCase()})`,
      text: cue.lines.join(' '),
    });
    renderProgramScreen();
    renderDeliveryLog();
  },
  clear: () => {
    currentCue = null;
    renderProgramScreen();
  },
  giving: (mode) => {
    deliveryLog.unshift({
      time: new Date().toLocaleTimeString(),
      mode: `GIVING (${mode.toUpperCase()})`,
      ref: 'Tithes & Offerings Graphic',
      text: 'Giving intent triggered from spoken phrase',
    });
    renderDeliveryLog();
    return mode;
  },
});

function renderProgramScreen() {
  const refEl = $('program-ref');
  const bodyEl = $('program-body');
  const readBadge = $('reading-tracker-badge');
  const reading = getScriptureReading();

  if (!currentCue) {
    refEl.textContent = 'Waiting for spoken scripture reference…';
    bodyEl.innerHTML = `<span style="color:#64748b;font-style:italic;">Speak into your microphone or click a Real Audio Test Preset below (e.g. "Romans chapter 8 verse 28").</span>`;
    readBadge.textContent = 'Reading Tracker: Idle';
    readBadge.className = 'badge badge-muted';
    return;
  }

  refEl.textContent = `${currentCue.reference} · ${currentCue.translation.toUpperCase()}`;

  const fullText = currentCue.lines.join(' ');
  const rawWords = fullText.split(/\s+/).filter(Boolean);
  const activeIdx = reading && reading.refId === currentCue.refId ? reading.verseWordIndex : -1;

  if (reading && activeIdx >= 0) {
    readBadge.textContent = `Reading Tracker: Word ${activeIdx + 1} / ${reading.totalVerseWords} (${reading.reference})`;
    readBadge.className = 'badge badge-active';
  } else {
    readBadge.textContent = `Reading Tracker: Ready for "${currentCue.reference}" (speak verse text to highlight words & auto-advance)`;
    readBadge.className = 'badge badge-ready';
  }

  let spokenTokenCounter = -1;
  bodyEl.innerHTML = rawWords.map((w) => {
    const isVerseNum = /^\[\d+\]$/.test(w);
    if (isVerseNum) {
      return `<span class="verse-num">${w}</span>`;
    }
    spokenTokenCounter++;
    const idx = spokenTokenCounter;
    let cls = 'verse-word';
    if (activeIdx >= 0) {
      if (idx < activeIdx) cls += ' word-read';
      else if (idx === activeIdx) cls += ' word-current';
    }
    return `<span class="${cls}" data-idx="${idx}">${w}</span>`;
  }).join(' ');
}

function renderDeliveryLog() {
  const el = $('delivery-log');
  if (!deliveryLog.length) {
    el.innerHTML = `<div class="empty-note" style="color:#94a3b8;font-size:12px;">No scripture cues fired yet.</div>`;
    return;
  }
  el.innerHTML = deliveryLog.slice(0, 10).map(item => `
    <div class="log-item">
      <div class="log-item-head">
        <span class="log-badge">${item.mode}</span>
        <strong>${item.ref}</strong>
        <span class="log-time">${item.time}${item.latencyNote ? ` · ${item.latencyNote}` : ''}</span>
      </div>
      <div class="log-item-text">${item.text}</div>
    </div>
  `).join('');
}

// Raw transcript tap log
const rawTapLog: Array<{ mode: string; source: string; text: string; final: boolean; at: string }> = [];
function logTap(mode: string, source: string, text: string, final: boolean) {
  if (!text.trim()) return;
  rawTapLog.unshift({
    mode,
    source,
    text,
    final,
    at: new Date().toLocaleTimeString(),
  });
  const tapEl = $('signal-chain-tap');
  tapEl.innerHTML = rawTapLog.slice(0, 14).map(r => `
    <div class="tap-row">
      <span class="chain-pill chain-${r.mode}">${r.mode.toUpperCase()}</span>
      <span class="tap-src">${r.source}</span>
      <span class="tap-txt ${r.final ? 'tap-final' : 'tap-interim'}">${r.text}</span>
      <span class="tap-flag">${r.final ? 'FINAL' : 'PARTIAL'}</span>
    </div>
  `).join('');
}

subscribeTranscript((text, final, source, mode) => {
  logTap(mode || 'speech', source, text, final);
});

// Subscribe to AutoScripture state updates
subscribeAutoScripture(() => {
  const s = getAutoScriptureState();
  $('speech-status').textContent = s.status || (s.running ? 'Listening' : 'Off');
  $('speech-engine').textContent = s.engine ? `Engine: ${s.engine.toUpperCase()} (mode: 'speech')` : 'Engine: Idle';
  $('speech-heard').textContent = s.heard || '—';
  $('speech-error').textContent = s.error || '';
  $('speech-error').style.display = s.error ? 'block' : 'none';

  const pendEl = $('speech-pending');
  if (s.hearing) {
    pendEl.textContent = `Detecting: ${s.hearing.label} (${Math.round(s.hearing.confidence * 100)}%)`;
    pendEl.className = 'badge badge-active';
  } else {
    pendEl.textContent = 'No pending reference';
    pendEl.className = 'badge badge-muted';
  }

  const micBtn = $('btn-speech-mic') as HTMLButtonElement;
  if (s.running && !activeWavCancel) {
    micBtn.textContent = '⏹ Stop Live Mic (Speech Chain)';
    micBtn.className = 'btn btn-danger';
  } else {
    micBtn.textContent = '🎙 Start Live Mic (Speech Chain)';
    micBtn.className = 'btn btn-primary';
  }
});

subscribeScriptureReading(() => {
  renderProgramScreen();
});

subscribeLiveFeed(() => {
  const feed = getLiveFeed();
  const container = $('live-word-stream');
  if (!feed.words.length) {
    container.innerHTML = `<span style="color:#64748b;">Waiting for spoken words…</span>`;
    return;
  }
  container.innerHTML = feed.words.map(w => {
    const cls = w.tag ? `word-chip tag-${w.tag}` : 'word-chip';
    return `<span class="${cls}">${w.text}</span>`;
  }).join(' ');
});

function updateActiveChainsDisplay() {
  const speechSessions = activeTranscriptions('speech');
  const musicSessions = activeTranscriptions('music');
  $('active-speech-sessions').textContent = speechSessions.length ? speechSessions.join(', ') : (activeWavCancel ? 'WAV Speech Stream (speech)' : 'None');
  $('active-music-sessions').textContent = musicSessions.length ? musicSessions.join(', ') : 'None';
}
subscribeTranscriptionSessions(updateActiveChainsDisplay);
updateActiveChainsDisplay();

subscribeSongFollow(() => {
  const sf = getSongFollowState();
  $('music-status').textContent = sf.status || (sf.listening ? 'Listening' : 'Off');
  $('music-heard').textContent = sf.heard || '—';
  $('music-song').textContent = sf.title ? `${sf.title} (${sf.artist})` : 'Waiting for song match (3+ words)…';
  const activeEntry = sf.entry >= 0 && sf.entries[sf.entry] ? sf.entries[sf.entry].text : '—';
  $('music-line').textContent = activeEntry;

  const musicBtn = $('btn-music-mic') as HTMLButtonElement;
  if (sf.listening) {
    musicBtn.textContent = '⏹ Stop Music Signal Chain (Lyrics)';
    musicBtn.className = 'btn btn-danger';
  } else {
    musicBtn.textContent = '🎵 Start Music Signal Chain (Mic)';
    musicBtn.className = 'btn btn-music';
  }
});

// Live Waveform Scope
const scopeCanvas = $('speech-scope') as HTMLCanvasElement;
const scopeCtx = scopeCanvas.getContext('2d')!;
function drawScope() {
  const w = scopeCanvas.width;
  const h = scopeCanvas.height;
  scopeCtx.fillStyle = '#0f172a';
  scopeCtx.fillRect(0, 0, w, h);

  const analyser = customAnalyser || getLiveAudio().room.analyser;
  if (analyser) {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    scopeCtx.strokeStyle = '#38bdf8';
    scopeCtx.lineWidth = 2;
    scopeCtx.beginPath();
    const step = Math.ceil(buf.length / w);
    for (let x = 0; x < w; x++) {
      const s = buf[Math.min(buf.length - 1, x * step)] || 0;
      const y = h / 2 - s * (h * 0.45);
      if (x === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
  } else {
    scopeCtx.strokeStyle = '#1e293b';
    scopeCtx.lineWidth = 1;
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, h / 2);
    scopeCtx.lineTo(w, h / 2);
    scopeCtx.stroke();
  }
  requestAnimationFrame(drawScope);
}
requestAnimationFrame(drawScope);

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// ── Play Real Synthesized WAV Audio Stream into Speech Signal Chain ─────────
let activeWavCancel: (() => void) | null = null;
let wavSessionActive = false;

async function playRealWavIntoSpeechChain(spokenText: string) {
  if (activeWavCancel) {
    activeWavCancel();
    activeWavCancel = null;
  }
  stopAutoScripture();
  wavSessionActive = true;

  const statusBanner = $('wav-test-status');
  statusBanner.textContent = `Synthesizing 16kHz WAV speech & starting real-time Speech Signal Chain…`;
  statusBanner.style.display = 'block';

  try {
    // 1. Fetch real 16kHz mono WAV synthesized by Windows TTS (~150ms, cached)
    const res = await fetch(`/api/tts-wav?text=${encodeURIComponent(spokenText)}`);
    if (!res.ok) throw new Error(`TTS WAV error: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();

    // 2. Start playing the real WAV audio out of speakers IMMEDIATELY (0ms ASR delay!) with live waveform scope
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume();

    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    customAnalyser = analyser;

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(analyser);
    analyser.connect(ctx.destination);

    speechStartTime = performance.now();
    let cancelled = false;
    let es: EventSource | null = null;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    activeWavCancel = () => {
      if (cancelled) return;
      cancelled = true;
      wavSessionActive = false;
      timers.forEach(t => clearTimeout(t));
      customAnalyser = null;
      try { es?.close(); } catch { /* */ }
      try { src.stop(); } catch { /* */ }
      try { ctx.close(); } catch { /* */ }
      updateActiveChainsDisplay();
    };
    updateActiveChainsDisplay();

    statusBanner.textContent = `▶ Playing real WAV (${audioBuffer.duration.toFixed(1)}s) · Streaming live Speech Signal Chain ASR…`;
    src.start();

    // 3. Stream real-time SAPI speech recognition over the WAV file simultaneously
    es = new EventSource(`/api/ai/wav-speech-stream?text=${encodeURIComponent(spokenText)}`);
    let utteranceCount = 0;
    let totalWords = 0;
    let nextWordTimeMs = 0;
    const transcripts: string[] = [];

    const enqueueWordsPaced = (phrase: string) => {
      const words = phrase.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      totalWords += words.length;
      utteranceCount++;
      transcripts.push(phrase.trim());
      const elapsedMs = Math.round(performance.now() - speechStartTime);
      statusBanner.textContent = `▶ Playing real WAV (${audioBuffer.duration.toFixed(1)}s) · Speech ASR (${elapsedMs}ms): "${transcripts.join(' · ')}"`;

      // First utterance (typically the Scripture reference) feeds immediately so detection is <600ms!
      if (utteranceCount === 1) {
        logTap('speech', 'Speech SAPI + BibleGrammar', phrase.trim(), true);
        feedAutoScriptureSpeech(phrase.trim(), true);
        nextWordTimeMs = performance.now() + 140;
        return;
      }

      // Subsequent utterances (spoken verse reading) stream word-by-word at ~70ms cadence in sync with audio
      const now = performance.now();
      if (nextWordTimeMs < now) nextWordTimeMs = now;
      words.forEach((word, idx) => {
        const delay = Math.max(0, Math.round(nextWordTimeMs - now));
        nextWordTimeMs += 70;
        const isEnd = idx === words.length - 1;
        const t = setTimeout(() => {
          if (cancelled) return;
          logTap('speech', 'Speech SAPI Stream', word, isEnd);
          feedAutoScriptureSpeech(word, isEnd);
        }, delay);
        timers.push(t);
      });
    };

    es.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'final' && d.text) {
          enqueueWordsPaced(d.text);
        } else if (d.type === 'done') {
          try { es?.close(); } catch { /* */ }
        }
      } catch { /* */ }
    };
    es.onerror = () => {
      try { es?.close(); } catch { /* */ }
    };

    src.onended = () => {
      const endTimer = setTimeout(() => {
        if (!cancelled) {
          customAnalyser = null;
          statusBanner.textContent = `✓ Completed real WAV test (${totalWords} words recognized: "${transcripts.join(' ')}").`;
          updateActiveChainsDisplay();
        }
      }, 600);
      timers.push(endTimer);
    };
  } catch (err) {
    wavSessionActive = false;
    statusBanner.textContent = `Error: ${String((err as Error)?.message || err)}`;
  }
}

// ── Play Real Synthesized WAV Audio Stream into Music Signal Chain ──────────
async function playRealWavIntoMusicChain(sungText: string) {
  stopSongFollow();
  const statusBanner = $('wav-test-status');
  statusBanner.textContent = `Synthesizing WAV & starting Music Signal Chain (mode: 'music' · ONNX Whisper)…`;
  statusBanner.style.display = 'block';

  try {
    const res = await fetch(`/api/tts-wav?text=${encodeURIComponent(sungText)}`);
    const arrayBuf = await res.arrayBuffer();

    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume();
    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    src.start();

    statusBanner.textContent = `🎵 Playing Music Chain WAV (${audioBuffer.duration.toFixed(1)}s) · Running ONNX Whisper Music ASR…`;

    const audioBase64 = uint8ToBase64(new Uint8Array(arrayBuf));
    const capRes = await fetch('/api/ai/captions-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, kind: 'music' }),
    });
    const data = await capRes.json();
    const text = (data?.captions || []).map((c: any) => c.text).join(' ').trim();
    if (text) {
      statusBanner.textContent = `🎵 Music Chain ONNX Whisper (${data.latencyMs || 0}ms): "${text}"`;
      const words = text.split(/\s+/).filter(Boolean);
      words.forEach((w: string, idx: number) => {
        const isEnd = idx === words.length - 1;
        setTimeout(() => {
          logTap('music', 'Music ONNX Whisper', w, isEnd);
          feedSongFollowMusicWords(w, isEnd);
        }, idx * 90);
      });
    } else {
      statusBanner.textContent = `Music Chain returned empty transcript.`;
    }
  } catch (err) {
    statusBanner.textContent = `Music Chain Error: ${String((err as Error)?.message || err)}`;
  }
}

// Wire up UI buttons
$('btn-speech-mic').addEventListener('click', async () => {
  if (activeWavCancel || wavSessionActive) {
    if (activeWavCancel) {
      activeWavCancel();
      activeWavCancel = null;
    }
    wavSessionActive = false;
    stopAutoScripture();
    speechStartTime = performance.now();
    await startAutoScripture({ kind: 'mic' });
    return;
  }
  const s = getAutoScriptureState();
  if (s.running || s.starting) {
    stopAutoScripture();
  } else {
    speechStartTime = performance.now();
    await startAutoScripture({ kind: 'mic' });
  }
});

$('btn-music-mic').addEventListener('click', async () => {
  const sf = getSongFollowState();
  if (sf.listening || sf.starting) {
    stopSongFollow();
  } else {
    await startSongFollow({ kind: 'mic' });
  }
});

document.querySelectorAll('[data-speech-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-speech-preset') || '';
    if (text) void playRealWavIntoSpeechChain(text);
  });
});

$('btn-custom-speech').addEventListener('click', () => {
  const input = $('custom-speech-input') as HTMLInputElement;
  if (input.value.trim()) {
    void playRealWavIntoSpeechChain(input.value.trim());
  }
});

document.querySelectorAll('[data-music-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-music-preset') || '';
    if (text) void playRealWavIntoMusicChain(text);
  });
});

// Expose window.__amboTest for automated verification
(window as any).__amboTest = {
  playRealWavIntoSpeechChain,
  playRealWavIntoMusicChain,
  getAutoScriptureState,
  getScriptureReading,
  getSongFollowState,
  getDeliveryLog: () => deliveryLog,
  getRawTapLog: () => rawTapLog,
};

console.log('[AmboTestClient] Ready! Speech Signal Chain & Music Signal Chain initialized.');
