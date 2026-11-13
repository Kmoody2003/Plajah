"""Isolated, offline-only Melos worker. Launched by the authenticated Node job service.

Use a separate Python environment per engine. No weights are downloaded here.
The caller owns the temporary directory and removes it after reading artifacts.
"""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import shutil
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


def _soulx_language(tag):
    raw = str(tag or 'en').strip().lower()
    if raw in ('zh', 'cmn', 'zh-cn', 'zh-tw', 'mandarin'):
        return 'Mandarin', 'zh'
    if raw in ('yue', 'zh-hk', 'cantonese'):
        return 'Cantonese', 'yue'
    return 'English', 'en'


def _resolve_soulx_paths(model_path):
    """Resolve SoulX-Singer repo root, checkpoint (`model.pt`), config and phoneset.

    Follows the official `Soul-AILab/SoulX-Singer` layout (`example/infer.sh` and `cli/inference.py`):
    - checkpoint: `pretrained_models/SoulX-Singer/model.pt` (or `model_path / 'model.pt'`)
    - config: `soulxsinger/config/soulxsinger.yaml`
    - phoneset: `soulxsinger/utils/phoneme/phone_set.json`
    """
    env_root = os.environ.get('MELOS_SOULX_SINGER_ROOT', '').strip()
    if env_root:
        repo_root = Path(env_root).resolve(strict=True)
    elif (model_path / 'soulxsinger').is_dir():
        repo_root = model_path
    elif (model_path.parent.parent / 'soulxsinger').is_dir():
        repo_root = model_path.parent.parent
    else:
        repo_root = model_path

    if (model_path / 'model.pt').is_file():
        ckpt_file = model_path / 'model.pt'
    elif (repo_root / 'pretrained_models' / 'SoulX-Singer' / 'model.pt').is_file():
        ckpt_file = repo_root / 'pretrained_models' / 'SoulX-Singer' / 'model.pt'
    elif (repo_root / 'pretrained_models' / 'soulx-singer' / 'model.pt').is_file():
        ckpt_file = repo_root / 'pretrained_models' / 'soulx-singer' / 'model.pt'
    else:
        raise FileNotFoundError('SoulX-Singer model.pt checkpoint not found in configured directory')

    config_path = repo_root / 'soulxsinger' / 'config' / 'soulxsinger.yaml'
    phoneset_path = repo_root / 'soulxsinger' / 'utils' / 'phoneme' / 'phone_set.json'
    if not config_path.is_file() or not phoneset_path.is_file():
        raise FileNotFoundError('SoulX-Singer config/soulxsinger.yaml or phone_set.json not found')
    return repo_root, ckpt_file, config_path, phoneset_path


def _build_soulx_notes(raw_notes, note_cls, silence_threshold_sec):
    """Convert `VocalRegenRequest.notes` into `preprocess.tools.midi_parser.Note` entries."""
    ordered = sorted(raw_notes, key=lambda item: float(item['startSec']))
    out = []
    prev_end = 0.0
    prev_text = 'la'
    for item in ordered:
        start_s = max(prev_end, float(item['startSec']))
        dur_s = float(item['lengthSec'])
        if dur_s <= 0:
            continue
        gap = start_s - prev_end
        if gap > silence_threshold_sec or (prev_end == 0.0 and start_s > 0.0):
            out.append(note_cls(start_s=prev_end, note_dur=gap, note_text='<SP>', note_pitch=0, note_type=1))
        elif out and start_s > out[-1].start_s:
            out[-1].note_dur = start_s - out[-1].start_s

        raw_syl = str(item.get('syllable') or '').strip()
        if raw_syl == '<SP>':
            text, pitch, note_type = '<SP>', 0, 1
        elif raw_syl in ('', '-'):
            # Melisma / slur continuation (`note_type = 3` in `preprocess/tools/midi_parser.py`).
            text, pitch, note_type = prev_text, int(item['key']), 3
        else:
            text, pitch, note_type = raw_syl, int(item['key']), 2
            prev_text = raw_syl
        out.append(note_cls(start_s=start_s, note_dur=dur_s, note_text=text, note_pitch=pitch, note_type=note_type))
        prev_end = start_s + dur_s
    return out


