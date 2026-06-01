import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GitBranch, Plus, Trash2, Check, ChevronDown, Loader2,
  Clock, Film, ChevronRight, ChevronLeft, X,
} from 'lucide-react';
import { fetchUserAlbums, fetchUserVideos, updateVideo, auth } from '../services/backendService';
import type { Album, Video, WhatIfBranchPoint, WhatIfChoice } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function parseTime(str: string): number {
  const parts = str.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  return parseInt(str) || 0;
}

function newChoice(label = ''): WhatIfChoice {
  return { id: `choice_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, label, description: '' };
}

function newBranchPoint(videoId: string): WhatIfBranchPoint {
  return {
    id: `bp_${Date.now()}`,
    videoId,
    timestamp: 0,
    question: '',
    choices: [newChoice('Choice A'), newChoice('Choice B')],
    createdBy: auth.currentUser?.uid ?? '',
  };
}

// ── Branch point card ──────────────────────────────────────────────────────────

function BranchCard({
  bp, index, allVideos, onChange, onDelete,
}: {
  bp: WhatIfBranchPoint;
  index: number;
  allVideos: Video[];
  onChange: (updated: WhatIfBranchPoint) => void;
  onDelete: () => void;
}) {
  const [timeStr, setTimeStr] = useState(fmtTime(bp.timestamp));

  const updateBP = (patch: Partial<WhatIfBranchPoint>) => onChange({ ...bp, ...patch });
  const updateChoice = (idx: number, patch: Partial<WhatIfChoice>) => {
    const choices = bp.choices.map((c, i) => i === idx ? { ...c, ...patch } : c);
    updateBP({ choices });
  };
  const addChoice    = () => updateBP({ choices: [...bp.choices, newChoice(`Choice ${String.fromCharCode(65 + bp.choices.length)}`)] });
  const removeChoice = (idx: number) => updateBP({ choices: bp.choices.filter((_, i) => i !== idx) });

  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[8px] font-black uppercase tracking-[0.3em] text-white/25 mb-1.5';

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-2xl bg-violet-500/15 flex items-center justify-center">
            <GitBranch size={14} className="text-violet-400" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-white">Branch Point {index + 1}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/25 font-black">{fmtTime(bp.timestamp)}</span>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-white/20 hover:text-red-400 transition-all">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Timestamp */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Pause at (mm:ss)</label>
          <div className="relative">
            <Clock size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={timeStr}
              onChange={e => setTimeStr(e.target.value)}
              onBlur={() => updateBP({ timestamp: parseTime(timeStr) })}
              placeholder="e.g. 1:24:30"
              className={`${inputCls} pl-8`} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Question / prompt</label>
          <input value={bp.question}
            onChange={e => updateBP({ question: e.target.value })}
            placeholder="What should happen next?"
            className={inputCls} />
        </div>
      </div>

      {/* Choices */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className={labelCls}>Choices ({bp.choices.length}/4)</label>
          {bp.choices.length < 4 && (
            <button onClick={addChoice}
              className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all">
              <Plus size={10} /> Add Choice
            </button>
          )}
        </div>

        {bp.choices.map((choice, ci) => (
          <div key={choice.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-white/8 flex items-center justify-center text-[8px] font-black text-white/30 flex-shrink-0">
                {String.fromCharCode(65 + ci)}
              </span>
              <input value={choice.label}
                onChange={e => updateChoice(ci, { label: e.target.value })}
                placeholder="Choice label shown to viewer"
                className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20" />
              {bp.choices.length > 2 && (
                <button onClick={() => removeChoice(ci)} className="text-white/15 hover:text-red-400 transition-all">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Jump to timestamp (sec)</label>
                <input type="number" min="0"
                  value={choice.jumpsToTimestamp ?? ''}
                  onChange={e => updateChoice(ci, { jumpsToTimestamp: parseInt(e.target.value) || undefined })}
                  placeholder="Seconds into this video"
                  className={`${inputCls} text-xs`} />
              </div>
              <div>
                <label className={labelCls}>Jump to alternate video</label>
                <select
                  value={choice.jumpsToVideoId ?? ''}
                  onChange={e => updateChoice(ci, { jumpsToVideoId: e.target.value || undefined })}
                  className={`${inputCls} appearance-none text-xs`}>
                  <option value="">Same video</option>
                  {allVideos.map(v => (
                    <option key={v.id} value={v.id}>{v.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Description (optional)</label>
              <input value={choice.description ?? ''}
                onChange={e => updateChoice(ci, { description: e.target.value })}
                placeholder="Hint shown below the choice label"
                className={`${inputCls} text-xs`} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmWhatIfEditor() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [videos, setVideos]         = useState<Video[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [branchPoints, setBranchPoints]       = useState<WhatIfBranchPoint[]>([]);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    Promise.all([
      fetchUserAlbums(auth.currentUser.uid),
      fetchUserVideos(auth.currentUser.uid),
    ]).then(([albs, vids]) => {
      setAlbums(albs.filter(a => a.type === 'VIDEO'));
      setVideos(vids);
      if (vids.length > 0) {
        const v = vids[0];
        setSelectedVideoId(v.id);
        setBranchPoints(v.whatIfBranchPoints ?? []);
      }
      setLoading(false);
    });
  }, []);

  const handleVideoChange = (id: string) => {
    setSelectedVideoId(id);
    const v = videos.find(x => x.id === id);
    setBranchPoints(v?.whatIfBranchPoints ?? []);
  };

  const addBranchPoint = () => {
    if (!selectedVideoId) return;
    setBranchPoints(prev => [...prev, newBranchPoint(selectedVideoId)]);
  };

  const handleSave = async () => {
    if (!selectedVideoId || saving) return;
    setSaving(true);
    await updateVideo(selectedVideoId, { whatIfBranchPoints: branchPoints });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return (
    <div className="py-24 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/15 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Interactive<br />Film Editor</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Add branch points where viewers choose what happens next</p>
        </div>
        <button onClick={handleSave} disabled={saving || !selectedVideoId}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ background: saved ? '#22c55e' : '#818cf8', color: '#fff' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <><Check size={14} /> Saved!</> : 'Save Branches'}
        </button>
      </div>

      {/* Explainer */}
      <div className="p-5 rounded-2xl border border-violet-500/20 bg-violet-500/6">
        <p className="text-[9px] font-black uppercase tracking-widest text-violet-400 mb-1.5">How it works</p>
        <p className="text-[10px] text-white/40 leading-relaxed">
          Add branch points at specific timestamps in your video. Playback pauses and the viewer sees your question with 2–4 choices. Each choice can jump to a different timestamp or an entirely separate video (alternate endings, bonus scenes).
        </p>
      </div>

      {/* Video selector */}
      {videos.length > 0 ? (
        <div className="relative w-full max-w-sm">
          <select value={selectedVideoId} onChange={e => handleVideoChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
            {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-white/8 bg-white/[0.02] text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Upload videos first in the Video Manager</p>
        </div>
      )}

      {/* Branch points */}
      {selectedVideoId && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">
              {branchPoints.length} Branch Point{branchPoints.length !== 1 ? 's' : ''}
            </p>
            <button onClick={addBranchPoint}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-violet-500/15 text-violet-400 hover:bg-violet-500/20 transition-all border border-violet-500/25">
              <Plus size={12} /> Add Branch Point
            </button>
          </div>

          {branchPoints.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
              <GitBranch size={28} className="text-white/12" />
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No branch points yet</p>
              <p className="text-[9px] text-white/12">Click "Add Branch Point" to make your film interactive</p>
            </div>
          ) : (
            // Sort by timestamp
            [...branchPoints].sort((a, b) => a.timestamp - b.timestamp).map((bp, i) => (
              <BranchCard
                key={bp.id}
                bp={bp}
                index={i}
                allVideos={videos.filter(v => v.id !== selectedVideoId)}
                onChange={updated => setBranchPoints(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onDelete={() => setBranchPoints(prev => prev.filter(x => x.id !== bp.id))}
              />
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}
