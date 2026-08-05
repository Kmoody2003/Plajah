// EmbedShareGuide — a quick "here's how your shared link will look" popup shown when a
// user shares a Plajah embed (album / track / video). Explains that the link renders a
// playable mini-player on X, Facebook, etc. (Suno-style) and how to make it show up.

import React from 'react';
import { X, Play, Music, Sparkles, ClipboardPaste, Clock } from 'lucide-react';
import Portal from './Portal';

const EmbedShareGuide: React.FC<{ title?: string; imageUrl?: string; onClose: () => void }> = ({ title, imageUrl, onClose }) => {
  return (
    <Portal>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '94vw', background: '#14141c', border: '1px solid #2a2a38', borderRadius: 18, padding: 20, color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#FF8C00" />
              <span style={{ fontWeight: 800, fontSize: 16 }}>Your link plays music</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          {/* mock preview card */}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #2a2a38', background: '#0a0a0f', marginBottom: 14 }}>
            <div style={{ position: 'relative', height: 120, background: imageUrl ? `center/cover url(${imageUrl})` : 'linear-gradient(135deg,#FF8C00,#7a2bd6)' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.2))' }} />
              <div style={{ position: 'absolute', left: 12, bottom: 10, right: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Play size={18} fill="#111" color="#111" /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: '#FF8C00', textTransform: 'uppercase' }}>Now playing on Plajah</div>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || 'Your track / album'}</div>
                </div>
                <Music size={16} color="#aaa" style={{ marginLeft: 'auto' }} />
              </div>
            </div>
            <div style={{ padding: '7px 12px', fontSize: 10.5, color: '#777' }}>plajah.com · playable preview</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#cfcfd8' }}>
            <Tip icon={<ClipboardPaste size={15} />}>Paste the link <b style={{ color: '#fff' }}>on its own line</b> in your X / Facebook post — don't attach it as a screenshot. The platform turns the link itself into the player.</Tip>
            <Tip icon={<Play size={15} />}>People see your <b style={{ color: '#fff' }}>cover art + a play button</b> right in the post and can listen without leaving the app.</Tip>
            <Tip icon={<Clock size={15} />}>First share can take a few seconds to preview. If it doesn't appear, the platform may have cached an old preview — re-paste, or refresh it in the platform's link debugger.</Tip>
          </div>

          <button onClick={onClose} style={{ width: '100%', marginTop: 16, padding: '11px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(90deg,#FF8C00,#ffa733)', color: '#1a1a1a', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>Got it</button>
        </div>
      </div>
    </Portal>
  );
};

const Tip: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
    <span style={{ color: '#FF8C00', marginTop: 1, flex: '0 0 auto' }}>{icon}</span>
    <span style={{ lineHeight: 1.45 }}>{children}</span>
  </div>
);

export default EmbedShareGuide;
