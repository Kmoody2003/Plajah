import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles, CheckCircle2, AlertTriangle, Shield,
  Layers, Info, Save, RotateCcw, Activity
} from 'lucide-react';
import type { ToothRecord, DentalCondition, ToothSurface } from '../../types/clinic';

interface DentalOdontogramProps {
  initialChart?: Record<string, ToothRecord>;
  patientName?: string;
  onSave?: (chart: Record<string, ToothRecord>) => void;
  readOnly?: boolean;
}

const CONDITIONS: { id: DentalCondition; label: string; color: string; bg: string }[] = [
  { id: 'HEALTHY', label: 'Healthy', color: '#06D6A0', bg: 'rgba(6, 214, 160, 0.15)' },
  { id: 'CARIES', label: 'Caries (Cavity)', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
  { id: 'RESTORED', label: 'Filling / Restored', color: '#00DAF3', bg: 'rgba(0, 218, 243, 0.15)' },
  { id: 'CROWN', label: 'Crown', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)' },
  { id: 'ROOT_CANAL', label: 'Root Canal', color: '#D40055', bg: 'rgba(212, 0, 85, 0.15)' },
  { id: 'IMPLANT', label: 'Implant', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
  { id: 'WATCH', label: 'Watch / Monitor', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  { id: 'MISSING', label: 'Missing / Extracted', color: '#64748B', bg: 'rgba(100, 116, 139, 0.15)' },
];

const SURFACES: { id: ToothSurface; label: string }[] = [
  { id: 'M', label: 'Mesial (M)' },
  { id: 'O', label: 'Occlusal/Incisal (O)' },
  { id: 'D', label: 'Distal (D)' },
  { id: 'B', label: 'Buccal/Facial (B)' },
  { id: 'L', label: 'Lingual (L)' },
];

// Universal Tooth Numbers
const UPPER_TEETH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const LOWER_TEETH = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17];

const PEDIATRIC_UPPER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const PEDIATRIC_LOWER = ['T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K'];

export const DentalOdontogram: React.FC<DentalOdontogramProps> = ({
  initialChart = {},
  patientName = 'Patient',
  onSave,
  readOnly = false,
}) => {
  const [chart, setChart] = useState<Record<string, ToothRecord>>(() => {
    // Seed initial demo tooth records if empty
    if (Object.keys(initialChart).length > 0) return initialChart;
    return {
      '14': { toothNumber: 14, condition: 'CROWN', surfaces: ['O'], notes: 'Porcelain crown placed 2021', updatedAt: Date.now() },
      '19': { toothNumber: 19, condition: 'CARIES', surfaces: ['O', 'D'], notes: 'Deep occlusal decay near pulp', periodontalPocketMm: 5, updatedAt: Date.now() },
      '30': { toothNumber: 30, condition: 'RESTORED', surfaces: ['M', 'O'], notes: 'Amalgam restoration intact', updatedAt: Date.now() },
      '1': { toothNumber: 1, condition: 'MISSING', surfaces: [], notes: 'Extracted wisdom tooth', updatedAt: Date.now() },
      '16': { toothNumber: 16, condition: 'MISSING', surfaces: [], notes: 'Extracted wisdom tooth', updatedAt: Date.now() },
      '17': { toothNumber: 17, condition: 'MISSING', surfaces: [], notes: 'Extracted wisdom tooth', updatedAt: Date.now() },
      '32': { toothNumber: 32, condition: 'MISSING', surfaces: [], notes: 'Extracted wisdom tooth', updatedAt: Date.now() },
    };
  });

  const [selectedTooth, setSelectedTooth] = useState<string | number>(19);
  const [isPediatric, setIsPediatric] = useState(false);
  const [activeBrush, setActiveBrush] = useState<DentalCondition>('CARIES');

  const currentToothRecord: ToothRecord = chart[String(selectedTooth)] || {
    toothNumber: selectedTooth,
    condition: 'HEALTHY',
    surfaces: [],
    periodontalPocketMm: 2,
    notes: '',
    updatedAt: Date.now(),
  };

  const handleToothClick = (toothNum: string | number) => {
    setSelectedTooth(toothNum);
  };

  const applyBrushToTooth = (toothNum: string | number, condition: DentalCondition) => {
    if (readOnly) return;
    const key = String(toothNum);
    const existing = chart[key] || { toothNumber: toothNum, surfaces: [], updatedAt: Date.now() };
    const updated: Record<string, ToothRecord> = {
      ...chart,
      [key]: {
        ...existing,
        condition,
        updatedAt: Date.now(),
      },
    };
    setChart(updated);
    if (onSave) onSave(updated);
  };

  const toggleSurface = (surf: ToothSurface) => {
    if (readOnly) return;
    const key = String(selectedTooth);
    const existingSurfaces = currentToothRecord.surfaces || [];
    const newSurfaces = existingSurfaces.includes(surf)
      ? existingSurfaces.filter(s => s !== surf)
      : [...existingSurfaces, surf];

    const updated: Record<string, ToothRecord> = {
      ...chart,
      [key]: {
        ...currentToothRecord,
        surfaces: newSurfaces,
        updatedAt: Date.now(),
      },
    };
    setChart(updated);
    if (onSave) onSave(updated);
  };

  const updatePocketDepth = (depth: number) => {
    if (readOnly) return;
    const key = String(selectedTooth);
    const updated: Record<string, ToothRecord> = {
      ...chart,
      [key]: {
        ...currentToothRecord,
        periodontalPocketMm: depth,
        updatedAt: Date.now(),
      },
    };
    setChart(updated);
    if (onSave) onSave(updated);
  };

  const updateToothNotes = (notes: string) => {
    if (readOnly) return;
    const key = String(selectedTooth);
    const updated: Record<string, ToothRecord> = {
      ...chart,
      [key]: {
        ...currentToothRecord,
        notes,
        updatedAt: Date.now(),
      },
    };
    setChart(updated);
    if (onSave) onSave(updated);
  };

  const getConditionStyle = (cond?: DentalCondition) => {
    return CONDITIONS.find(c => c.id === cond) || CONDITIONS[0];
  };

  const upperList = isPediatric ? PEDIATRIC_UPPER : UPPER_TEETH;
  const lowerList = isPediatric ? PEDIATRIC_LOWER : LOWER_TEETH;

  return (
    <div className="bg-[#0e0719]/90 border border-white/10 rounded-3xl p-6 text-white backdrop-blur-xl shadow-2xl flex flex-col gap-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#00DAF3]/20 border border-[#00DAF3]/40 text-[#00DAF3] uppercase tracking-wider">
              Oral Health Odontogram
            </span>
            <span className="text-xs text-white/50">• {patientName}</span>
          </div>
          <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white mt-1">
            Interactive Dental Chart (Universal 1–32)
          </h3>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPediatric(false)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              !isPediatric
                ? 'bg-white text-black shadow-lg shadow-white/10'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            Adult (1–32)
          </button>
          <button
            type="button"
            onClick={() => setIsPediatric(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isPediatric
                ? 'bg-[#00DAF3] text-black shadow-lg shadow-[#00DAF3]/20'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            Pediatric (A–T)
          </button>
        </div>
      </div>

      {/* Quick Condition Brushes */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white/[0.03] border border-white/[0.07] rounded-2xl">
        <span className="text-xs font-mono text-white/50 uppercase tracking-wider mr-2">Condition Brush:</span>
        {CONDITIONS.map(c => {
          const isSelected = activeBrush === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveBrush(c.id);
                applyBrushToTooth(selectedTooth, c.id);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all"
              style={{
                borderColor: isSelected ? c.color : 'rgba(255,255,255,0.1)',
                background: isSelected ? c.bg : 'rgba(255,255,255,0.03)',
                color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)',
                boxShadow: isSelected ? `0 0 12px ${c.color}40` : 'none',
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Dental Arch Visualizer */}
      <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-6 overflow-x-auto">
        
        {/* Upper Arch (Maxillary) */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-white/40 uppercase mb-2">
            <span>Patient Right (Quad 1)</span>
            <span className="font-bold text-white/60">MAXILLARY ARCH (UPPER)</span>
            <span>Patient Left (Quad 2)</span>
          </div>
          <div className="grid grid-cols-8 md:grid-cols-16 gap-1.5 min-w-[640px]">
            {upperList.map(num => {
              const rec = chart[String(num)];
              const cond = rec?.condition || 'HEALTHY';
              const style = getConditionStyle(cond);
              const isSel = selectedTooth === num;

              return (
                <div
                  key={num}
                  onClick={() => handleToothClick(num)}
                  className={`relative flex flex-col items-center p-2 rounded-xl cursor-pointer transition-all border ${
                    isSel
                      ? 'border-[#00DAF3] bg-[#00DAF3]/15 scale-105 shadow-lg shadow-[#00DAF3]/20 z-10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold text-white/50">{num}</span>
                  {/* Tooth Graphic Representation */}
                  <div
                    className="w-7 h-9 rounded-t-lg rounded-b-md my-1.5 flex items-center justify-center border font-mono text-[9px] font-bold"
                    style={{
                      borderColor: style.color,
                      background: style.bg,
                      color: style.color,
                    }}
                  >
                    {cond === 'MISSING' ? '✕' : (rec?.surfaces?.length ? rec.surfaces.join('') : '•')}
                  </div>
                  {rec?.periodontalPocketMm && rec.periodontalPocketMm >= 4 && (
                    <span className="text-[8px] font-mono text-[#EF4444] font-bold">
                      {rec.periodontalPocketMm}mm
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mid-line separator */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent my-1" />

        {/* Lower Arch (Mandibular) */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-white/40 uppercase mb-2">
            <span>Patient Right (Quad 4)</span>
            <span className="font-bold text-white/60">MANDIBULAR ARCH (LOWER)</span>
            <span>Patient Left (Quad 3)</span>
          </div>
          <div className="grid grid-cols-8 md:grid-cols-16 gap-1.5 min-w-[640px]">
            {lowerList.map(num => {
              const rec = chart[String(num)];
              const cond = rec?.condition || 'HEALTHY';
              const style = getConditionStyle(cond);
              const isSel = selectedTooth === num;

              return (
                <div
                  key={num}
                  onClick={() => handleToothClick(num)}
                  className={`relative flex flex-col items-center p-2 rounded-xl cursor-pointer transition-all border ${
                    isSel
                      ? 'border-[#00DAF3] bg-[#00DAF3]/15 scale-105 shadow-lg shadow-[#00DAF3]/20 z-10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.08]'
                  }`}
                >
                  {rec?.periodontalPocketMm && rec.periodontalPocketMm >= 4 && (
                    <span className="text-[8px] font-mono text-[#EF4444] font-bold">
                      {rec.periodontalPocketMm}mm
                    </span>
                  )}
                  {/* Tooth Graphic Representation */}
                  <div
                    className="w-7 h-9 rounded-b-lg rounded-t-md my-1.5 flex items-center justify-center border font-mono text-[9px] font-bold"
                    style={{
                      borderColor: style.color,
                      background: style.bg,
                      color: style.color,
                    }}
                  >
                    {cond === 'MISSING' ? '✕' : (rec?.surfaces?.length ? rec.surfaces.join('') : '•')}
                  </div>
                  <span className="text-[10px] font-mono font-bold text-white/50">{num}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Selected Tooth Detail Editor */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Column 1: Tooth Status & Surfaces */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6B0099] to-[#00DAF3] flex items-center justify-center text-white font-black text-xl shadow-lg">
              #{selectedTooth}
            </div>
            <div>
              <div className="text-xs text-white/50 font-mono">SELECTED TOOTH</div>
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span>Tooth #{selectedTooth}</span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                  style={{
                    backgroundColor: getConditionStyle(currentToothRecord.condition).bg,
                    color: getConditionStyle(currentToothRecord.condition).color,
                  }}
                >
                  {currentToothRecord.condition}
                </span>
              </div>
            </div>
          </div>

          {/* 5 Surfaces Selector */}
          <div>
            <label className="text-xs font-mono text-white/50 uppercase block mb-1.5">
              Involved Surfaces (M · O · D · B · L):
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {SURFACES.map(s => {
                const isChecked = currentToothRecord.surfaces?.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSurface(s.id)}
                    className={`py-2 rounded-xl text-xs font-bold font-mono transition-all border ${
                      isChecked
                        ? 'bg-[#00DAF3] text-black border-[#00DAF3] shadow-md shadow-[#00DAF3]/20'
                        : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {s.id}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Column 2: Periodontal Probing Depth */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-white/50 uppercase">
                Periodontal Pocket Depth (mm):
              </label>
              <span
                className={`text-xs font-mono font-bold ${
                  (currentToothRecord.periodontalPocketMm || 2) >= 4 ? 'text-[#EF4444]' : 'text-[#06D6A0]'
                }`}
              >
                {(currentToothRecord.periodontalPocketMm || 2) >= 4 ? '⚠️ Pocketing (>3mm)' : 'Normal (1-3mm)'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                value={currentToothRecord.periodontalPocketMm || 2}
                onChange={e => updatePocketDepth(Number(e.target.value))}
                className="w-full accent-[#00DAF3] cursor-pointer"
              />
              <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/15 text-sm font-mono font-bold min-w-[42px] text-center">
                {currentToothRecord.periodontalPocketMm || 2}
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-white/50 uppercase block mb-1.5">
              Quick Diagnosis / Action:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CONDITIONS.slice(0, 5).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyBrushToTooth(selectedTooth, c.id)}
                  className="px-2 py-1 rounded-lg text-[10px] font-mono border bg-white/5 border-white/10 hover:bg-white/15 transition-all text-white/80"
                >
                  Mark as {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Column 3: Clinical Notes per tooth */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-white/50 uppercase block">
            Clinical Findings & Treatment Plan:
          </label>
          <textarea
            value={currentToothRecord.notes || ''}
            onChange={e => updateToothNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Deep recurrent decay along mesial margin; recommend composite restoration or porcelain onlay..."
            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#00DAF3] transition-all resize-none"
          />
        </div>

      </div>

      {/* Summary Findings Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl text-xs font-mono text-white/60">
        <div className="flex items-center gap-4">
          <span>Active Chart: <strong className="text-white">{Object.keys(chart).length} Teeth Cataloged</strong></span>
          <span>•</span>
          <span className="text-[#EF4444] font-bold">
            {Object.values(chart).filter(t => t.condition === 'CARIES').length} Caries Detected
          </span>
          <span>•</span>
          <span className="text-[#A855F7] font-bold">
            {Object.values(chart).filter(t => t.condition === 'CROWN').length} Crowns
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-[#06D6A0]" />
          <span className="text-[#06D6A0]">Odontogram Synced to Encounter</span>
        </div>
      </div>

    </div>
  );
};

export default DentalOdontogram;
