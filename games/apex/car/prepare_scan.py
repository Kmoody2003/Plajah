"""Prepare another car for the Sovereign scan-surgery workflow, without inventing fit data.

Run with D:/Plajah Runtime/tela3d-py/Scripts/python.exe.
Example: prepare_scan.py --car corsair --video <turntable.mp4> --cutouts
Raw frames and the manifest remain in car/<id>/; only reviewed game assets ship.
"""
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
import cv2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--car', required=True, choices=['corsair', 'vanguard', 'aurelia', 'ironhide', 'badlands'])
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--cutouts', action='store_true')
    args = parser.parse_args()
    output = Path(__file__).parent / args.car
    views = output / 'views'
    views.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(args.video))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if count < 8:
        raise RuntimeError('Turntable must contain at least eight readable frames')
    frames = []
    for index in range(8):
        frame_number = round((count - 1) * index / 8)
        capture.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ok, image = capture.read()
        if not ok:
            raise RuntimeError(f'Could not read turntable frame {frame_number}')
        dest = views / f'frame{index}.png'
        if not cv2.imwrite(str(dest), image):
            raise RuntimeError(f'Could not save {dest}')
        frames.append({'index': index, 'sourceFrame': frame_number, 'file': dest.name})
    capture.release()
    print(f'{args.car}: saved eight source frames', flush=True)
    if args.cutouts:
        cache = Path(__file__).resolve().parents[3] / '.cache' / 'tela-car'
        for name in ['numba', 'temp']:
            (cache / name).mkdir(parents=True, exist_ok=True)
        os.environ['NUMBA_CACHE_DIR'] = str(cache / 'numba')
        os.environ['TMP'] = os.environ['TEMP'] = str(cache / 'temp')
        os.environ.setdefault('U2NET_HOME', r'D:\Plajah Models\u2net')
        from PIL import Image
        from rembg import new_session, remove
        session = new_session('u2net', providers=['CPUExecutionProvider'])
        for frame in frames:
            with Image.open(views / frame['file']) as source:
                remove(source, session=session).save(views / f"cut{frame['index']}.png")
            print(f"{args.car}: cleaned frame {frame['index']}", flush=True)
    manifest = {
        'id': args.car, 'status': 'intake; orientation and fit pending visual review',
        'sourceVideo': str(args.video.resolve()),
        'assembly': 'Claude Sovereign workflow: fresh cleaned frame to Hunyuan shell, then measured scan surgery and real parts',
        'sourceShell': None,
        'frames': frames, 'cutouts': args.cutouts,
        'fit': {'noseAxis': None, 'lengthMetres': None, 'wheels': None, 'panelPlanes': None, 'lampSurfaceHits': None},
        'review': {'side': None, 'front': None, 'rear': None, 'top': None, 'requiredSilhouette': 0.95},
        'next': ['Check turntable identity and nose axis', 'Measure this shell against side/front/rear/top views',
                 'Orient and scale shell', 'Measure wheel centres; do not copy GT-R positions',
                 'Cut hinged panels and glass from this shell', 'Ray-cast lamp hardware', 'Review all views'],
    }
    (output / 'intake.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f"{args.car}: eight turntable frames; shell generation and fit remain pending", flush=True)


if __name__ == '__main__':
    main()
