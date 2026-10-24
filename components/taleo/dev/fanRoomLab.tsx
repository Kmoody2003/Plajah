// Standalone mount of the Halloween fan room (no app shell): http://127.0.0.1:3167/fanroom-lab.html
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { HalloweenVaultChatAndFanRoom } from '../HalloweenVaultChatAndFanRoom';

createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 1400, margin: '0 auto', padding: 16 }}>
    <HalloweenVaultChatAndFanRoom onOpenHauntedExhibition={() => {}} />
  </div>
);
