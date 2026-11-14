// Lab for the Reello Upload Studio: npx vite --config reello-upload-lab.vite.config.mjs → http://127.0.0.1:3192/reello-upload-lab.html
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import ReelloUploadStudio from './components/reello/upload/ReelloUploadStudio';
import ReelloDeptChannelPage from './components/reello/ReelloDeptChannelPage';
import { OPEN_DEPT_CHANNEL_EVENT } from './services/reello/orgChannels';
import ReelloDeptChannelsRow from './components/reello/ReelloDeptChannelsRow';
import VideoStudioPanel from './components/reello/VideoStudioPanel';
import { OPEN_VIDEO_STUDIO_EVENT } from './services/reello/videoStudio';

const Lab: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const [dept, setDept] = useState<{ orgId: string; departmentId: string } | null>(null);
  useEffect(() => { const on = (e: Event) => setDept((e as CustomEvent).detail); window.addEventListener(OPEN_DEPT_CHANNEL_EVENT, on); return () => window.removeEventListener(OPEN_DEPT_CHANNEL_EVENT, on); }, []);
  // The video studio (edit details + Story Intelligence), as ReelloUploadDock hosts it in the app.
  const [studio, setStudio] = useState<{ videoId: string; tab: any } | null>(null);
  useEffect(() => { const on = (e: Event) => setStudio((e as CustomEvent).detail); window.addEventListener(OPEN_VIDEO_STUDIO_EVENT, on); return () => window.removeEventListener(OPEN_VIDEO_STUDIO_EVENT, on); }, []);
  const studioEl = studio && <VideoStudioPanel videoId={studio.videoId} initialTab={studio.tab} onClose={() => setStudio(null)} />;
  return <>{studioEl}{open
    ? <ReelloUploadStudio onClose={() => { setOpen(false); setTick(t => t + 1); }} />
    : (
      <div style={{ padding: 40 }}>
        <button onClick={() => setOpen(true)} style={{ padding: '10px 20px', borderRadius: 999, background: '#00B4D8', color: '#000', fontWeight: 700 }}>Open uploader</button>
        <p style={{ marginTop: 24, opacity: 0.6, fontSize: 13 }}>Grace Chapel's Reello channel — departments appear once they post:</p>
        <ReelloDeptChannelsRow key={tick} orgId="org_lab" />
        {dept && <ReelloDeptChannelPage orgId={dept.orgId} departmentId={dept.departmentId} onClose={() => setDept(null)} />}
      </div>
    )}</>;
};

createRoot(document.getElementById('root')!).render(<Lab />);
