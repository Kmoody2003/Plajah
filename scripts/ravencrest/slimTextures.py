"""Re-encode Ravencrest's oversized loose JPEG textures in place (same name, same pixel size).

    python scripts/ravencrest/slimTextures.py [--dry] <dir>...

Poly Haven ships its 2k maps at near-lossless quality (3-5 MB each); at q88 (normals q92, 4:4:4 so the
packed AO/roughness/metal channels keep their detail) they look the same in game at a third of the
bytes. Only JPEGs over --min bytes (default 1 MB) are touched. Originals are copied once to
games/ravencrest/assets-src/fullres/<path under assets/> (git-ignored) and always re-encoded from there.
"""
import io, os, shutil, sys
from PIL import Image, ImageFile

ImageFile.MAXBLOCK = 1 << 26
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, 'public', 'games', 'ravencrest', 'assets')
FULLRES = os.path.join(ROOT, 'games', 'ravencrest', 'assets-src', 'fullres')


def slim(path, dry):
    rel = os.path.relpath(os.path.abspath(path), ASSETS)
    backup = os.path.join(FULLRES, rel)
    src = backup if os.path.exists(backup) else path
    im = Image.open(src)
    im.load()
    buf = io.BytesIO()
    im.convert('RGB').save(buf, 'JPEG', quality=92 if '_nor' in path else 88, subsampling=0, optimize=True)
    before = os.path.getsize(path)
    if len(buf.getvalue()) >= before:
        return 0
    print(f'{rel:70s} {before / 1e6:5.1f} -> {len(buf.getvalue()) / 1e6:4.1f} MB')
    if not dry:
        if not os.path.exists(backup):
            os.makedirs(os.path.dirname(backup), exist_ok=True)
            shutil.copy2(path, backup)
        open(path, 'wb').write(buf.getvalue())
    return before - len(buf.getvalue())


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    MIN = int(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 1_000_000
    saved = 0
    for d in [a for a in sys.argv[1:] if not a.startswith('--') and not a.isdigit()]:
        for root, _, files in os.walk(d):
            for f in files:
                p = os.path.join(root, f)
                if f.lower().endswith(('.jpg', '.jpeg')) and os.path.getsize(p) > MIN:
                    saved += slim(p, dry)
    print(f'saved {saved / 1e6:.1f} MB')