def run(directory):
    req = json.loads((directory / 'request.json').read_text(encoding='utf-8'))
    engine = req['engine']
    # Defence in depth: direct worker invocation also requires recorded evaluation permission.
    if engine in ('yue2', 'sheetsage2', 'soulx-singer'):
        env_map = {
            'yue2': 'YUE2_EVALUATION_PERMISSION_REF',
            'sheetsage2': 'SHEETSAGE2_EVALUATION_PERMISSION_REF',
            'soulx-singer': 'SOULX_SINGER_EVALUATION_PERMISSION_REF',
        }
        if not os.environ.get(env_map[engine], '').strip():
            raise RuntimeError('Written evaluation permission pending')
    model_path = Path(req['model']).resolve(strict=True)
    if not model_path.is_dir():
        raise ValueError('A local model directory is required')
    import torch
    torch.manual_seed(req['seed'])
    result = {}
    if engine in ('heartmula', 'heartmula-rl-3b'):
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
    elif engine == 'soulx-singer':
        # Official Soul-AILab/SoulX-Singer entry points (`cli/inference.py`, `webui.py`,
        # `preprocess/tools/midi_parser.py`). Unverified against real weights on this machine.
        repo_root, ckpt_file, config_path, phoneset_path = _resolve_soulx_paths(model_path)
        if str(repo_root) not in sys.path:
            sys.path.insert(0, str(repo_root))
        from cli.inference import build_model, process as soulx_process
        from preprocess.tools.midi_parser import Note, SILENCE_THRESHOLD_SEC, notes2meta
        from soulxsinger.utils.file_utils import load_config

        soulx_lang, lang_prefix = _soulx_language(req.get('vocalLanguage'))
        notes = _build_soulx_notes(req.get('vocalNotes') or [], Note, SILENCE_THRESHOLD_SEC)
        if not notes:
            raise ValueError('SoulX-Singer received no playable notes')
        target_meta_path = directory / 'target_metadata.json'
        notes2meta(notes, str(target_meta_path), vocal_file=None, language=soulx_lang, pitch_extractor=None)

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        if req.get('referenceAudio'):
            prompt_wav_path = directory / 'prompt_voice.wav'
            prompt_wav_path.write_bytes(base64.b64decode(req['referenceAudio'], validate=True))
            override_meta = os.environ.get('MELOS_SOULX_PROMPT_META', '').strip()
            if override_meta:
                prompt_meta_path = Path(override_meta).resolve(strict=True)
            else:
                from preprocess.pipeline import PreprocessPipeline
                prompt_meta_dir = directory / 'prompt_transcriptions'
                prompt_meta_dir.mkdir(parents=True, exist_ok=True)
                preprocess = PreprocessPipeline(
                    device=device,
                    language=soulx_lang,
                    save_dir=str(prompt_meta_dir),
                    vocal_sep=False,
                    max_merge_duration=30000,
                )
                preprocess.run(
                    audio_path=str(prompt_wav_path),
                    vocal_sep=False,
                    max_merge_duration=30000,
                    language=soulx_lang,
                )
                prompt_meta_path = prompt_meta_dir / 'metadata.json'
        else:
            env_wav = os.environ.get('MELOS_SOULX_PROMPT_WAV', '').strip()
            env_meta = os.environ.get('MELOS_SOULX_PROMPT_META', '').strip()
            if env_wav and env_meta:
                prompt_wav_path = Path(env_wav).resolve(strict=True)
                prompt_meta_path = Path(env_meta).resolve(strict=True)
            else:
                prompt_wav_path = (repo_root / 'example' / 'audio' / f'{lang_prefix}_prompt.mp3').resolve(strict=True)
                prompt_meta_path = (repo_root / 'example' / 'audio' / f'{lang_prefix}_prompt.json').resolve(strict=True)

        use_fp16 = device.startswith('cuda')
        save_dir = directory / 'soulx_out'
        args = argparse.Namespace(
            device=device,
            model_path=str(ckpt_file),
            config=str(config_path),
            prompt_wav_path=str(prompt_wav_path),
            prompt_metadata_path=str(prompt_meta_path),
            target_metadata_path=str(target_meta_path),
            phoneset_path=str(phoneset_path),
            save_dir=str(save_dir),
            auto_shift=bool(req.get('autoShift', True)),
            pitch_shift=int(req.get('pitchShift', 0)),
            control='score',
            fp16=use_fp16,
            use_fp16=use_fp16,
        )
        cfg = load_config(args.config)
        svs_model = build_model(
            model_path=args.model_path,
            config=cfg,
            device=args.device,
            use_fp16=args.use_fp16,
        )
        try:
            soulx_process(args, cfg, svs_model)
        finally:
            del svs_model
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        generated_wav = save_dir / 'generated.wav'
        if not generated_wav.is_file():
            raise RuntimeError('SoulX-Singer finished without producing generated.wav')
        shutil.copy2(generated_wav, directory / 'audio.wav')
        result['audio'] = 'audio.wav'
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
