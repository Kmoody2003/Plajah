// Phone lab — the real components/phone/PhoneHub.tsx over a mock telecom bridge (labs/phone/mockTelecom.ts),
// so the dialer UI can be seen in a desktop browser with no Android device and no sign-in.
//   node node_modules/vite/bin/vite.js --config phone-lab.vite.config.mjs  ->  http://127.0.0.1:3331/
//   ?call=incoming|active   ?setup=1   ?launch=dial:3135550142|sms:3135550177   ?bare=1 (hide toolbar)
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PhoneHub from '../../components/phone/PhoneHub';

const bare = new URLSearchParams(location.search).get('bare') === '1';
const lab = () => (window as any).phoneLab;

function Toolbar() {
  if (bare) return null;
  const btn = 'px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[10px] text-white font-bold';
  return (
    <div className="fixed top-2 right-2 z-[999] flex gap-1 opacity-70 hover:opacity-100">
      <button className={btn} onClick={() => lab().incoming()}>Ring</button>
      <button className={btn} onClick={() => lab().text()}>Text in</button>
      <button className={btn} onClick={() => lab().end()}>End</button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <>
    <PhoneHub onBack={() => alert('Back to Chat')} onOpenChat={(id) => alert(`Open Plajah chat ${id}`)} />
    <Toolbar />
  </>,
);
