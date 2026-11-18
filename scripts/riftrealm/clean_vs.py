import numpy as np,cv2
from PIL import Image,ImageDraw
d='D:/rr_work/void_stalker/'
def load(n): return np.array(Image.open(d+n+'_raw.png'))
def fin(a,n):
    m=(a[:,:,3]>140).astype(np.uint8)
    nn,lab,st,_=cv2.connectedComponentsWithStats(m,8)
    k=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); m=(lab==k)
    m=cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    a[:,:,3]=np.where(m>0,255,0)
    Image.fromarray(a).save(d+n+'.png')
    bg=np.zeros_like(a);bg[...,:3]=(255,0,255);al=a[:,:,3:4]/255.
    Image.fromarray((a[:,:,:3]*al+bg[:,:,:3]*(1-al)).astype(np.uint8)).save(d+n+'_clean_prev.png')
f=load('front'); f[-200:, :98, 3]=0; f[-200:,548:,3]=0; fin(f,'front')
s=load('side'); s[-140:, :196, 3]=0; fin(s,'side')
# back: polygon for upper body (sheet coords -> crop*2, origin 780,55)
raw=np.array(Image.open(d+'back_raw.png'))
sheet=Image.open(d+'sheet.jpg').convert('RGB').crop((780,55,1100,700)); sheet=sheet.resize((640,1290),Image.LANCZOS)
poly=[(x+780,y+55) for x,y in [(130,28),(188,28),(197,80),(212,100),(232,125),(262,168),(278,200),(298,260),(300,390),(24,390),(24,260),(44,215),(60,172),(100,125),(114,100),(125,75)]]
pm=Image.new('L',(640,1290),0); ImageDraw.Draw(pm).polygon([((x-780)*2,(y-55)*2) for x,y in poly],fill=255)
pm=np.array(pm); pm=cv2.erode(pm,np.ones((5,5),np.uint8))
al=np.where(np.arange(1290)[:,None]<(430-55)*2, pm, raw[:,:,3]).astype(np.uint8)
# lower body from rembg
low=raw[:,:,3]
al=np.where(np.arange(1290)[:,None]<(430-55)*2, pm, low)
b=np.dstack([np.array(sheet),al]); b[-200:,:60,3]=0; b[-200:,590:,3]=0
fin(b,'back')
