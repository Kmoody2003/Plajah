// Social lab: the real FeedView in a height-bounded shell, reading the live feed.
//   /social-lab.html           signed out
//   /social-lab.html?user=1    with a stand-in viewer, to show the composer and signed-in menus
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import FeedView from './components/FeedView';
import { FediverseProvider } from './contexts/FediverseContext';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
import { ActiveIdentityProvider } from './contexts/ActiveIdentityContext';

const signedIn = new URLSearchParams(location.search).has('user');
const viewer: any = signedIn ? { uid: 'social-lab-viewer', displayName: 'Lab Viewer', photoURL: '' } : null;

createRoot(document.getElementById('root')!).render(
  <GlobalPlayerProvider>
    <FediverseProvider>
      <ActiveIdentityProvider>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <FeedView onBack={() => {}} currentUser={viewer} onVisitUser={() => {}} />
        </div>
      </ActiveIdentityProvider>
    </FediverseProvider>
  </GlobalPlayerProvider>,
);
