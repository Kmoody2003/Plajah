"""Scatter forest trees from the satellite tile: dark-green pixels outside the city and off the water carry trees."""
import json, os
import cv2, numpy as np
REPO=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..",".."))
OUT=os.path.join(REPO,"public","games","apex","region")
SRC="D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22/Satellite_map_of_fictional_Michigan_728a143c.jpg"
img=cv2.imread(SRC); H,W=img.shape[:2]
hf=np.fromfile(os.path.join(OUT,"height.f32"),dtype=np.float32).reshape(H,W)
hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV).astype(int)
h,s,v=hsv[...,0],hsv[...,1],hsv[...,2]
forest=((h>=30)&(h<=90)&(s>45)&(v<118)).astype(np.uint8)
forest=cv2.morphologyEx(forest,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
dens=cv2.GaussianBlur(forest.astype(np.float32),(0,0),1.2)
rng=np.random.default_rng(31)
pts=[]
for y in range(2,H-2):
    for x in range(2,W-2):
        d=dens[y,x]
        if d<0.45 or hf[y,x]<1.2: continue
        if x>=1000 and 150<y<680: continue                 # the city
        n=int(round(d*2.4+rng.random()*0.9))
        for _ in range(n):
            px=(x+rng.random()-0.5)*12.0-W*6.0; pz=(y+rng.random()-0.5)*12.0-H*6.0
            nz=y/H
            conif=0.7 if (x<700 and y<230) else 0.3
            pts.append([round(px,1),round(pz,1),1 if rng.random()<conif else 0, round(0.75+rng.random()*0.5,2)])
rng.shuffle(pts)
pts=pts[:90000]
json.dump(pts,open(os.path.join(OUT,"forest.json"),"w"),separators=(",",":"))
print(len(pts),"forest trees")
