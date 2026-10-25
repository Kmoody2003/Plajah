// Org feed lab: the real OrgThread (Public / Members / Blended) with canned posts.
//   http://127.0.0.1:3171/orgfeed-lab.html          (member)   ?member=0 (signed-in non-member)
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import OrgThread from './components/elevate/OrgThread';

const member = new URLSearchParams(location.search).get('member') !== '0';
const org: any = { id: 'lab-org', name: 'Grace Chapel', logoUrl: '', threadAudience: 'PUBLIC' };
const m: any = member ? { userId: 'lab-user', status: 'ACTIVE', role: 'ADMIN', roleKey: 'ADMIN', permissions: ['POST_AS_ORG', 'MODERATE_THREADS'] } : null;
createRoot(document.getElementById('root')!).render(<div className="ev-scope" style={{ maxWidth: 560, margin: '0 auto' }}><OrgThread org={org} myMembership={m} /></div>);
