"""Minimal GLB reader/writer for asset repair scripts (accessors with or without byteStride)."""
import json, struct
import numpy as np

COMP = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl])
    bo = 20 + jl
    bl = struct.unpack_from('<I', b, bo)[0]
    return j, bytearray(b[bo + 8:bo + 8 + bl])


def accessor(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']])
    n = NCOMP[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or dt.itemsize * n
    out = np.ndarray(shape=(a['count'], n), dtype=dt, buffer=bytes(bin_), offset=off, strides=(stride, dt.itemsize))
    return np.array(out)


def buffer_view_bytes(j, bin_, i):
    bv = j['bufferViews'][i]
    o = bv.get('byteOffset', 0)
    return bytes(bin_[o:o + bv['byteLength']])


def write_glb(path, j, bin_, replace=None):
    """Rewrite the binary chunk, optionally replacing whole bufferViews ({index: bytes})."""
    replace = replace or {}
    out = bytearray()
    for i, bv in enumerate(j['bufferViews']):
        data = replace.get(i, buffer_view_bytes(j, bin_, i))
        while len(out) % 4:
            out.append(0)
        bv['byteOffset'] = len(out)
        bv['byteLength'] = len(data)
        out += data
    while len(out) % 4:
        out.append(0)
    j['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
