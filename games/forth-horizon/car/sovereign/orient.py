import sys, numpy as np, trimesh
src, out, ry = sys.argv[1], sys.argv[2], float(sys.argv[3])
sc = trimesh.load(src, force="scene"); m = trimesh.util.concatenate(list(sc.geometry.values()))
m.apply_transform(trimesh.transformations.rotation_matrix(np.radians(ry), [0, 1, 0]))
b = m.bounds; L = b[1] - b[0]
print("bounds size", L.round(3))
s = 4.78 / L[2]
m.apply_scale(s)
b = m.bounds
m.apply_translation([-(b[0][0] + b[1][0]) / 2, -b[0][1], -(b[0][2] + b[1][2]) / 2])
print("final size", (m.bounds[1] - m.bounds[0]).round(3))
m.export(out)
