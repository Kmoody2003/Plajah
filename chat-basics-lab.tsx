// Chat basics lab — see chat-basics-lab.vite.config.mjs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import ChatWindow from './components/ChatWindow';
import { LAB_ROOM } from './labs/chat-basics/backendShim';

createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh', maxWidth: 760, margin: '0 auto' }}>
    <ChatWindow room={LAB_ROOM} onOpenCollab={() => {}} />
  </div>,
);
