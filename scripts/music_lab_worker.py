"""Isolated, offline-only Melos worker. Launched by the authenticated Node job service.

Use a separate Python environment per engine. No weights are downloaded here.
The caller owns the temporary directory and removes it after reading artifacts.
"""
import io
import json
import os
from pathlib import Path
import sys


def midi_notes(data, bpm):
    import pretty_midi
    midi = pretty_midi.PrettyMIDI(io.BytesIO(data))
    return [dict(startBeats=n.start * bpm / 60,
                 lengthBeats=(n.end - n.start) * bpm / 60, key=n.pitch, vel=n.velocity)
            for instrument in midi.instruments if not instrument.is_drum for n in instrument.notes]


def abc_notes(abc):
    from music21 import converter, chord
    score = converter.parseData(abc, format='abc')
    notes = []
    for event in score.recurse().notes:
        pitches = event.pitches if isinstance(event, chord.Chord) else [event.pitch]
        length = float(event.duration.quarterLength)
        if length <= 0:
            continue
        for pitch in pitches:
            notes.append(dict(startBeats=float(event.getOffsetInHierarchy(score)),
                              lengthBeats=length, key=int(pitch.midi), vel=90))
    return notes


def run(directory):
    req = json.loads((directory / 'request.json').read_text(encoding='utf-8'))
    engine = req['engine']
    # Defence in depth: direct worker invocation also requires recorded evaluation permission.
    if engine in ('yue2', 'sheetsage2'):
        name = 'YUE2_EVALUATION_PERMISSION_REF' if engine == 'yue2' else 'SHEETSAGE2_EVALUATION_PERMISSION_REF'
        if not os.environ.get(name, '').strip():
            raise RuntimeError('Written evaluation permission pending')
    model_path = Path(req['model']).resolve(strict=True)
    if not model_path.is_dir():
        raise ValueError('A local model directory is required')
    import torch
    torch.manual_seed(req['seed'])
    result = {}
    if engine == 'heartmula':
        from heartlib import HeartMuLaGenPipeline
        lyrics = directory / 'lyrics.txt'
        tags = directory / 'tags.txt'
        lyrics.write_text(req['lyrics'] or '[Instrumental]', encoding='utf-8')
        tags.write_text(req['prompt'], encoding='utf-8')
        pipe = HeartMuLaGenPipeline.from_pretrained(
            str(model_path), device={'mula': torch.device('cuda'), 'codec': torch.device('cpu')},
            dtype={'mula': torch.bfloat16, 'codec': torch.float32}, version='3B', lazy_load=True)
        with torch.no_grad():
            pipe({'lyrics': str(lyrics), 'tags': str(tags)},
                 max_audio_length_ms=int(req['seconds'] * 1000),
                 save_path=str(directory / 'audio.mp3'), topk=50, temperature=1.0, cfg_scale=1.5)
        result['audio'] = 'audio.mp3'
    elif engine == 'yue2':
        from yue2 import YuE2Pipeline
        import soundfile
        args = dict(style=req['prompt'], lyrics=req['lyrics'] or '[Instrumental]', cot='full', seed=req['seed'])
        if req.get('abc'):
            args['abc'] = req['abc']
        vae_path = os.environ.get('MELOS_YUE2_VAE')
        if not vae_path:
            raise RuntimeError('MELOS_YUE2_VAE local directory is required')
        pipe = YuE2Pipeline.from_pretrained(str(model_path), vae=vae_path, local_files_only=True,
                                            device='cuda', progress=False)
        try:
            if req['kind'] == 'midi':
                plan = pipe.plan(**args)
                result['abc'] = plan.abc
                result['notes'] = abc_notes(plan.abc)
            else:
                song = pipe(**args)
                song.save_artifacts(str(directory / 'song'))
                abc_path = directory / 'song' / 'score.abc'
                if abc_path.exists():
                    result['abc'] = abc_path.read_text(encoding='utf-8')
                audio, sr = soundfile.read(str(directory / 'song' / 'audio.flac'))
                soundfile.write(str(directory / 'audio.wav'), audio, sr, subtype='PCM_16')
                result['audio'] = 'audio.wav'
                result['warning'] = 'YuE2 creates a new full recording; requested seconds are not an exact duration control.'
        finally:
            del pipe
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    elif engine == 'sheetsage2':
        import base64
        from transformers import AutoModel
        model = AutoModel.from_pretrained(str(model_path), trust_remote_code=True,
                                          local_files_only=True).eval().to('cuda')
        raw = model.transcribe(base64.b64decode(req['inputAudio'], validate=True))
        result['abc'] = raw['abc']
        result['notes'] = midi_notes(raw['midi'], req['bpm'])
    else:
        raise ValueError('Unsupported Python engine')
    (directory / 'result.json').write_text(json.dumps(result), encoding='utf-8')


if __name__ == '__main__':
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    run(Path(sys.argv[1]).resolve(strict=True))
