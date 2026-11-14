// Org feed lab: the real OrgThread (Everything / Public / Members) with canned posts.
//   http://127.0.0.1:3171/orgfeed-lab.html          org feed as an admin
//   ?member=0   signed-in non-member      ?member=plain   member in Youth only (no POST_AS_ORG)
//   ?dept=youth | media   the department thread instead of the org feed
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import OrgThread from './components/elevate/OrgThread';
import { FediverseProvider } from './contexts/FediverseContext';

const q = new URLSearchParams(location.search);
const who = q.get('member') || 'admin';
const ministries: any[] = [
  { id: 'youth', name: 'Youth', kind: 'DEPARTMENT', iconEmoji: '🔥', headUids: [] },
  { id: 'media', name: 'Media', kind: 'DEPARTMENT', iconEmoji: '🎥', headUids: [] },
];
const org: any = { id: 'lab-org', name: 'Grace Chapel', logoUrl: '', threadAudience: 'PUBLIC', creatorId: 'founder', admins: [], ministries };
const m: any = who === '0' ? null
  : who === 'plain' ? { userId: 'lab-user', status: 'ACTIVE', role: 'MEMBER', roleKey: 'MEMBER', ministryIds: ['youth'], permissions: [] }
  : { userId: 'lab-user', status: 'ACTIVE', role: 'ADMIN', roleKey: 'ADMIN', permissions: ['POST_AS_ORG', 'MODERATE_THREADS'] };
const ministry = ministries.find(x => x.id === q.get('dept'));
createRoot(document.getElementById('root')!).render(<FediverseProvider><div className="ev-scope" style={{ maxWidth: 560, margin: '0 auto' }}><OrgThread org={org} myMembership={m} ministry={ministry} /></div></FediverseProvider>);
