import React, { useState } from 'react';
import { PenLine, BookOpen, X, Film, BookMarked, Sparkles, Headphones } from 'lucide-react';
import { TelaAudiobookStudio } from './TelaAudiobookStudio';
import type { ScriptElement } from '../../types';
import type { TelaBlock } from '../../types';
import { makeBlock, newBlockId } from './TelaWriter';
import ScriptWritingStudio from '../ScriptWritingStudio';
import WritersDesk from '../lorea/WritersDesk';

export interface TelaWritingStudioProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
  onInsertScriptToCanvas: (script: { title: string; blocks: TelaBlock[] }) => void;
  initialTab?: 'SCRIPT' | 'DESK' | 'AUDIOBOOK';
}

/**
 * Converts Screenplay ScriptElements into TelaBlocks formatted for Tela Canvas Writer frames.
 */
export function scriptElementsToTelaBlocks(elements: ScriptElement[]): TelaBlock[] {
  const blocks: TelaBlock[] = [];

  for (const el of elements) {
    const text = el.text.trim();
    if (!text && el.type !== 'SCENE_HEADING') continue;

    switch (el.type) {
      case 'SCENE_HEADING':
        blocks.push({
          ...makeBlock('h2', text.toUpperCase()),
          id: newBlockId(),
          textRole: 'HEADING',
          semanticLabel: 'Scene Heading',
        });
        break;

      case 'CHARACTER':
        blocks.push({
          ...makeBlock('h3', text.toUpperCase()),
          id: newBlockId(),
          textRole: 'CHARACTER',
          semanticLabel: 'Character Name',
        });
        break;

      case 'DIALOGUE':
        blocks.push({
          ...makeBlock('quote', text),
          id: newBlockId(),
          textRole: 'DIALOGUE',
          semanticLabel: 'Dialogue',
        });
        break;

      case 'PARENTHETICAL':
        blocks.push({
          ...makeBlock('p', text.startsWith('(') ? text : `(${text})`),
          id: newBlockId(),
          textRole: 'PARENTHETICAL',
          semanticLabel: 'Parenthetical',
        });
        break;

      case 'TRANSITION':
        blocks.push({
          ...makeBlock('p', text.toUpperCase()),
          id: newBlockId(),
          textRole: 'TRANSITION',
          semanticLabel: 'Transition',
        });
        break;

      case 'SECTION':
        blocks.push({
          ...makeBlock('callout', text),
          id: newBlockId(),
          textRole: 'SECTION',
          semanticLabel: 'Act / Section',
        });
        break;

      case 'NOTE':
        blocks.push({
          ...makeBlock('callout', text),
          id: newBlockId(),
          textRole: 'NOTE',
          semanticLabel: 'Author Note',
        });
        break;

      case 'ACTION':
      case 'SHOT':
      default:
        blocks.push({
          ...makeBlock('p', text),
          id: newBlockId(),
          textRole: 'ACTION',
          semanticLabel: el.type === 'SHOT' ? 'Camera Shot' : 'Action',
        });
        break;
    }
  }

  if (blocks.length === 0) {
    blocks.push(makeBlock('p', ''));
  }

  return blocks;
}

/**
 * TelaWritingStudio — Merges Lorea's literary writing suite (The Writer's Desk)
 * and Plajah's Screenplay Studio directly into the Tela Studio canvas.
 */
export const TelaWritingStudio: React.FC<TelaWritingStudioProps> = ({
  isOpen,
  onClose,
  user,
  onInsertScriptToCanvas,
  initialTab = 'SCRIPT',
}) => {
  const [tab, setTab] = useState<'SCRIPT' | 'DESK' | 'AUDIOBOOK'>(initialTab);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[280] flex flex-col bg-[#0b0910] text-white"
      style={{
        boxShadow: '0 32px 100px rgba(0,0,0,0.85)',
      }}
    >
      {/* Studio Header & Switcher */}
      <header
        className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/10"
        style={{
          background: 'linear-gradient(180deg, #161222 0%, #0d0a16 100%)',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className="grid place-items-center w-8 h-8 rounded-xl text-white shadow-md"
              style={{
                background: 'linear-gradient(135deg, #6B0099 0%, #D40055 100%)',
              }}
            >
              <PenLine size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display italic text-white text-base font-bold">
                  Tela Writing Studio
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Lorea + Screenplay
                </span>
              </div>
              <p className="text-[10px] text-white/45 hidden sm:block">
                Professional screenwriting and authoring desk merged seamlessly into your canvas.
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-white/[0.06] border border-white/10 ml-4">
            <button
              onClick={() => setTab('SCRIPT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'SCRIPT'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film size={13} />
              <span>Screenplay Studio</span>
            </button>
            <button
              onClick={() => setTab('DESK')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'DESK'
                  ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <BookMarked size={13} />
              <span>The Writer&apos;s Desk (Lorea)</span>
            </button>
            <button
              onClick={() => setTab('AUDIOBOOK')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                tab === 'AUDIOBOOK'
                  ? 'bg-gradient-to-r from-purple-600 to-amber-500 text-white shadow'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Headphones size={13} />
              <span>Audiobook Studio</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Close Writing Studio"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {tab === 'SCRIPT' ? (
          <ScriptWritingStudio
            onBack={onClose}
            user={user}
            onSendToTela={({ title, elements }) => {
              const blocks = scriptElementsToTelaBlocks(elements);
              onInsertScriptToCanvas({ title, blocks });
              onClose();
            }}
          />
        ) : tab === 'DESK' ? (
          <WritersDesk
            currentUser={user}
            onBackToLibrary={onClose}
          />
        ) : (
          <TelaAudiobookStudio onClose={onClose} />
        )}
      </div>
    </div>
  );
};

export default TelaWritingStudio;
