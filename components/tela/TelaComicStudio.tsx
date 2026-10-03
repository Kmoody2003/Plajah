// TelaComicStudio.tsx — Storybook, Graphic Novel & Comic Page Director for Tela.
// Generates full sequential pages with character & style consistency, then emits native Tela frames
// with editable vector speech bubbles and panel layouts.

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  User,
  LayoutGrid,
  Sparkles,
  MessageSquare,
  Plus,
  Play,
  RotateCw,
  Check,
  ChevronRight,
  Layers,
  Camera
} from 'lucide-react';
import {
  CharacterSheet,
  ComicPageSpec,
  ComicPanel,
  listSavedCharacters,
  saveCharacter,
  createDefaultCharacter,
} from '../../services/story/characterBible';
import { compileComicPanelTask } from '../../services/localAi/plajahPipelineEngine';
import { executePlajahNativeTask } from '../../services/localAi/plajahNativeRunner';
import { getLocalEngineStatus } from '../../services/localAi/localEngineDiscovery';

interface TelaComicStudioProps {
  onInsertPageIntoTela?: (pageSpec: ComicPageSpec) => void;
  onClose?: () => void;
}

export const TelaComicStudio: React.FC<TelaComicStudioProps> = ({
  onInsertPageIntoTela,
  onClose,
}) => {
  const [characters, setCharacters] = useState<CharacterSheet[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [layout, setLayout] = useState<ComicPageSpec['layoutPreset']>('grid_6');
  const [pageTitle, setPageTitle] = useState('Episode 1: The Encounter');
  const [stylePreset, setStylePreset] = useState<'graphic_novel_noir' | 'manga' | 'storybook_watercolor' | 'american_superhero'>('graphic_novel_noir');

  // Panels state (default 4-6 panels)
  const [panels, setPanels] = useState<ComicPanel[]>([
    {
      id: 'p1',
      panelIndex: 0,
      cameraShot: 'establishing',
      characterIds: [],
      actionPrompt: 'A rainy neon alleyway in Neo-Detroit, steam rising from grates',
      speechBubbles: [],
    },
    {
      id: 'p2',
      panelIndex: 1,
      cameraShot: 'medium',
      characterIds: [],
      actionPrompt: 'Stepping out from the shadows, trench coat collar pulled up, glancing around cautiously',
      speechBubbles: [{ id: 'b1', text: 'I told them not to meet here.', xPct: 20, yPct: 15, type: 'thought', tailDirection: 'bottom_left' }],
    },
    {
      id: 'p3',
      panelIndex: 2,
      cameraShot: 'close_up',
      characterIds: [],
      actionPrompt: 'Looking directly ahead with determined eyes, gripping a data drive',
      speechBubbles: [{ id: 'b2', text: 'Where are they?!', xPct: 65, yPct: 20, type: 'speech', tailDirection: 'bottom_right' }],
    },
  ]);

  const [generating, setGenerating] = useState(false);
  const [activePanelIdx, setActivePanelIdx] = useState<number | null>(null);

  useEffect(() => {
    let saved = listSavedCharacters();
    if (!saved.length) {
      const defaultChar = createDefaultCharacter(
        'Kaelen Ross',
        'athletic build, sharp jawline, short silver hair, mechanical ocular implant on right eye, weathered leather duster'
      );
      saveCharacter(defaultChar);
      saved = [defaultChar];
    }
    setCharacters(saved);
    if (saved[0]) setSelectedCharId(saved[0].id);
  }, []);

  const currentChar = characters.find((c) => c.id === selectedCharId);

  const handleGenerateSequential = async () => {
    setGenerating(true);
    const updated = [...panels];

    for (let i = 0; i < updated.length; i++) {
      setActivePanelIdx(i);
      const panel = updated[i];

      const characterClause = currentChar ? `${currentChar.name}: ${currentChar.visualAnchor}` : 'a protagonist';

      try {
        const task = compileComicPanelTask({
          characterPrompt: characterClause,
          faceEmbeddingRef: currentChar?.turnaroundUrls.closeUp,
          sceneActionPrompt: panel.actionPrompt,
          cameraShot: panel.cameraShot,
          moodLighting: stylePreset === 'graphic_novel_noir' ? 'high contrast black ink and dramatic shadows' : 'vibrant cinematic tones',
          aspect: '1:1',
        });

        const res = await executePlajahNativeTask(task);

        if (res.success && res.mediaUrl) {
          panel.renderedImageUrl = res.mediaUrl;
          setPanels([...updated]);
        }
      } catch (e) {
        console.error('Failed generating panel', i, e);
      }
    }

    setActivePanelIdx(null);
    setGenerating(false);
  };

  const handlePushToTela = () => {
    const pageSpec: ComicPageSpec = {
      id: `comic_${Date.now()}`,
      title: pageTitle,
      pageNumber: 1,
      layoutPreset: layout,
      panels,
    };
    onInsertPageIntoTela?.(pageSpec);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#111215',
      color: '#e2e8f0',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      {/* Top Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        backgroundColor: '#17191e',
        borderBottom: '1px solid #282b33',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={20} color="#8b5cf6" />
          <span style={{ fontWeight: 600, fontSize: '15px' }}>Comic, Graphic Novel & Storybook Studio</span>
          <span style={{ fontSize: '11px', backgroundColor: '#232731', padding: '2px 8px', borderRadius: '12px', color: '#a78bfa' }}>
            Zero Character Drift · Multi-Panel Local Generation
          </span>
        </div>

        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            ✕
          </button>
        )}
      </div>

      {/* Main Two-Column View */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left Settings & Script Column */}
        <div style={{
          width: '380px',
          borderRight: '1px solid #282b33',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#14161a',
          padding: '16px',
          overflowY: 'auto',
          gap: '16px',
        }}>
          {/* Character Lock Selection */}
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <User size={13} />
              <span>Character Bible Lock</span>
            </label>
            <select
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1b1d23',
                border: '1px solid #2d313b',
                borderRadius: '5px',
                color: '#fff',
                fontSize: '12px',
              }}
            >
              {characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name} ({char.visualAnchor.slice(0, 35)}…)
                </option>
              ))}
            </select>
          </div>

          {/* Style Preset */}
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Story Aesthetic
            </label>
            <select
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#1b1d23',
                border: '1px solid #2d313b',
                borderRadius: '5px',
                color: '#fff',
                fontSize: '12px',
              }}
            >
              <option value="graphic_novel_noir">Graphic Novel Noir (Crisp Inking, Deep Shadow)</option>
              <option value="manga">Manga / Anime (Clean Line Art, Screen Tones)</option>
              <option value="storybook_watercolor">Storybook Watercolor (Children's Book Pigments)</option>
              <option value="american_superhero">American Superhero (Bold Cel-Shading & Color)</option>
            </select>
          </div>

          {/* Page Layout Preset */}
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <LayoutGrid size={13} />
              <span>Page Layout Format</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {[
                { id: 'grid_6', label: '6-Panel Standard' },
                { id: 'grid_9', label: '9-Panel Grid' },
                { id: 'dynamic_manga_4', label: 'Dynamic Manga 4' },
                { id: 'storybook_top_half', label: 'Storybook Page' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setLayout(fmt.id as any)}
                  style={{
                    padding: '8px',
                    fontSize: '11px',
                    backgroundColor: layout === fmt.id ? '#4c1d95' : '#1b1d23',
                    border: layout === fmt.id ? '1px solid #a78bfa' : '1px solid #282b33',
                    borderRadius: '4px',
                    color: layout === fmt.id ? '#fff' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Panel Story Director */}
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>
              Panel Narrative Shots ({panels.length})
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {panels.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    padding: '10px',
                    backgroundColor: '#1b1d23',
                    borderRadius: '6px',
                    border: activePanelIdx === idx ? '1px solid #8b5cf6' : '1px solid #282b33',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#c4b5fd' }}>Panel {idx + 1}</span>
                    <select
                      value={p.cameraShot}
                      onChange={(e) => {
                        const next = [...panels];
                        next[idx].cameraShot = e.target.value as any;
                        setPanels(next);
                      }}
                      style={{
                        fontSize: '10px',
                        backgroundColor: '#121316',
                        border: '1px solid #2d313b',
                        color: '#94a3b8',
                        borderRadius: '3px',
                        padding: '2px 4px',
                      }}
                    >
                      <option value="establishing">Establishing Shot</option>
                      <option value="medium">Medium Shot</option>
                      <option value="close_up">Close-Up Face</option>
                      <option value="extreme_close_up">Extreme Close-Up</option>
                      <option value="over_the_shoulder">Over the Shoulder</option>
                    </select>
                  </div>
                  <textarea
                    value={p.actionPrompt}
                    onChange={(e) => {
                      const next = [...panels];
                      next[idx].actionPrompt = e.target.value;
                      setPanels(next);
                    }}
                    placeholder="Panel action and emotion…"
                    style={{
                      width: '100%',
                      height: '46px',
                      backgroundColor: '#121316',
                      border: '1px solid #282b33',
                      borderRadius: '4px',
                      padding: '6px',
                      fontSize: '11px',
                      color: '#fff',
                      resize: 'none',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <button
            onClick={handleGenerateSequential}
            disabled={generating}
            style={{
              padding: '12px',
              backgroundColor: generating ? '#475569' : '#7c3aed',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontWeight: 600,
              fontSize: '13px',
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: 'auto',
            }}
          >
            {generating ? (
              <>
                <RotateCw size={16} className="animate-spin" />
                <span>Rendering Panel {activePanelIdx !== null ? activePanelIdx + 1 : ''} Locally…</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Entire Comic Page</span>
              </>
            )}
          </button>
        </div>

        {/* Right Interactive Comic Page Canvas */}
        <div style={{
          flex: 1,
          backgroundColor: '#0a0b0d',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflowY: 'auto',
        }}>
          {/* Simulated Comic Page Preview */}
          <div style={{
            width: '460px',
            minHeight: '620px',
            backgroundColor: '#ffffff',
            borderRadius: '4px',
            padding: '16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: layout === 'dynamic_manga_4' ? '1fr' : 'repeat(2, 1fr)',
              gap: '10px',
              flex: 1,
            }}>
              {panels.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: '#1e2025',
                    borderRadius: '2px',
                    border: '2px solid #000000',
                    minHeight: '140px',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p.renderedImageUrl ? (
                    <img
                      src={p.renderedImageUrl}
                      alt={`Panel ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '10px' }}>
                      <Camera size={18} style={{ margin: '0 auto 4px', opacity: 0.5 }} />
                      <div>Panel {idx + 1}</div>
                      <div style={{ fontSize: '9px', opacity: 0.7 }}>{p.cameraShot}</div>
                    </div>
                  )}

                  {/* Simulated Speech Bubble Overlay */}
                  {p.speechBubbles.map((bubble) => (
                    <div
                      key={bubble.id}
                      style={{
                        position: 'absolute',
                        top: `${bubble.yPct}%`,
                        left: `${bubble.xPct}%`,
                        backgroundColor: '#fff',
                        border: '1.5px solid #000',
                        borderRadius: bubble.type === 'thought' ? '14px' : '10px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#000',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        maxWidth: '120px',
                      }}
                    >
                      {bubble.text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Place into Tela Button */}
          {panels.some((p) => p.renderedImageUrl) && (
            <button
              onClick={handlePushToTela}
              style={{
                marginTop: '16px',
                padding: '10px 18px',
                backgroundColor: '#10b981',
                color: '#000',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Layers size={16} />
              <span>Insert as Editable Frames into Tela Canvas</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
