import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QrCode, Check, X, ArrowLeft, Ticket, AlertCircle, RefreshCw, Camera } from 'lucide-react';
import { validateTicket } from '../services/backendService';

interface Props {
  eventId: string;
  eventTitle?: string;
  onBack: () => void;
}

type ScanResult = { valid: boolean; holderName?: string; tierName?: string; reason?: string; quantity?: number } | null;

const TicketScanner: React.FC<Props> = ({ eventId, eventTitle, onBack }) => {
  const [manualId, setManualId]       = useState('');
  const [result, setResult]           = useState<ScanResult>(null);
  const [checking, setChecking]       = useState(false);
  const [scanCount, setScanCount]     = useState({ valid: 0, invalid: 0 });
  const inputRef                      = useRef<HTMLInputElement>(null);
  const clearTimer                    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-focus the input so a barcode scanner (USB HID keyboard) auto-populates it
  useEffect(() => { inputRef.current?.focus(); }, []);

  const validate = async (ticketId: string) => {
    if (!ticketId.trim()) return;
    setChecking(true);
    setResult(null);
    try {
      const res = await validateTicket(ticketId.trim());
      setResult(res);
      setScanCount(prev => ({ valid: prev.valid + (res.valid ? 1 : 0), invalid: prev.invalid + (res.valid ? 0 : 1) }));
      // Auto-clear after 4 seconds and refocus for next scan
      clearTimer.current = setTimeout(() => { setResult(null); setManualId(''); inputRef.current?.focus(); }, 4000);
    } catch {
      setResult({ valid: false, reason: 'Network error — check connection' });
    } finally { setChecking(false); }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); validate(manualId); };

  // Barcode scanner sends Enter after the code — the input captures it
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); validate(manualId); }
  };

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-white/50 hover:text-white text-sm"><ArrowLeft size={16} /> Back</button>
        <div className="text-center">
          <p className="text-[9px] text-white/30 uppercase tracking-widest">Ticket Scanner</p>
          <p className="text-sm font-black text-white truncate max-w-48">{eventTitle || eventId}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[#34d399] font-black">{scanCount.valid} ✓</span>
          <span className="text-[#f87171] font-black">{scanCount.invalid} ✗</span>
        </div>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key="result" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="text-center">
              {result.valid ? (
                <>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }} className="w-28 h-28 mx-auto rounded-full bg-[#34d399]/20 border-4 border-[#34d399] flex items-center justify-center mb-5">
                    <Check size={56} className="text-[#34d399]" />
                  </motion.div>
                  <p className="text-4xl font-black text-[#34d399] uppercase mb-2">VALID</p>
                  <p className="text-xl font-black text-white mb-1">{result.holderName}</p>
                  <p className="text-white/50">{result.tierName}{result.quantity && result.quantity > 1 ? ` × ${result.quantity}` : ''}</p>
                </>
              ) : (
                <>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }} className="w-28 h-28 mx-auto rounded-full bg-[#f87171]/20 border-4 border-[#f87171] flex items-center justify-center mb-5">
                    <X size={56} className="text-[#f87171]" />
                  </motion.div>
                  <p className="text-4xl font-black text-[#f87171] uppercase mb-2">INVALID</p>
                  <p className="text-white/50">{result.reason}</p>
                  {result.holderName && <p className="text-white/30 text-sm mt-1">{result.holderName}</p>}
                </>
              )}
              <p className="text-white/20 text-xs mt-6 uppercase tracking-widest animate-pulse">Scanning for next ticket…</p>
            </motion.div>
          ) : checking ? (
            <motion.div key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <RefreshCw size={48} className="text-white/20 animate-spin mx-auto mb-4" />
              <p className="text-white/40 text-sm uppercase tracking-widest">Validating…</p>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center w-full max-w-sm">
              {/* QR code frame visual */}
              <div className="relative w-52 h-52 mx-auto mb-8">
                <div className="absolute inset-0 rounded-2xl border-2 border-white/10" />
                {/* Corner brackets */}
                {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos, borders], i) => (
                  <div key={i} className={`absolute ${pos} w-8 h-8 ${borders} border-white rounded-sm`} />
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                  <QrCode size={56} className="text-white/15" />
                </div>
                {/* Animated scan line */}
                <motion.div animate={{ y: ['0%', '100%', '0%'] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }} className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#34d399] to-transparent rounded-full" />
              </div>

              <p className="text-white/40 text-sm mb-2">Point a barcode scanner at the ticket</p>
              <p className="text-white/20 text-xs mb-6">— or enter the ticket ID manually —</p>

              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  value={manualId}
                  onChange={e => setManualId(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ticket ID or scan code"
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 font-mono"
                  autoComplete="off"
                />
                <button type="submit" disabled={checking || !manualId.trim()} className="px-4 py-3 bg-[#34d399] text-black rounded-xl font-black text-sm disabled:opacity-40 hover:brightness-110 transition-all">
                  Check
                </button>
              </form>
              <p className="text-white/15 text-[9px] mt-3 uppercase tracking-widest">USB barcode scanners auto-submit on scan</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TicketScanner;
