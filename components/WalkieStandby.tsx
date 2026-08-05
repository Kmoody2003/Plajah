// WalkieStandby — the always-on hot-channel HUD. When the user enables Live Standby, this mounts a
// background presence heartbeat and keeps a live WebRTC channel open to each ONLINE hot contact (≤3)
// without anyone opening the handset. Incoming PTT plays instantly through the AM/ham chain + chirps
// + lights up that contact; a hold-to-talk button replies. This is the Nextel "always-on" feel.

import React, { useEffect, useRef, useState } from 'react';
import { Radio, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/backendService';
import { subscribePrefs, pairId, type WalkiePrefs } from '../services/walkieTalkie/walkieService';
import { startPresence, subscribePresence, isOnline } from '../services/walkieTalkie/walkiePresence';
import { WalkieLive } from '../services/walkieTalkie/walkieLive';
import { playChirp, getAudioContext } from '../services/walkieTalkie/radioFX';

interface HotContact { uid: string; name: string; photo?: string; online: boolean; connected: boolean; talking: boolean }

const WalkieStandby: React.FC<{ selfUid?: string; selfName?: string }> = ({ selfUid, selfName }) => {
  const [prefs, setPrefs] = useState<WalkiePrefs | null>(null);
  const [contacts, setContacts] = useState<Record<string, HotContact>>({});
  const [open, setOpen] = useState(true);
  const [txTo, setTxTo] = useState<string | null>(null);

  const connsRef = useRef<Map<string, WalkieLive>>(new Map());

  const patch = (uid: string, p: Partial<HotContact>) =>
    setContacts(prev => ({ ...prev, [uid]: { uid, name: uid.slice(0, 6), online: false, connected: false, talking: false, ...prev[uid], ...p } }));

  // own prefs (live)
  useEffect(() => {
    if (!selfUid) { setPrefs(null); return; }
    return subscribePrefs(selfUid, setPrefs);
  }, [selfUid]);

  const standby = !!prefs?.liveStandby;
  const hotKey = (prefs?.hotUids ?? []).join(',');

  // presence + background connections to online hot contacts
  useEffect(() => {
    const conns = connsRef.current;
    const teardown = () => { conns.forEach(c => c.dispose()); conns.clear(); setContacts({}); };
    if (!selfUid || !standby) { teardown(); return; }

    const hot = prefs?.hotUids ?? [];
    const stopPresence = startPresence(selfUid);
    const presUnsubs: Array<() => void> = [];

    hot.forEach(hu => {
      patch(hu, {});
      getDoc(doc(db, 'users', hu)).then(s => { const d = s.data() as any; if (d) patch(hu, { name: d.displayName || hu.slice(0, 6), photo: d.photoURL }); }).catch(() => {});
      presUnsubs.push(subscribePresence(hu, pres => {
        const online = isOnline(pres);
        patch(hu, { online });
        const has = conns.has(hu);
        if (online && !has) {
          const live = new WalkieLive(pairId(selfUid, hu), selfUid, selfName || 'Plajah', {
            onPeerPresent: (p) => patch(hu, { connected: p }),
            onPeerTransmitting: (on) => patch(hu, { talking: on }),
            onError: () => {},
          });
          conns.set(hu, live);
          live.connect().catch(() => {});
        } else if (!online && has) {
          conns.get(hu)!.dispose(); conns.delete(hu); patch(hu, { connected: false, talking: false });
        }
      }));
    });

    return () => { stopPresence(); presUnsubs.forEach(f => f()); teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfUid, standby, hotKey, selfName]);

  if (!selfUid || !standby) return null;

  const list = Object.values(contacts).filter(c => (prefs?.hotUids ?? []).includes(c.uid));
  const onlineCount = list.filter(c => c.online).length;
  const anyTalking = list.some(c => c.talking);

  const holdStart = (uid: string) => {
    const live = connsRef.current.get(uid); if (!live) return;
    setTxTo(uid); playChirp(getAudioContext(), 'start'); live.setTransmitting(true);
  };
  const holdEnd = (uid: string) => {
    const live = connsRef.current.get(uid); if (!live) return;
    live.setTransmitting(false); playChirp(getAudioContext(), 'end'); setTxTo(null);
  };

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 70, width: 230, borderRadius: 16, padding: 2, background: '#0c0b08', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', fontFamily: "'Courier New',monospace" }}>
      <div style={{ borderRadius: 14, background: 'linear-gradient(160deg,#2a2723,#16140f)', border: '1px solid #3a352c' }}>
        <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: 'transparent', border: 'none', color: '#e9e4d8', cursor: 'pointer' }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Radio size={16} color={anyTalking ? '#7dffa0' : '#FF8C00'} />
            {anyTalking && <span style={{ position: 'absolute', inset: -3, borderRadius: 99, border: '2px solid #7dffa0', animation: 'walkiePulse 1s infinite' }} />}
          </span>
          <span style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>STANDBY · {onlineCount} ON</span>
          <span style={{ marginLeft: 'auto', color: '#8a8472' }}>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</span>
        </button>

        {open && (
          <div style={{ padding: '4px 8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {list.length === 0 && <div style={{ fontSize: 10, color: '#6b6452', fontStyle: 'italic', padding: '4px 2px' }}>No hot contacts yet. Mark a contact "Hot" in their two-way.</div>}
            {list.map(c => (
              <div key={c.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, background: c.talking ? 'rgba(125,255,160,0.10)' : '#1c1812', border: `1px solid ${c.talking ? '#7dffa0' : '#332d22'}`, borderRadius: 10, padding: '6px 8px' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: c.online ? '#5fd17f' : '#444', boxShadow: c.online ? '0 0 6px #5fd17f' : 'none', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: c.online ? '#e9e4d8' : '#6b6452', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}{c.talking ? ' ◀' : ''}
                </span>
                <button
                  onPointerDown={() => c.online && c.connected && holdStart(c.uid)}
                  onPointerUp={() => holdEnd(c.uid)} onPointerLeave={() => txTo === c.uid && holdEnd(c.uid)}
                  disabled={!c.online || !c.connected}
                  title={c.connected ? 'Hold to talk' : c.online ? 'Connecting…' : 'Offline'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 8, fontSize: 9, fontWeight: 800, letterSpacing: 0.5, flexShrink: 0,
                    border: `1px solid ${txTo === c.uid ? '#FF8C00' : '#4a4337'}`, cursor: c.connected ? 'pointer' : 'not-allowed',
                    background: txTo === c.uid ? 'radial-gradient(circle,#5a3500,#2a1c00)' : 'transparent', color: txTo === c.uid ? '#FF8C00' : c.connected ? '#e9e4d8' : '#5a5346', opacity: c.connected ? 1 : 0.5, touchAction: 'none', userSelect: 'none' }}>
                  <Zap size={11} /> {txTo === c.uid ? 'ON AIR' : 'TALK'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes walkiePulse{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}`}</style>
    </div>
  );
};

export default WalkieStandby;
