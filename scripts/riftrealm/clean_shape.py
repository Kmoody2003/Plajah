import sys,trimesh
m=trimesh.load(sys.argv[1],force='mesh'); m.merge_vertices()
p=sorted(m.split(only_watertight=False),key=lambda q:q.area,reverse=True)
print(len(m.faces),'faces',len(p),'pieces',p[0].area/m.area, m.extents)
p[0].export(sys.argv[2])
