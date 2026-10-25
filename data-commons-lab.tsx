import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { EvScope } from './components/elevate/vellum';
import GrantMatcher from './components/elevate/GrantMatcher';
import FederalContext from './components/terra/FederalContext';

const org: any = {
  id: 'lab', name: 'Grace Chapel', orgType: 'CHURCH',
  location: { address: '1600 W Lafayette Blvd', city: 'Detroit, MI' },
};

createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
    <EvScope><h2 style={{ margin: '0 0 16px' }}>Elevate · Grants</h2><GrantMatcher org={org} /></EvScope>
    <h2 style={{ margin: '40px 0 16px' }}>Terra · Federal records (1600 W Lafayette, Detroit)</h2>
    <FederalContext lat={42.3249} lng={-83.0638} />
  </div>,
);
