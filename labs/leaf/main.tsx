// Leaf lab: LeafPlayer in a stand-in page, with a canvas as the video so playback survives opening.
// window.__cue(i) moves to a passage; window.__frames() counts frames the video has presented.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LeafPlayer, { type LeafNote } from '../../components/elevate/LeafPlayer';

const SKINS = [
  { id: 'vellum', label: 'Vellum', bg: 'radial-gradient(120% 90% at 30% 0%, #F7F1E2 0%, #EFE7D4 55%, #E7DDC6 100%)', ink: '#241E14', muted: '#7B7059', num: '#A8862E', mark: 'rgba(226,194,126,.34)' },
  { id: 'night', label: 'Night', bg: 'linear-gradient(180deg, #0C0B12 0%, #08070C 100%)', ink: '#DED8EA', muted: '#6E6688', num: '#E2C27E', mark: 'rgba(226,194,126,.2)' },
];
const CUES = [
  { label: 'Romans 8:28', verse: 28, verses: [
    [26, 'Likewise the Spirit also helpeth our infirmities: for we know not what we should pray for as we ought: but the Spirit itself maketh intercession for us with groanings which cannot be uttered.'],
    [27, 'And he that searcheth the hearts knoweth what is the mind of the Spirit, because he maketh intercession for the saints according to the will of God.'],
    [28, 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.'],
    [29, 'For whom he did foreknow, he also did predestinate to be conformed to the image of his Son, that he might be the firstborn among many brethren.'],
    [30, 'Moreover whom he did predestinate, them he also called: and whom he called, them he also justified: and whom he justified, them he also glorified.'],
  ] },
  { label: 'Psalm 46:10', verse: 10, verses: [
    [9, 'He maketh wars to cease unto the end of the earth; he breaketh the bow, and cutteth the spear in sunder; he burneth the chariot in the fire.'],
    [10, 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.'],
    [11, 'The LORD of hosts is with us; the God of Jacob is our refuge. Selah.'],
  ] },
];

const FakeVideo: React.FC = () => {
  const vidRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const g = c.getContext('2d')!;
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      g.fillStyle = '#2A1240'; g.fillRect(0, 0, 640, 360);
      g.fillStyle = '#E9B98A'; g.fillRect((n * 4) % 640, 150, 60, 60);
      g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText(`frame ${n}`, 20, 40);
      (window as any).__frameCount = n;
    }, 33);
    const v = vidRef.current!;
    v.srcObject = c.captureStream(30);
    v.play().catch(() => {});
    return () => window.clearInterval(id);
  }, []);
  return <video ref={vidRef} className="ev-lab-video" muted autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
};

const Lab: React.FC = () => {
  const [i, setI] = useState(0);
  const [muted, setMuted] = useState(true);
  const [skin, setSkin] = useState('vellum');
  const [translation, setTranslation] = useState('kjv');
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<LeafNote[]>([]);
  useEffect(() => { (window as any).__cue = setI; (window as any).__video = () => { const v = document.querySelector('video')!; return { paused: v.paused, time: v.currentTime, inBody: v.closest('.ev-leaf-open') !== null }; }; }, []);
  const c = CUES[i];
  return (
    <div style={{ padding: 16, color: '#D8D2E2', font: '15px Inter, system-ui, sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>Grace Chapel</h2>
      <div style={{ marginBottom: 16 }}>
        <LeafPlayer
          media={<FakeVideo />}
          mediaIsEmbed={false}
          background="#2A1240"
          title="Sunday Morning Worship with a Long Title for Truncation"
          isLive
          muted={muted}
          onToggleMute={() => setMuted(m => !m)}
          label={c.label}
          verse={c.verse}
          excerpt=""
          verses={c.verses.map(([verse, text]) => ({ verse, text })) as any}
          loading={false}
          translation={translation}
          translations={[{ slug: 'kjv', label: 'KJV' }, { slug: 'web', label: 'WEB' }]}
          onTranslation={setTranslation}
          skin={SKINS.find(s => s.id === skin)!}
          skins={SKINS}
          onSkin={setSkin}
          sources={[{ id: 'a', title: 'Sunday Morning Worship', channel: 'Main Sanctuary', live: true }, { id: 'b', title: 'Midweek Vespers', channel: 'On demand', live: false }]}
          activeSourceId="a"
          onPickSource={() => {}}
          inSanctuary={false}
          notes={notes}
          noteDraft={draft}
          onNoteDraft={setDraft}
          onAddNote={() => { setNotes(n => [{ id: String(Date.now()), timecodeSec: 2052, verseLabel: c.label, text: draft }, ...n]); setDraft(''); }}
          onJumpTo={() => {}}
          playheadSec={2052}
          onStepCue={d => setI(x => Math.max(0, Math.min(CUES.length - 1, x + d)))}
          onOpenStudy={() => {}}
        />
      </div>
      {Array.from({ length: 12 }, (_, n) => <p key={n}>Page content below the player, row {n + 1}.</p>)}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);
