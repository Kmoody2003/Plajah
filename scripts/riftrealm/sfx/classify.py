"""Label every event with the AudioSet AST classifier (top labels + music/speech share)."""
import json, os, numpy as np, soundfile as sf, torch
from scipy.signal import resample_poly
from transformers import ASTFeatureExtractor, ASTForAudioClassification
ROOT = 'D:/plajah-tmp/rift-sfx/'
M = 'MIT/ast-finetuned-audioset-10-10-0.4593'
fe = ASTFeatureExtractor.from_pretrained(M); model = ASTForAudioClassification.from_pretrained(M).eval()
dev = 'cuda' if torch.cuda.is_available() else 'cpu'; model.to(dev)
labels = model.config.id2label
ev = json.load(open(ROOT + 'events.json'))
MUSIC = {i for i, l in labels.items() if l in ('Music', 'Musical instrument', 'Orchestra', 'Drum', 'Electronic music', 'Soundtrack music', 'Background music', 'Synthesizer', 'Ambient music', 'Theme music')}
SPEECH = {i for i, l in labels.items() if l in ('Speech', 'Male speech, man speaking', 'Female speech, woman speaking', 'Narration, monologue', 'Conversation')}
n = 0
for slug, v in ev.items():
    x, sr = sf.read(ROOT + 'wav/' + slug + '.wav', always_2d=True)
    m = resample_poly(x.mean(1), 16000, sr).astype(np.float32)
    clips = [m[int(e['t0'] * 16000):int(e['t1'] * 16000)] for e in v['events']] + [m]
    for k, c in enumerate(clips):
        if len(c) < 1600: c = np.pad(c, (0, 1600 - len(c)))
        with torch.no_grad():
            p = torch.sigmoid(model(**{a: b.to(dev) for a, b in fe(c, sampling_rate=16000, return_tensors='pt').items()}).logits[0]).cpu().numpy()
        top = np.argsort(-p)[:5]
        tag = dict(labels=[[labels[int(i)], round(float(p[i]), 2)] for i in top], music=round(float(max(p[list(MUSIC)])), 2), speech=round(float(max(p[list(SPEECH)])), 2))
        if k < len(v['events']): v['events'][k].update(tag)
        else: v['whole'] = tag
        n += 1
json.dump(ev, open(ROOT + 'events.json', 'w'), indent=1)
print('classified', n, 'on', dev)
