/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Script } from './types';
import { SAMPLE_SCRIPTS } from './sampleScripts';
import { parseCuePoints, estimateDuration } from './scriptParser';
import { 
  Plus, Trash2, Edit3, Sparkles, BookOpen, Clock, 
  Settings2, Play, Keyboard, Monitor, FileText, 
  HelpCircle, Check, Copy, CheckSquare
} from 'lucide-react';

interface EditorScreenProps {
  scripts: Script[];
  onSaveScript: (script: Script) => void;
  onDeleteScript: (id: string) => void;
  onSelectScript: (script: Script, role: 'solo' | 'operator' | 'prompter') => void;
  onResetSamples: () => void;
}

export default function EditorScreen({
  scripts,
  onSaveScript,
  onDeleteScript,
  onSelectScript,
  onResetSamples
}: EditorScreenProps) {
  const [activeScriptId, setActiveScriptId] = useState<string>(scripts[0]?.id || '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Active script selection
  const activeScript = useMemo(() => {
    return scripts.find(s => s.id === activeScriptId) || scripts[0] || null;
  }, [scripts, activeScriptId]);

  // Synchronize internal input values when active script shifts
  useEffect(() => {
    if (activeScript) {
      setTitle(activeScript.title);
      setContent(activeScript.content);
      setActiveScriptId(activeScript.id);
    } else {
      setTitle('');
      setContent('');
    }
  }, [activeScript]);

  // Handle local saving as the user types
  const handleSave = () => {
    if (!activeScriptId) return;
    onSaveScript({
      id: activeScriptId,
      title: title.trim() || 'Untitled Script',
      content: content,
      createdAt: activeScript?.createdAt || Date.now(),
      updatedAt: Date.now()
    });
  };

  // Trigger auto-save when leaving fields or periodically
  const handleBlur = () => {
    handleSave();
  };

  // New script action
  const handleCreateNew = () => {
    const newId = `script-${Date.now()}`;
    const newScript: Script = {
      id: newId,
      title: 'My New Script',
      content: `# [Scene 1: Introduction]\nWrite or paste your script here.\n\n# [Scene 2: Key Features]\nAny line that starts with a "#" or is wrapped in square brackets "[Label]" is turned into a clickable cue point in the Operator console.`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    onSaveScript(newScript);
    setActiveScriptId(newId);
  };

  // Live Statistics
  const stats = useMemo(() => {
    const cleanContent = content.replace(/[#\[\]]/g, '');
    const charCount = content.length;
    const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;
    const cues = parseCuePoints(content);
    const readingTime = estimateDuration(content, 145); // average conversational tempo

    return {
      charCount,
      wordCount,
      cueCount: cues.length,
      readingTime,
      cues
    };
  }, [content]);

  return (
    <div className="flex h-screen bg-[#050505] text-[#E0E0E0] font-sans overflow-hidden">
      
      {/* Sidebar: Scripts Listing */}
      <aside className="w-80 bg-[#0A0A0A] border-r border-white/10 flex flex-col justify-between overflow-hidden">
        
        {/* Title/Branding */}
        <div className="p-5 border-b border-white/10 bg-[#070707]">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-white font-display">Prompter Pro</h1>
              <p className="text-[9px] text-white/40 font-mono tracking-widest">STUDIO WORKSPACE</p>
            </div>
          </div>
        </div>

        {/* Scripts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0A0A0A]">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] font-mono">My Scripts</span>
            <button
              id="btn-create-script"
              onClick={handleCreateNew}
              className="p-1 hover:bg-white/5 text-white/80 hover:text-white rounded border border-white/10 transition-all flex items-center gap-0.5 text-[10px] font-mono font-medium"
              title="Create New Script"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD</span>
            </button>
          </div>

          {scripts.length === 0 ? (
            <div className="py-12 text-center text-white/30 flex flex-col items-center">
              <FileText className="w-8 h-8 text-white/10 mb-2" />
              <p className="text-xs">No scripts created yet</p>
              <button
                onClick={handleCreateNew}
                className="mt-4 px-4 py-2 text-[10px] bg-white text-black font-bold uppercase tracking-wider rounded hover:bg-white/90 transition-colors"
              >
                Create First Script
              </button>
            </div>
          ) : (
            scripts.map((s) => {
              const isActive = s.id === activeScriptId;
              const cleanBody = s.content.replace(/[#\[\]]/g, '');
              const words = cleanBody.split(/\s+/).filter(w => w.length > 0).length;

              return (
                <div
                  key={s.id}
                  onClick={() => setActiveScriptId(s.id)}
                  className={`group relative flex flex-col p-3.5 rounded-lg cursor-pointer border transition-all ${
                    isActive 
                      ? 'bg-gradient-to-br from-white/10 to-transparent border-white/20 text-white shadow-lg' 
                      : 'bg-white/[0.02] border-white/5 text-white/50 hover:bg-white/[0.05] hover:text-white/80'
                  }`}
                >
                  <div className="flex items-start justify-between pr-4">
                    <span className="font-semibold text-xs tracking-wide truncate max-w-[160px]">{s.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Are you sure you want to delete this script?')) {
                          onDeleteScript(s.id);
                          if (activeScriptId === s.id && scripts.length > 1) {
                            const remaining = scripts.filter(x => x.id !== s.id);
                            setActiveScriptId(remaining[0].id);
                          }
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/5 text-white/40 hover:text-red-400 rounded transition-all absolute right-2 top-2"
                      title="Delete script"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-white/30">
                    <span>{words} words</span>
                    <span>•</span>
                    <span>{estimateDuration(s.content, 145) > 60 
                      ? `${Math.round(estimateDuration(s.content, 145) / 60)}m` 
                      : `${Math.round(estimateDuration(s.content, 145))}s`
                    } speaking</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-white/10 bg-[#070707] flex flex-col gap-2">
          <button
            onClick={() => setShowKeyboardHelp(true)}
            className="w-full py-2 bg-white/5 hover:bg-white/10 text-[10px] text-white/60 hover:text-white uppercase tracking-wider rounded border border-white/10 flex items-center justify-center gap-1.5 transition-colors font-mono"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>KEYBOARD HELP</span>
          </button>
          
          <button
            onClick={() => {
              if (confirm('This will restore default tutorials and replace missing samples. Proceed?')) {
                onResetSamples();
              }
            }}
            className="w-full py-2 bg-transparent hover:bg-white/[0.02] text-[9px] text-white/30 hover:text-white/50 rounded flex items-center justify-center gap-1 transition-colors font-mono uppercase tracking-wider"
          >
            <Sparkles className="w-3 h-3" />
            <span>Restore Defaults</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      {activeScript ? (
        <main className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
          
          {/* Editor Header Inputs */}
          <div className="p-6 bg-[#0A0A0A] border-b border-white/10 flex items-center justify-between gap-4">
            <div className="flex-1 max-w-xl">
              <input
                id="inp-script-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleBlur}
                placeholder="Script Title..."
                className="w-full bg-transparent text-xl font-bold italic tracking-tight text-white border-b border-transparent focus:border-white focus:outline-none pb-1"
              />
              <span className="text-[9px] font-mono text-white/40 mt-1 block uppercase tracking-widest">Active Script Title</span>
            </div>

            {/* Launch / Mode Deck buttons */}
            <div className="flex items-center gap-3">
              
              {/* Solo All-In-One Mode */}
              <button
                id="btn-launch-solo"
                onClick={() => {
                  handleSave();
                  onSelectScript(activeScript, 'solo');
                }}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-[11px] text-white uppercase tracking-wider font-semibold rounded border border-white/10 hover:border-white/20 flex items-center gap-1.5 transition-all"
                title="Run prompter and control in this window"
              >
                <Monitor className="w-4 h-4 text-white/60" />
                <span>Solo Mode</span>
              </button>

              {/* Dual-Display Operator Mode */}
              <button
                id="btn-launch-operator"
                onClick={() => {
                  handleSave();
                  onSelectScript(activeScript, 'operator');
                }}
                className="px-6 py-2.5 bg-white text-black font-bold text-[11px] uppercase tracking-wider rounded shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:bg-white/90 hover:scale-[1.01] transition-all flex items-center gap-1.5"
                title="Open Dual Screen controller console"
              >
                <Settings2 className="w-4 h-4" />
                <span>LAUNCH CONTROLLER</span>
              </button>

            </div>
          </div>

          {/* Editor Grid: Content Textarea and parsed Cues sidebar */}
          <div className="flex-1 grid grid-cols-12 overflow-hidden bg-[#050505]">
            
            {/* Input Column */}
            <div className="col-span-8 flex flex-col p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.15em] font-mono">Script Editor</span>
                <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">LOCAL STORAGE AUTO-SAVE</span>
              </div>
              <textarea
                id="txt-script-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onBlur={handleBlur}
                placeholder="Write your text or script here..."
                className="flex-1 bg-[#0A0A0A]/60 hover:bg-[#0A0A0A]/80 focus:bg-[#0A0A0A] border border-white/10 focus:border-white/20 p-6 rounded-xl resize-none focus:outline-none text-white/95 text-sm leading-relaxed font-sans scrollbar-thin overflow-y-auto transition-colors shadow-inner"
              />
            </div>

            {/* Cue Parsing Monitor & Live Stats Column */}
            <div className="col-span-4 border-l border-white/10 p-6 flex flex-col gap-6 overflow-hidden bg-[#080808]/40">
              
              {/* Live Statistics Card */}
              <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/60" />
                  Estimated Duration
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/60 p-3 rounded-lg border border-white/5">
                    <p className="text-[8px] text-white/40 font-mono uppercase tracking-wider">Total Time</p>
                    <p className="text-md font-bold font-mono text-white mt-0.5">
                      {stats.readingTime > 60 
                        ? `${Math.floor(stats.readingTime / 60)}m ${Math.round(stats.readingTime % 60)}s` 
                        : `${Math.round(stats.readingTime)}s`
                      }
                    </p>
                  </div>
                  <div className="bg-black/60 p-3 rounded-lg border border-white/5">
                    <p className="text-[8px] text-white/40 font-mono uppercase tracking-wider">Words</p>
                    <p className="text-md font-bold font-mono text-white mt-0.5">{stats.wordCount}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center px-1 text-[9px] text-white/40 font-mono uppercase tracking-wider">
                  <span>Chars: {stats.charCount}</span>
                  <span>Cues: {stats.cueCount}</span>
                </div>
              </div>

              {/* Cue Preview panel */}
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0A] border border-white/10 rounded-xl p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 font-mono flex items-center gap-1.5 border-b border-white/10 pb-2 mb-2">
                  <CheckSquare className="w-3.5 h-3.5 text-white/60" />
                  Cue Markers ({stats.cueCount})
                </h3>

                {stats.cues.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <HelpCircle className="w-7 h-7 text-white/20 mb-1.5" />
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">No Cues Found</p>
                    <p className="text-[10px] text-white/30 mt-1 leading-normal max-w-[200px]">
                      Begin any line with "#" or label like "[Intro]" to automatically register scroll cue points.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                    {stats.cues.map((cue, index) => (
                      <div
                        key={cue.id}
                        className="py-2 px-3 bg-black/60 border border-white/5 rounded text-[11px] font-mono text-white/70 flex items-center justify-between"
                      >
                        <span className="truncate pr-2 font-medium">{cue.label}</span>
                        <span className="text-[9px] text-white/30">Line {cue.lineIndex + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

        </main>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#050505]">
          <BookOpen className="w-12 h-12 text-white/10 mb-3" />
          <h2 className="text-md font-bold uppercase tracking-wider text-white">Select or Create a Script</h2>
          <p className="text-xs text-white/40 max-w-sm mt-1 leading-relaxed">
            Select an existing presentation template from the sidebar or click ADD to start editing your speech scripts.
          </p>
          <button
            onClick={handleCreateNew}
            className="mt-6 px-6 py-2.5 bg-white text-black font-bold uppercase tracking-wider text-[11px] rounded transition-all hover:bg-white/95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            Create New Script
          </button>
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showKeyboardHelp && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white font-mono flex items-center gap-1.5">
                <Keyboard className="w-4 h-4 text-white/80" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowKeyboardHelp(false)}
                className="text-white/40 hover:text-white font-bold text-xs uppercase tracking-wider font-mono cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {[
                { keys: ['SPACEBAR'], action: 'Play / Pause scrolling' },
                { keys: ['▲ Arrow Up'], action: 'Increase scroll speed (Speed Up)' },
                { keys: ['▼ Arrow Down'], action: 'Decrease scroll speed (Slow Down)' },
                { keys: ['◀ Arrow Left'], action: 'Jump backward 5% in script' },
                { keys: ['▶ Arrow Right'], action: 'Jump forward 5% in script' },
                { keys: ['ESCAPE'], action: 'Pause scrolling and Reset to Top' }
              ].map((shortcut, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-white/5 text-[11px]">
                  <div className="flex gap-1.5">
                    {shortcut.keys.map((k, kIdx) => (
                      <kbd key={kIdx} className="bg-black text-white/80 border border-white/10 px-2 py-0.5 rounded font-mono font-bold text-[9px] uppercase tracking-wider">
                        {k}
                      </kbd>
                    ))}
                  </div>
                  <span className="text-white/60 font-mono">{shortcut.action}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowKeyboardHelp(false)}
              className="mt-6 w-full py-3 bg-white text-black font-bold uppercase tracking-widest text-[10px] rounded transition-colors"
            >
              Done / Back to Workspace
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
