"""GPU-compress Apex's building textures to KTX2 (Basis Universal), written next to each source image as <name>.ktx2.

    python games/forth-horizon/tools/ktx_textures.py [dir ...]     (default: public/games/forth-horizon/ironport/textures-v3)

Stays block-compressed in video memory (BC7 on desktop GPUs, ASTC/ETC on phones): about 4x less VRAM than the RGBA a JPG unpacks to, and a fast transcode instead of a JPEG decode.
  *_base  colour  UASTC (high fidelity, facades are seen close up) + RDO + Zstandard, sRGB
  *_nrm   normals UASTC + RDO + Zstandard, linear
  *_rgh   rough   ETC1S (BasisLZ), linear
Needs KTX-Software `ktx` (KTX_BIN, default D:/Plajah Runtime/ktx/bin/ktx.exe). The game loads .ktx2 first and falls back to the JPG (src/ktx2.ts).
"""
import os, subprocess, sys, glob
from concurrent.futures import ThreadPoolExecutor

KTX = os.environ.get('KTX_BIN', r'D:\Plajah Runtime\ktx\bin\ktx.exe')
ROOT = 'public/games/forth-horizon/ironport/textures-v3'

def enc(path):
    out = os.path.splitext(path)[0] + '.ktx2'
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
        return path, 'skip'
    stem = os.path.splitext(os.path.basename(path))[0]
    linear = any(stem.endswith(k) for k in ('_nrm', '_normal', '_rgh', '_roughness', '_ao', '_orm', '_hgt'))
    colour = not linear
    args = [KTX, 'create', '--format', 'R8G8B8_SRGB' if colour else 'R8G8B8_UNORM', '--assign-tf', 'srgb' if colour else 'linear', '--generate-mipmap']
    if stem.endswith(('_rgh', '_roughness', '_ao')):
        args += ['--encode', 'basis-lz', '--clevel', '2', '--qlevel', '220']
    else:
        args += ['--encode', 'uastc', '--uastc-quality', '1', '--uastc-rdo', '--uastc-rdo-l', '2', '--zstd', '9']
    r = subprocess.run(args + [path, out], capture_output=True, text=True)
    return path, 'ok' if r.returncode == 0 else 'FAIL ' + (r.stderr or r.stdout).strip()[:200]

if __name__ == '__main__':
    args = sys.argv[1:] or [ROOT]
    files = []
    for a in args:
        if os.path.isfile(a): files.append(a)                                   # single images (jpg or png), e.g. the tiling detail maps in tex/
        else: files += glob.glob(os.path.join(a, '**', '*.jpg'), recursive=True)
    tot0 = tot1 = bad = 0
    with ThreadPoolExecutor(8) as pool:
        for p, s in pool.map(enc, files):
            if s.startswith('FAIL'): bad += 1; print(p, s)
    for f in files:
        k = os.path.splitext(f)[0] + '.ktx2'
        if os.path.exists(k): tot0 += os.path.getsize(f); tot1 += os.path.getsize(k)
    print(f'{len(files)} files, {bad} failed; jpg {tot0/1e6:.0f} MB -> ktx2 {tot1/1e6:.0f} MB on disk')
