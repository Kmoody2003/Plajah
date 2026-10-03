// AmboImportModal.tsx — Universal Presentation Import Dialog for Ambo Pro.
// Accepts: PowerPoint (.pptx), Google Slides (.pptx), PDF (.pdf), FreeShow (.show/.fsh/.json), Keynote (.key), Ambo (.amboprj/.amboz)

import React, { useState, useRef } from 'react';
import {
  X, Upload, FileText, Check, AlertCircle, RefreshCw,
  Layers, Film, Sparkles, ArrowRight, Download
} from 'lucide-react';
import { type Show, type Slide } from '../../services/ambo/showModel';
import { importUniversalPresentation, type ImportResult } from '../../services/ambo/amboImportService';
import { importProjectFile } from '../../services/ambo/amboBundleService';
import { type AmboProject } from '../../services/ambo/amboProjectModel';

interface AmboImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportShow: (show: Show) => void;
  onImportProject?: (project: AmboProject) => void;
}

export const AmboImportModal: React.FC<AmboImportModalProps> = ({
  isOpen,
  onClose,
  onImportShow,
  onImportProject,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedShow, setParsedShow] = useState<Show | null>(null);
  const [parsedProject, setParsedProject] = useState<AmboProject | null>(null);
  const [importFormat, setImportFormat] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setParsedShow(null);
    setParsedProject(null);

    const name = file.name.toLowerCase();

    // 1. Check if it's an Ambo Project File (.amboprj or .amboz)
    if (name.endsWith('.amboprj') || name.endsWith('.amboz') || (name.endsWith('.json') && name.includes('project'))) {
      try {
        const project = await importProjectFile(file, file.name);
        setParsedProject(project);
        setImportFormat(name.endsWith('.amboz') ? 'Ambo Asset Bundle (.amboz)' : 'Ambo Project (.amboprj)');
        setIsProcessing(false);
        return;
      } catch (err: any) {
        // Fallback to universal presentation import if it wasn't a valid project
      }
    }

    // 2. Universal Presentation Parser (PowerPoint, FreeShow, PDF, Keynote)
    try {
      const result = await importUniversalPresentation(file);
      if (result.success && result.show) {
        setParsedShow(result.show);
        setImportFormat(result.format);
      } else {
        setError(result.warnings?.[0] || 'Could not parse presentation file.');
      }
    } catch (err: any) {
      setError(err.message || 'Error parsing uploaded presentation.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirm = () => {
    if (parsedProject && onImportProject) {
      onImportProject(parsedProject);
      onClose();
    } else if (parsedShow) {
      onImportShow(parsedShow);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-[#140e21] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00DAF3] to-[#6B0099] flex items-center justify-center text-white">
              <Upload size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white tracking-wide">Import Presentation or Project</h2>
              <p className="text-[11px] text-white/50">PowerPoint, Google Slides, PDF, Keynote, FreeShow & Ambo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[#00DAF3] bg-[#00DAF3]/10 shadow-[0_0_20px_rgba(0,218,243,0.2)]'
                : 'border-white/15 hover:border-white/30 bg-white/[0.02]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,.pdf,.key,.show,.fsh,.json,.amboprj,.amboz"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFile(e.target.files[0]);
                }
              }}
            />

            {isProcessing ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <RefreshCw size={32} className="animate-spin text-[#00DAF3]" />
                <span className="text-sm font-semibold text-white">Parsing presentation slides...</span>
                <span className="text-xs text-white/40">Extracting OpenXML slides, text runs and media</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-[#00DAF3] mb-3">
                  <Upload size={22} />
                </div>
                <div className="text-sm font-bold text-white mb-1">
                  Drag & Drop Presentation File Here
                </div>
                <div className="text-xs text-white/40 max-w-sm mb-4">
                  Supports PowerPoint (<span className="text-white/70">.pptx</span>), Google Slides, PDF (<span className="text-white/70">.pdf</span>), Apple Keynote (<span className="text-white/70">.key</span>), FreeShow (<span className="text-white/70">.show</span>), and Ambo Bundles (<span className="text-white/70">.amboz</span>).
                </div>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors"
                >
                  Browse Files
                </button>
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs">
              <AlertCircle size={16} className="flex-none mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Parsed Result Preview */}
          {(parsedShow || parsedProject) && (
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {importFormat} Detected
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  Ready to Load
                </span>
              </div>

              {parsedProject ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">{parsedProject.name}</div>
                  <div className="text-xs text-white/50">
                    {parsedProject.shows.length} shows · {parsedProject.playlist.length} playlist items
                  </div>
                </div>
              ) : parsedShow ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">{parsedShow.title}</div>
                  <div className="text-xs text-white/50">
                    {parsedShow.slides.length} slides extracted · {parsedShow.kind}
                  </div>
                  {parsedShow.slides.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5 mt-2 pt-2 border-t border-white/5">
                      {parsedShow.slides.slice(0, 4).map((sl, i) => (
                        <div key={sl.id} className="p-2 rounded bg-white/5 border border-white/5 text-[10px] text-white/70 truncate">
                          {sl.label || `Slide ${i + 1}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/10 bg-black/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!parsedShow && !parsedProject}
            onClick={handleConfirm}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              parsedShow || parsedProject
                ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white shadow-[0_0_15px_rgba(255,140,0,0.3)] hover:opacity-90'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            <span>{parsedProject ? 'Open Project Workspace' : 'Add to Presentation Deck'}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
