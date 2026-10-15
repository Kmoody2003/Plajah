import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(process.argv[2]||path.dirname(fileURLToPath(import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary'};

function readGeminiKey(){
 if(process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
 for(const p of [path.resolve('.env.local'),path.resolve(root,'../.env.local')]){
  try{
   if(fs.existsSync(p)){
    const m=fs.readFileSync(p,'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    if(m&&m[1].trim()) return m[1].trim();
   }
  }catch{}
 }
 return '';
}

let activeLyriaSession=null;
const sseClients=new Set();

async function ensureLyriaSession(){
 if(activeLyriaSession) return activeLyriaSession;
 const apiKey=readGeminiKey();
 if(!apiKey) return null;
 try{
  const {GoogleGenAI,Scale}=await import('@google/genai');
  const ai=new GoogleGenAI({apiKey,httpOptions:{apiVersion:'v1alpha'}});
  const session=await ai.live.music.connect({
   model:'models/lyria-realtime-exp',
   callbacks:{
    onmessage:(msg)=>{
     const chunks=msg?.serverContent?.audioChunks||(msg?.audioChunk?[msg.audioChunk]:[]);
     for(const ch of chunks){
      if(ch?.data){
       const payload=`event: audio\ndata: ${JSON.stringify({data:ch.data,sampleRate:48000,channels:2})}\n\n`;
       for(const res of sseClients){try{res.write(payload);}catch{sseClients.delete(res);}}
      }
     }
    },
    onerror:()=>{activeLyriaSession=null;},
    onclose:()=>{activeLyriaSession=null;},
   },
  });
  activeLyriaSession=session;
  await session.setWeightedPrompts({
   weightedPrompts:[{text:'Infectious upbeat Mario Kart style arcade racing synth funk lead and slap bass',weight:1.0}],
  });
  await session.setMusicGenerationConfig({
   musicGenerationConfig:{bpm:134,scale:Scale.C_MAJOR_A_MINOR,density:0.75,brightness:0.80},
  });
  await session.play();
  return session;
 }catch{
  activeLyriaSession=null;
  return null;
 }
}

const server=http.createServer(async (req,res)=>{
 let url;
 try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}

 if(url==='/kith-party/lyria/status'){
  const hasKey=readGeminiKey().length>8;
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({available:hasKey,model:'models/lyria-realtime-exp'}));
  return;
 }
 if(url==='/kith-party/lyria/stream'){
  res.writeHead(200,{
   'Content-Type':'text/event-stream',
   'Cache-Control':'no-cache',
   'Connection':'keep-alive',
  });
  res.write('event: open\ndata: {"ok":true}\n\n');
  sseClients.add(res);
  void ensureLyriaSession();
  req.on('close',()=>{
   sseClients.delete(res);
   if(sseClients.size===0&&activeLyriaSession){
    try{activeLyriaSession.close();}catch{}
    activeLyriaSession=null;
   }
  });
  return;
 }
 if(url==='/kith-party/lyria/steer'&&req.method==='POST'){
  let body='';
  req.on('data',chunk=>{if(body.length<32000)body+=chunk;});
  req.on('end',async ()=>{
   try{
    const parsed=JSON.parse(body||'{}');
    const session=await ensureLyriaSession();
    if(session){
     if(parsed.weightedPrompts) await session.setWeightedPrompts({weightedPrompts:parsed.weightedPrompts});
     if(parsed.musicGenerationConfig) await session.setMusicGenerationConfig({musicGenerationConfig:parsed.musicGenerationConfig});
    }
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true}));
   }catch{
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:false}));
   }
  });
  return;
 }

 const file=path.resolve(root,'.'+(url==='/'?'/kith-party.html':url));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404).end('Not found');return;
 }
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
server.listen(3188,'127.0.0.1',()=>console.log('Kith Party is ready: http://127.0.0.1:3188 — press Ctrl+C to stop.'));
