import React, { useEffect, useRef } from 'react';
import { IndexedVideo } from '../../services/mediaEngine/indexedVideo';
import { engineClock, engineRunning } from '../../services/fabula/playbackEngine';

/** SDR compatibility surface feeding the existing Pixels effects/compositor. */
export default function IndexedVideoCanvas({ url, sourceRef, playing, active, time, offset, clipStart, fps, onReady, onError, hidden }: {
  url: string; sourceRef: React.MutableRefObject<HTMLCanvasElement | null>; playing: boolean; active: boolean;
  time: number; offset: number; clipStart: number; fps: number; onReady: () => void; onError: (e: Error) => void; hidden: boolean;
}) {
  const latest=useRef({playing,active,time,offset,clipStart,fps,onReady,onError});
  latest.current={playing,active,time,offset,clipStart,fps,onReady,onError};
  useEffect(()=>{
    let alive=true, decoder: IndexedVideo | null=null, raf=0, ready=false, last=-1, wasPlaying=false;
    const abort=new AbortController();
    const start=async()=>{
      try {
        const source = url.startsWith('blob:') || url.startsWith('data:')
          ? {blob: await (await fetch(url,{signal:abort.signal})).blob()} : {url};
        if(!alive)return;
        decoder=new IndexedVideo(source,(frame,requested)=>{
          const canvas=sourceRef.current; if(!canvas||!alive)return;
          const scale=Math.min(1,1920/frame.displayWidth);
          const w=Math.max(1,Math.round(frame.displayWidth*scale)),h=Math.max(1,Math.round(frame.displayHeight*scale));
          if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
          const ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});
          if(!ctx)throw new Error('Indexed preview canvas unavailable');
          ctx.drawImage(frame,0,0,w,h);
          canvas.dataset.frameReady='1';
          (canvas as any).__clipTime=requested-latest.current.offset;
          if(!ready){ready=true;latest.current.onReady();}
        },e=>{if(alive)latest.current.onError(e);});
        const tick=()=>{
          if(!alive)return;
          const s=latest.current;
          const timeline=s.active&&s.playing&&engineRunning()?engineClock():s.time;
          const t=Math.max(0,(s.active?timeline-s.clipStart:0)+s.offset);
          const frame=Math.floor(t*Math.max(1,s.fps));
          if(frame!==last||wasPlaying!==s.playing){decoder?.request(t,!s.playing||wasPlaying!==s.playing||frame<last||Math.abs(frame-last)>s.fps);last=frame;}
          wasPlaying=s.playing;raf=requestAnimationFrame(tick);
        };tick();
      } catch(e){if(alive)latest.current.onError(e instanceof Error?e:new Error(String(e)));}
    };void start();
    return()=>{alive=false;abort.abort();cancelAnimationFrame(raf);decoder?.dispose();};
  },[url,sourceRef]);
  return <canvas ref={sourceRef} className="mvid" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',opacity:hidden?0:1}} />;
}
