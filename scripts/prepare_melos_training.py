"""Inventory local recordings and stage reviewed ACE-Step examples. No training or downloads.

Run with the ACE-Step Python environment (soundfile and numpy are already dependencies).
The source folder is read-only. Output is always a new directory.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys


def composition_label(stem):
    label = re.sub(r'^\d+\s*-\s*', '', stem).lower()
    label = re.sub(r'^k\s*-?\s*moody\s*-\s*', '', label)
    label = re.sub(r'[_ ]\d{4}-\d{2}-\d{2}.*$', '', label)
    label = re.sub(r'[- ]mastered[- ]file.*$', '', label)
    return label.strip()


def split_for(composition_id):
    bucket = int(hashlib.sha256(composition_id.encode('utf8')).hexdigest()[:8], 16) % 10
    return 'test' if bucket == 0 else 'validation' if bucket == 1 else 'train'


def inspect_audio(path):
    import numpy as np
    import soundfile as sf
    with sf.SoundFile(path) as audio:
        duration = len(audio) / audio.samplerate
        peak = square = samples = clipped = 0
        # Bounded inspection, not a full loudness, true-peak or mastering measurement.
        for fraction in np.linspace(0, .95, 9):
            audio.seek(min(int(len(audio) * fraction), max(0, len(audio) - 1)))
            data = audio.read(int(audio.samplerate * 2), dtype='float32', always_2d=True)
            if not np.isfinite(data).all():
                raise ValueError(f'Non-finite samples in {path.name}')
            peak = max(peak, float(np.max(np.abs(data), initial=0)))
            square += float(np.sum(data.astype('float64') ** 2))
            samples += data.size
            clipped += int(np.count_nonzero(np.abs(data) >= .9999))
        return dict(seconds=round(duration, 3), sampleRate=audio.samplerate,
                    channels=audio.channels, subtype=audio.subtype,
                    sampledPeak=peak, sampledRms=(square / max(samples, 1)) ** .5,
                    sampledNearFullScaleFraction=clipped / max(samples, 1),
                    measurement='Nine two-second windows; not integrated LUFS or true peak')


def inventory(source):
    entries = []
    for path in sorted(source.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in ('.wav', '.flac', '.mp3', '.ogg'):
            continue
        print(f'Inspecting {path.name}', flush=True)
        entries.append(dict(audio=str(path.resolve()), version=path.stem,
                            compositionId=composition_label(path.stem), split=None,
                            caption='', bpm=None, keyscale='', timesignature='4', language='',
                            lyrics='', vocalType='unreviewed', reviewed=False,
                            analysis=inspect_audio(path)))
    if not entries:
        raise ValueError('No supported audio files found')
    return dict(schemaVersion=1, source=str(source), targetGenres=['cinematic scoring', 'EDM', 'dubstep', 'hip-hop'],
                notes=['Every version remains a separate example.',
                       'Review compositionId to keep related versions in the same split.',
                       'Captions, BPM, keys, language and accurate lyrics require review before training.',
                       'Stereo masters alone do not provide isolated vocal, stem or MIDI supervision.'],
                entries=entries)


def validate_entries(manifest):
    entries = manifest.get('entries', [])
    if not entries:
        raise ValueError('The manifest has no recordings')
    groups = {}
    validated = []
    for entry in entries:
        if entry.get('reviewed') is not True:
            raise ValueError(f'Review annotations first: {entry.get("version", "unnamed")}')
        if not entry.get('caption', '').strip() or not entry.get('compositionId', '').strip():
            raise ValueError('Every example needs a reviewed caption and compositionId')
        bpm = entry.get('bpm')
        if not isinstance(bpm, (int, float)) or isinstance(bpm, bool) or not 30 <= bpm <= 300:
            raise ValueError('Every example needs a BPM between 30 and 300')
        if not re.fullmatch(r'[A-G](?:#|b)? (?:major|minor)', entry.get('keyscale', ''), re.I):
            raise ValueError('Every example needs a keyscale such as D minor')
        if entry.get('timesignature', '4') not in ('2', '3', '4', '6'):
            raise ValueError('Review timesignature: 2, 3, 4 or 6')
        if entry.get('vocalType') not in ('instrumental', 'lead', 'choir', 'mixed'):
            raise ValueError('Review vocalType: instrumental, lead, choir, or mixed')
        if entry['vocalType'] != 'instrumental' and (not entry.get('lyrics', '').strip() or not entry.get('language', '').strip()):
            raise ValueError('Vocal examples need reviewed lyrics and language')
        source = Path(entry['audio']).resolve(strict=True)
        if not source.is_file():
            raise ValueError('Audio path must be a file')
        split = entry.get('split') or split_for(entry['compositionId'])
        if split not in ('train', 'validation', 'test'):
            raise ValueError('Unknown dataset split')
        previous = groups.setdefault(entry['compositionId'], split)
        if previous != split:
            raise ValueError('Related song versions cannot cross training/evaluation splits')
        validated.append((entry, source, split))
    if {split for _, _, split in validated} != {'train', 'validation', 'test'}:
        raise ValueError('Assign at least one distinct composition to each train/validation/test split')
    return validated


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if bool(args.source) == bool(args.manifest):
        parser.error('Choose --source to inventory or --manifest to stage reviewed examples')
    if args.output.exists():
        raise ValueError('Output must be a new directory; existing files are never overwritten')
    if args.source:
        manifest = inventory(args.source.resolve(strict=True))
        args.output.mkdir(parents=True)
        (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf8')
        print(f'Inventoried {len(manifest["entries"])} recordings. No weights changed.', flush=True)
    else:
        manifest = json.loads(args.manifest.read_text(encoding='utf8'))
        validated = validate_entries(manifest)  # Validate all examples before writing anything.
        args.output.mkdir(parents=True)
        for i, (entry, source, split) in enumerate(validated):
            folder = args.output / split
            folder.mkdir(exist_ok=True)
            stem = f'{i:04d}'
            shutil.copyfile(source, folder / (stem + source.suffix.lower()))
            metadata = {key: entry.get(key, '4' if key == 'timesignature' else '')
                        for key in ('caption', 'bpm', 'keyscale', 'timesignature', 'language')}
            (folder / (stem + '.json')).write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf8')
            lyrics = '[Instrumental]' if entry['vocalType'] == 'instrumental' else entry['lyrics']
            (folder / (stem + '.lyrics.txt')).write_text(lyrics, encoding='utf8')
        (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
        print('Reviewed ACE-Step dataset staged. Preprocess/train only the train directory; reserve validation/test.')


if __name__ == '__main__':
    main()
