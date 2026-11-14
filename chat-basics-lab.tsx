// Chat basics lab — see chat-basics-lab.vite.config.mjs.
//   ?view=call   in-call recording controls
//   ?view=meet   schedule dialog + meeting invite card
//   ?view=dm     ChatSystem: search a name, click it, the DM opens
//   ?view=join   a meeting link as a guest (&as=member to see the member view)
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import ChatWindow from './components/ChatWindow';
import ChatSystem from './components/ChatSystem';
import { CallProvider } from './contexts/CallContext';
import { MeetingRecordPanel, RecordingNotice, LiveCaptionsOverlay } from './components/meetings/MeetingRecordPanel';
import { ScheduleMeetingDialog, MeetingInviteCard } from './components/meetings/ScheduleMeeting';
import MeetingJoinPage from './components/meetings/MeetingJoinPage';
import { LAB_ROOM } from './labs/chat-basics/backendShim';
import { LAB_MEETING } from './labs/chat-basics/scheduleShim';

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

const MeetLab: React.FC = () => {
  const [dialog, setDialog] = useState(true);
  return (
    <div style={{ minHeight: '100vh', background: '#050505', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <div className="px-4 py-3 rounded-2xl bg-white/[0.08] border border-white/[0.06] text-white">
        <MeetingInviteCard roomId={LAB_ROOM.id} onJoin={m => alert(`Join ${m.title}`)}
          invite={{ meetingId: LAB_MEETING.id, title: LAB_MEETING.title, startsAt: LAB_MEETING.startsAt, durationMin: LAB_MEETING.durationMin, recurrence: LAB_MEETING.recurrence, guestsAllowed: true }} />
      </div>
      <button className="text-white underline" onClick={() => setDialog(true)}>Open schedule dialog</button>
      {dialog && <ScheduleMeetingDialog roomId={LAB_ROOM.id} roomName="Worship Team" onClose={() => setDialog(false)} />}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  view === 'dm' ? <div style={{ height: '100vh', background: '#050505' }}><CallProvider><ChatSystem /></CallProvider></div>
    : view === 'call' ? <CallControlsLab />
    : view === 'meet' ? <MeetLab />
    : view === 'join' ? <MeetingJoinPage meetingId={LAB_MEETING.id} onExit={() => {}} />
    : (
      <div style={{ height: '100vh', maxWidth: 760, margin: '0 auto' }}>
        <ChatWindow room={LAB_ROOM} onOpenCollab={() => {}} />
      </div>
    ),
);
