"""Call Plajah's built-in Tela engine directly for a car shell.

Uses the exact image_to_mesh function served by /tela3d/image-to-mesh;
there is no replacement model or alternate assembly pipeline.
Use the installed tela3d-py Python. --check verifies the installed backend only.
"""
import argparse
import base64
import faulthandler
import json
import os
from pathlib import Path
import sys

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')
sys.dont_write_bytecode = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--car', choices=['corsair', 'vanguard', 'aurelia', 'ironhide', 'badlands'])
    parser.add_argument('--frame', type=int, choices=range(8), default=0)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    faulthandler.dump_traceback_later(60, repeat=True)
    repo = Path(__file__).resolve().parents[3]
    cache = repo / '.cache' / 'tela-car'
    for name in ['numba', 'temp']:
        (cache / name).mkdir(parents=True, exist_ok=True)
    # Imported packages live in the read-only installed environment. Their working
    # caches and temporary files belong in this job's writable workspace instead.
    os.environ['NUMBA_CACHE_DIR'] = str(cache / 'numba')
    os.environ['TMP'] = os.environ['TEMP'] = str(cache / 'temp')
    sys.path.insert(0, str(repo / 'engines' / 'tela-3d'))
    print('Loading Plajah Tela 3D engine', flush=True)
    import tela3d_runtime as tela
    readiness = {'device': tela.DEVICE, 'hunyuanInstalled': tela.backend_available('hunyuan_mini'),
                 'backgroundRemoval': tela.rembg_available()}
    if tela.DEVICE == 'cuda':
        readiness['vramFreeMb'] = tela.torch.cuda.mem_get_info()[0] // 2 ** 20
    print(json.dumps(readiness), flush=True)
    if args.check:
        faulthandler.cancel_dump_traceback_later()
        return
    if not args.car:
        parser.error('--car is required for generation')
    if tela.DEVICE != 'cuda' or not readiness['hunyuanInstalled']:
        raise RuntimeError('The documented CUDA Hunyuan backend is not ready; no fallback shell will be generated')
    if readiness['vramFreeMb'] < 4800:
        raise RuntimeError('Hunyuan needs about 4.5 GB free VRAM; another GPU job may be resident')
    folder = Path(__file__).parent / args.car
    output = folder / f'hunyuan_f{args.frame}.glb'
    if output.exists():
        raise FileExistsError(f'Refusing to overwrite review shell: {output}')
    manifest_path = folder / 'intake.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    source = folder / 'views' / f'frame{args.frame}.png'
    from PIL import Image
    print(f'{args.car}: cleaning turntable frame {args.frame} with Tela cut_out', flush=True)
    with Image.open(source) as image:
        clean, method = tela.cut_out(image.convert('RGBA'))
    clean_path = folder / 'views' / f'cut{args.frame}.png'
    clean.save(clean_path)
    print(f'{args.car}: generating Hunyuan shell from cleaned frame ({method})', flush=True)
    result = tela.image_to_mesh({
        'image': 'data:image/png;base64,' + base64.b64encode(clean_path.read_bytes()).decode('ascii'),
        'backend': 'hunyuan_mini', 'quality': 'detail',
        'options': {'octreeResolution': 380, 'steps': 5, 'faceLimit': 60000, 'foregroundRatio': 0.92},
    })
    output.write_bytes(base64.b64decode(result.pop('glbBase64')))
    (folder / f'hunyuan_f{args.frame}.metrics.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    manifest['sourceShell'] = str(output.resolve())
    manifest['status'] = 'Tela shell generated; orientation, measurements and panel assembly pending'
    manifest.setdefault('cleanedFrames', [])
    if args.frame not in manifest['cleanedFrames']:
        manifest['cleanedFrames'].append(args.frame)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f"Saved {output}: {result['faces']} faces. Assembly and visual approval are pending.", flush=True)
    faulthandler.cancel_dump_traceback_later()


if __name__ == '__main__':
    main()
