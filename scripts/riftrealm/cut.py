import os,sys,numpy as np,cv2,rembg
from PIL import Image
os.environ['U2NET_HOME']=r'D:\Plajah Models\u2net'
sess=rembg.new_session('u2net',providers=['CPUExecutionProvider'])
d=sys.argv[1]; name=sys.argv[2]; box=tuple(map(int,sys.argv[3:7])); up=int(sys.argv[7]) if len(sys.argv)>7 else 2
im=Image.open(f'{d}/sheet.jpg').convert('RGB').crop(box)
im=im.resize((im.width*up,im.height*up),Image.LANCZOS)
a=np.array(rembg.remove(im,session=sess).convert('RGBA'))
m=(a[:,:,3]>40).astype(np.uint8)
n,lab,st,_=cv2.connectedComponentsWithStats(m,8)
if n>1:
    k=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); a[lab!=k,3]=0
Image.fromarray(a).save(f'{d}/{name}_raw.png')
bg=np.full(a.shape[:3] if False else a.shape,(255,0,255,255),np.uint8)
al=a[:,:,3:4]/255.0
prev=(a[:,:,:3]*al+bg[:,:,:3]*(1-al)).astype(np.uint8)
Image.fromarray(prev).save(f'{d}/{name}_prev.png')
