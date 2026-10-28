// Chat basics lab — see chat-basics-lab.vite.config.mjs.  ?view=call shows the in-call recording controls.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import ChatWindow from './components/ChatWindow';
import { MeetingRecordPanel, RecordingNotice, LiveCaptionsOverlay } from './components/meetings/MeetingRecordPanel';
import { LAB_ROOM } from './labs/chat-basics/backendShim';

const view = new URLSearchParams(location.search).get('view');

const CallControlsLab: React.FC = () => (
  <div style={{ minHeight: '100vh', background: '#050505', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
    <RecordingNotice hostName="Dana Reyes" isHost={false} mode="CLOUD" startedAt={Date.now() - 754_000} optOut={false} onToggleOptOut={() => {}} />
    <RecordingNotice hostName="Kenne" isHost mode="LOCAL" startedAt={Date.now() - 65_000} optOut onToggleOptOut={() => {}} onStop={() => {}} />
    <LiveCaptionsOverlay lines={[
      { uid: 'a', name: 'Dana Reyes', text: 'We decided to move rehearsal to 6:30 then.', final: true },
      { uid: 'b', name: 'Sam Okafor', text: 'Yes I can drop the mic stands off', final: false },
    ]} />
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <MeetingRecordPanel defaultKind="VIDEO" onStart={() => {}} onClose={() => {}} />
    </div>
  </div>
);

createRoot(document.getElementById('root')!).render(
  view === 'call' ? <CallControlsLab /> : (
    <div style={{ height: '100vh', maxWidth: 760, margin: '0 auto' }}>
      <ChatWindow room={LAB_ROOM} onOpenCollab={() => {}} />
    </div>
  ),
);
