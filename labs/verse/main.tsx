// Verse lab: the real RelloChurchViewer with stand-in sources, Stage session and transcriber.
//   ?org=church|synagogue|mosque|nonprofit   window.__say(text)  window.__stage(refId,label)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import '../../styles/elevate-vellum.css';
import RelloChurchViewer from '../../components/elevate/RelloChurchViewer';
import { __setSources, __stage, __say, __transcriber } from './mocks';

const kind = new URLSearchParams(location.search).get('org') || 'church';
const ORGS: Record<string, any> = {
  church: { id: 'lab-church', name: 'Hope Street Church', orgType: 'CHURCH' },
  synagogue: { id: 'lab-shul', name: 'Beth Shalom', orgType: 'RELIGIOUS', orgKindLabel: 'Synagogue' },
  mosque: { id: 'lab-masjid', name: 'Masjid an-Nur', orgType: 'RELIGIOUS', orgKindLabel: 'Mosque' },
  nonprofit: { id: 'lab-np', name: 'Eastside Food Bank', orgType: 'NONPROFIT' },
};
__setSources([
  { id: 'src-live', title: 'Sunday Gathering', channelName: 'Main Room', speaker: 'Live', kind: 'LIVE_SANCTUARY', badgeText: 'LIVE', isOrgOwned: true,
    playback: { kind: 'file', url: '/academia/book-opens.mp4' } },
  { id: 'src-tv', title: 'Evening Prayer', channelName: 'LiveHub TV+', speaker: 'Channel', kind: 'MINISTRY_TV_CHANNEL', badgeText: 'TV', isOrgOwned: false,
    playback: { kind: 'file', url: '/backdrops/forest-loop-01.mp4' } },
]);
Object.assign(window as any, { __say, __stage, __transcriber });

createRoot(document.getElementById('root')!).render(
  <div className="ev-scope" style={{ padding: 24, maxWidth: 1240, margin: '0 auto' }}>
    <RelloChurchViewer org={ORGS[kind]} defaultPlayerExpanded viewerIsOrgMember onOpenFullLectio={r => console.log('open study', r)} />
  </div>,
);
