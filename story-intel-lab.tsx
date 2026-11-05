// Lab for Tela's Story Intelligence workspace: npx vite --config story-intel-lab.vite.config.mjs → http://127.0.0.1:3226/story-intel-lab.html
// The real /api/reello router runs on an in-memory store seeded with two read videos and two Worlds.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import StoryIntelWorkspace from './components/tela/storyIntel/StoryIntelWorkspace';
import StoryIntelShelf from './components/lorea/StoryIntelShelf';
import { OPEN_STORY_INTEL_EVENT, type StoryIntelRequest } from './services/storyIntel/open';

const Lab: React.FC = () => {
  const [open, setOpen] = useState<StoryIntelRequest | null>(location.hash.includes('shelf') ? null : {});
  // Lorea's shelf asks Tela to open the workspace; here the lab stands in for TelaView.
  useEffect(() => { const on = (e: Event) => setOpen((e as CustomEvent).detail || {}); window.addEventListener(OPEN_STORY_INTEL_EVENT, on); return () => window.removeEventListener(OPEN_STORY_INTEL_EVENT, on); }, []);
  return open
    ? <StoryIntelWorkspace key={JSON.stringify(open)} onClose={() => setOpen(null)} initialVideoId={open.videoId} initialSource={open.source} initialView={open.view} />
    : <div style={{ padding: 32 }}><button onClick={() => setOpen({})} style={{ padding: '8px 16px', borderRadius: 999, background: '#7c5cff', color: '#fff', fontWeight: 700, marginBottom: 24 }}>Open workspace</button><StoryIntelShelf /><p style={{ opacity: .5, fontSize: 12, marginTop: 16 }}><a href="/lab/docs" target="_blank">Store contents</a></p></div>;
};
createRoot(document.getElementById('root')!).render(<Lab />);
