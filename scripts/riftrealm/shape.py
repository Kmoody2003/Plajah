import base64,json,sys,time,urllib.request
src,out=sys.argv[1],sys.argv[2]
R='http://127.0.0.1:51124'
for _ in range(360):
    try: h=json.load(urllib.request.urlopen(R+'/health',timeout=5))
    except Exception: h={'busy':True,'gpuTempC':99}
    print(h,flush=True)
    if not h.get('busy') and (h.get('gpuTempC') or 0)<=83: break
    time.sleep(5)
data='data:image/png;base64,'+base64.b64encode(open(src,'rb').read()).decode()
body=json.dumps({'task':{'image':data,'backend':'hunyuan_mini','options':{'octreeResolution':380,'steps':5,'faceLimit':300000,'seed':7}}}).encode()
req=urllib.request.Request(R+'/tela3d/image-to-mesh',body,{'Content-Type':'application/json'})
r=json.load(urllib.request.urlopen(req,timeout=1800))
if not r.get('success'): raise SystemExit(r.get('error'))
open(out,'wb').write(base64.b64decode(r['glbBase64']))
print(r['faces'],r['executionTimeMs'],r.get('gpuTempC'))
