// Org page lab: ?org=<id> renders the real OrgHub (live Firestore data); no id lists Elevate orgs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import './index.css';
import { db } from './services/firebase';
import OrgHub from './components/OrgHub';

const orgId = new URLSearchParams(location.search).get('org');

const Picker: React.FC = () => {
  const [orgs, setOrgs] = useState<{ id: string; name: string; orgType?: string }[]>([]);
  useEffect(() => { getDocs(query(collection(db, 'organizations'), limit(200))).then(s => setOrgs(s.docs.map(d => ({ id: d.id, ...(d.data() as any) })))).catch(e => console.error(e)); }, []);
  return <ul style={{ color: '#fff', padding: 24 }}>{orgs.map(o => <li key={o.id}><a style={{ color: '#c9a' }} href={`?org=${o.id}`}>{o.name}</a> · {o.orgType}</li>)}</ul>;
};

createRoot(document.getElementById('root')!).render(
  orgId ? <OrgHub user={null as any} onBack={() => {}} initialOrgId={orgId} /> : <Picker />
);
