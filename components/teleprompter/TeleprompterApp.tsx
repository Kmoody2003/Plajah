/**
 * TeleprompterApp — the Plajah Teleprompter, running as a platform app.
 *
 * Adapted from the standalone teleprompter: same Editor → Operator/Solo flow and
 * BroadcastChannel sync to talent Prompter windows (opened at ?role=prompter,
 * short-circuited in index.tsx). The `?role=prompter` boot branch is removed here
 * because Plajah's entrypoint handles the talent window. This is ALSO the shared
 * teleprompting engine — TV Studio and the Podcast Studio embed PrompterScreen /
 * OperatorConsole directly.
 */
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Script } from './types';
import { SAMPLE_SCRIPTS } from './sampleScripts';
import EditorScreen from './EditorScreen';
import OperatorConsole from './OperatorConsole';
import PrompterScreen from './PrompterScreen';

export default function TeleprompterApp({ onClose }: { onClose?: () => void }) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [activeScript, setActiveScript] = useState<Script | null>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'solo' | 'operator' | 'prompter'>('editor');

  useEffect(() => {
    const stored = localStorage.getItem('teleprompter_scripts');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Script[];
        if (parsed.length > 0) { setScripts(parsed); setActiveScript(parsed[0]); return; }
      } catch (err) { console.error('Failed to parse stored scripts:', err); }
    }
    setScripts(SAMPLE_SCRIPTS);
    setActiveScript(SAMPLE_SCRIPTS[0]);
    localStorage.setItem('teleprompter_scripts', JSON.stringify(SAMPLE_SCRIPTS));
  }, []);

  const handleSaveScript = (updated: Script) => {
    setScripts((prev) => {
      const idx = prev.findIndex((s) => s.id === updated.id);
      const next = idx > -1 ? prev.map((s, i) => (i === idx ? updated : s)) : [updated, ...prev];
      localStorage.setItem('teleprompter_scripts', JSON.stringify(next));
      return next;
    });
    if (activeScript?.id === updated.id || !activeScript) setActiveScript(updated);
  };

  const handleDeleteScript = (id: string) => {
    setScripts((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem('teleprompter_scripts', JSON.stringify(next));
      if (activeScript?.id === id) setActiveScript(next[0] || null);
      return next;
    });
  };

  const handleResetSamples = () => {
    setScripts(SAMPLE_SCRIPTS);
    setActiveScript(SAMPLE_SCRIPTS[0]);
    localStorage.setItem('teleprompter_scripts', JSON.stringify(SAMPLE_SCRIPTS));
    setViewMode('editor');
  };

  const handleSelectScript = (script: Script, mode: 'solo' | 'operator' | 'prompter') => {
    setActiveScript(script);
    setViewMode(mode);
  };

  const closeBtn = onClose && viewMode === 'editor' ? (
    <button onClick={onClose} title="Exit to Apps"
      className="fixed top-4 right-4 z-[60] w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white/70 hover:text-white grid place-items-center">
      <X size={18} />
    </button>
  ) : null;

  return (
    <div className="fixed inset-0 z-[55] bg-zinc-950 overflow-auto">
      {closeBtn}
      {viewMode === 'solo' && (
        <PrompterScreen initialScriptTitle={activeScript?.title || 'Solo Prompt'} initialScriptContent={activeScript?.content || ''} isStandalone onExit={() => setViewMode('editor')} />
      )}
      {viewMode === 'operator' && (activeScript ? (
        <OperatorConsole scriptId={activeScript.id} scriptTitle={activeScript.title} scriptContent={activeScript.content} onBackToDashboard={() => setViewMode('editor')} />
      ) : (
        <div className="flex items-center justify-center h-screen bg-zinc-950 text-white"><p>No active script. Go back to the dashboard.</p></div>
      ))}
      {(viewMode === 'editor' || viewMode === 'prompter') && (
        <EditorScreen scripts={scripts} onSaveScript={handleSaveScript} onDeleteScript={handleDeleteScript} onSelectScript={handleSelectScript} onResetSamples={handleResetSamples} />
      )}
    </div>
  );
}
