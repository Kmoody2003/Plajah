import glob, os, json
import cv2, numpy as np
from PIL import Image
os.environ.setdefault("U2NET_HOME", r"D:\Plajah Models\u2net")
from rembg import remove, new_session
SRC="D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22"
OUT="C:/Users/Kenne/plajah/public/games/apex/sprites"
sess=new_session("u2net",providers=["CPUExecutionProvider"])
man=[m for m in json.load(open(OUT+"/manifest.json")) if m["cat"]!="conifer"]
fs=sorted(glob.glob(SRC+"/3D_tree_asset_sheet_render*.jpg"))
BOX=[(0,(255,5,510,350),24.0),(0,(580,55,790,350),20.0),(0,(870,140,1030,350),13.0),
     (1,(120,130,190,330),5.5),(1,(275,110,400,330),9.0),(1,(470,50,625,330),14.0),(1,(690,10,845,330),20.0),(1,(930,10,1140,330),22.0)]
# second sheet: pines are in the lower part of the image, y from 0.5 of its height
for k,(si,(x0,y0,x1,y1),hm) in enumerate(BOX):
    im=Image.open(fs[si]).convert("RGB")
    if si==1:
        y0+=int(0.0); 
    crop=im.crop((x0,y0,x1,y1))
    cut=np.array(remove(crop,session=sess)); m=(cut[...,3]>140).astype(np.uint8)
    n,lab,st,_=cv2.connectedComponentsWithStats(m,8)
    if n<2: continue
    i=1+int(np.argmax(st[1:,4])); x,y,cw,ch,a=st[i]
    piece=cut[y:y+ch,x:x+cw].copy(); piece[...,3]=np.where(lab[y:y+ch,x:x+cw]==i,piece[...,3],0)
    fn=f"conifer_{k:02d}.png"; Image.fromarray(piece).save(f"{OUT}/{fn}")
    man.append({"file":fn,"set":"conifer","cat":"conifer","w":int(cw),"h":int(ch),"hm":hm,"hue":0,"sat":0,"autumn":False}); print(fn,cw,ch)
json.dump(man,open(OUT+"/manifest.json","w"),indent=0)
