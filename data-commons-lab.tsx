import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { EvScope } from './components/elevate/vellum';
import GrantHub from './components/elevate/GrantHub';
import { configureGrantsClient } from './services/grants/client';
import FederalContext from './components/terra/FederalContext';

configureGrantsClient({ token: async () => 'lab' });
const biz = new URLSearchParams(location.search).get('org') === 'biz';
const org: any = biz ? { id: 'lab-biz', name: 'Riverside Catering', orgType: 'RESTAURANT', location: { address: '4200 Cass Ave', city: 'Detroit, MI' } } : {
  id: 'lab', name: 'Grace Chapel', orgType: 'CHURCH',
  location: { address: '1600 W Lafayette Blvd', city: 'Detroit, MI' },
};

createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
    <EvScope><h2 style={{ margin: '0 0 16px' }}>Elevate · Grants</h2><GrantHub org={org} /></EvScope>
    <h2 style={{ margin: '40px 0 16px' }}>Terra · Federal records (1600 W Lafayette, Detroit)</h2>
    <FederalContext lat={42.3249} lng={-83.0638} />
  </div>,
);
