// src/comicMangaStudioLab.tsx — Plajah Comic, Manga & Storybook Studio Working Lab
// Mounts the real ComicMangaCreatorStudio inside the real Plajah Design Language environment.
// Enhanced with one-click flagship switching (The Obsidian Shroud & Chrome Apostle) and Lorea Reader testing.

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ComicMangaCreatorStudio } from '../components/tela/studio/ComicMangaCreatorStudio';
import {
  comicToShowcaseStudioBook,
  openStudioBookInLorea,
  getAvailableShowcaseComics,
} from '../services/comic/comicStudioBridge';
import '../styles/plajah-ds.css';

const ComicMangaStudioLab: React.FC = () => {
  const [selectedStoryId, setSelectedStoryId] = useState<string>('obsidian-shroud');
  const [storyTitle, setStoryTitle] = useState<string>('THE OBSIDIAN SHROUD: SECTOR ZERO');
  const [key, setKey] = useState<number>(0);

  const handleSelectStory = (id: string, title: string) => {
    setSelectedStoryId(id);
    setStoryTitle(title);
    setKey(k => k + 1);
  };

  const handleReadInLorea = () => {
    const book = comicToShowcaseStudioBook(selectedStoryId);
    openStudioBookInLorea(book);
    alert(`Opening "${book.title}" in Lorea Reader! (Dispatched OPEN_LOREA_BOOK event)`);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#090a0f', display: 'flex', flexDirection: 'column' }}>
      {/* Top Quick-Switcher Navigation Bar */}
      <div style={{
        height: '42px',
        backgroundColor: '#0d0e14',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 100,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#ff8c00' }}>
            ⚡ Studio Authoring Lab
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => handleSelectStory('obsidian-shroud', 'THE OBSIDIAN SHROUD: SECTOR ZERO')}
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                border: selectedStoryId === 'obsidian-shroud' ? '1px solid #f97316' : '1px solid rgba(255,255,255,0.1)',
                backgroundColor: selectedStoryId === 'obsidian-shroud' ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.04)',
                color: selectedStoryId === 'obsidian-shroud' ? '#f97316' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.15s ease',
              }}
            >
              🗡️ The Obsidian Shroud (Method 1 · 20 pgs)
            </button>
            <button
              onClick={() => handleSelectStory('chrome-apostle', 'CHROME APOSTLE: APHELION 9')}
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                border: selectedStoryId === 'chrome-apostle' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                backgroundColor: selectedStoryId === 'chrome-apostle' ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.04)',
                color: selectedStoryId === 'chrome-apostle' ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.15s ease',
              }}
            >
              🚀 Chrome Apostle (Method 2 · RTL Manga)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleReadInLorea}
            style={{
              padding: '4px 12px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 900,
              cursor: 'pointer',
              border: '1px solid #ff8c00',
              backgroundColor: 'rgba(255,140,0,0.2)',
              color: '#ff8c00',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            📖 Read in Lorea Reader
          </button>
          <a
            href="/index.html"
            style={{
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.6)',
              textDecoration: 'none',
            }}
          >
            Return to App
          </a>
        </div>
      </div>

      {/* Main Creator Studio Host */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ComicMangaCreatorStudio
          key={key}
          initialTitle={storyTitle}
          onClose={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = '/';
          }}
          onInsertIntoTelaDoc={(page) => {
            console.log('[ComicMangaStudioLab] Inserted page into Tela document:', page);
            alert(`Successfully compiled ${page.panels.length}-panel sequential page into Tela Scene Graph!`);
          }}
        />
      </div>
    </div>
  );
};

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<ComicMangaStudioLab />);
}
