"""Re-time the Ravencrest voice lines against the film's actual audio.

The comic's balloon timecodes are approximate (a panel spans seconds to minutes), so a clip cut at
them can catch the wrong words. For each line in clipVoices.LINES this transcribes a window around
the comic time with word timestamps (faster-whisper, CPU, base.en), finds the best fuzzy match for
the caption's words, and prints the corrected (t0, t1) — or NOT FOUND.

  python scripts/ravencrest/retimeVoices.py   → paste the printed LINES into clipVoices.py
"""
import difflib, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clipVoices import LINES, FF, SRC
from faster_whisper import WhisperModel

sys.stdout.reconfigure(encoding='utf-8')
PAD = 45
norm = lambda s: re.sub(r"[^a-z' ]", '', s.lower()).split()

model = WhisperModel('base.en', device='cpu', compute_type='int8')
tmp = tempfile.mkdtemp()
out = []
for vid, who, t0, t1, text in LINES:
    a = max(0, t0 - PAD)
    wav = os.path.join(tmp, f'{vid}.wav')
    subprocess.run([FF, '-v', 'error', '-y', '-ss', str(a), '-t', str(t1 - t0 + 2 * PAD), '-i', SRC, '-ac', '1', '-ar', '16000', wav], check=True)
    segs, _ = model.transcribe(wav, word_timestamps=True, language='en')
    words = [(w.word, a + w.start, a + w.end) for s in segs for w in s.words]
    want = norm(text)
    best = (0.0, None)
    toks = [norm(w[0])[0] if norm(w[0]) else '' for w in words]
    for i in range(len(words)):
        for L in range(max(1, len(want) - 2), len(want) + 3):
            seg = toks[i:i + L]
            if not seg: continue
            r = difflib.SequenceMatcher(None, want, seg).ratio()
            if r > best[0]: best = (r, (i, i + L))
    if best[1] and best[0] >= 0.72:
        i, j = best[1]
        s, e = words[i][1] - 0.15, words[j - 1][2] + 0.35
        heard = ' '.join(w[0].strip() for w in words[i:j])
        print(f'# {vid}: match {best[0]:.2f} "{heard}"')
        out.append(f"    ('{vid}', '{who}', {s:.2f}, {e:.2f}, {text!r}),")
    else:
        print(f'# {vid}: NOT FOUND (best {best[0]:.2f}) — dropped')
print('\nLINES = [')
print('\n'.join(out))
print(']')
