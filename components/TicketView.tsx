import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, Globe, Ticket, Printer, Download, ArrowLeft, Check, RefreshCw, Package } from 'lucide-react';
import { fetchTicket, printTicket } from '../services/backendService';
import { UserProfile } from '../types';

interface Props {
  ticketId: string;
  currentUser: UserProfile;
  onBack: () => void;
}

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const TicketView: React.FC<Props> = ({ ticketId, currentUser, onBack }) => {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printerId, setPrinterId] = useState('');
  const [showPrintForm, setShowPrintForm] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTicket(ticketId).then(t => { setTicket(t); setLoading(false); });
  }, [ticketId]);

  // QR code via free API — encodes the ticket ID for scanner validation
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticketId)}&size=280x280&margin=10&format=png&bgcolor=0d0d0d&color=ffffff&ecc=H`;

  const handleBrowserPrint = () => {
    window.print();
  };

  const handlePrintNode = async () => {
    if (!printerId.trim()) return;
    setPrinting(true);
    try { await printTicket(ticketId, printerId); } catch (e: any) { alert(e.message); } finally { setPrinting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw size={18} className="animate-spin text-white/20" /></div>;
  if (!ticket) return <div className="text-center py-16 text-white/30"><Ticket size={28} className="mx-auto mb-2 opacity-30" /><p>Ticket not found</p></div>;

  const isUsed = ticket.status === 'USED';
  const tierColor = ticket.tierColor || '#a78bfa';

  return (
    <div className="min-h-screen text-white p-4 max-w-md mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-white/30 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to My Tickets
      </button>

      {/* The physical ticket */}
      <div ref={ticketRef} className="print-ticket relative rounded-3xl overflow-hidden shadow-2xl" style={{ background: `linear-gradient(135deg, #0d0d0d 0%, ${tierColor}18 100%)`, border: `1px solid ${tierColor}40` }}>
        {/* Header stripe */}
        <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${tierColor}, ${tierColor}88)` }} />

        {/* Cover image */}
        {ticket.eventCoverImage && (
          <div className="relative h-40 overflow-hidden">
            <img src={ticket.eventCoverImage} alt="" className="w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, #0d0d0d 100%)` }} />
          </div>
        )}

        <div className="p-6">
          {/* Event info */}
          <div className="mb-6">
            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: tierColor }}>Plajah Ticket</p>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white leading-tight">{ticket.eventTitle}</h1>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-white/60"><Calendar size={13} />{fmtDate(ticket.eventStartDate)}</div>
              {ticket.eventVenue && <div className="flex items-center gap-2 text-sm text-white/60"><MapPin size={13} />{ticket.eventVenue}</div>}
            </div>
          </div>

          {/* Tear line */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 border-t-2 border-dashed border-white/10" />
            <div className="w-4 h-4 rounded-full bg-black/60" />
            <div className="flex-1 border-t-2 border-dashed border-white/10" />
          </div>

          {/* Ticket details + QR */}
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-widest">Ticket Type</p>
                <p className="text-base font-black" style={{ color: tierColor }}>{ticket.tierName}</p>
              </div>
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-widest">Holder</p>
                <p className="text-sm font-black text-white">{ticket.holderName}</p>
                <p className="text-[10px] text-white/40">{ticket.holderEmail}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] text-white/30 uppercase tracking-widest">Qty</p>
                  <p className="text-lg font-black text-white">× {ticket.quantity}</p>
                </div>
                <div>
                  <p className="text-[9px] text-white/30 uppercase tracking-widest">Order</p>
                  <p className="text-xs font-black text-white/60 font-mono">{ticket.orderNumber}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-widest">Status</p>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${isUsed ? 'bg-[#34d399]/15 text-[#34d399]' : 'bg-white/8 text-white/60'}`}>
                  {isUsed ? '✓ Checked In' : '✓ Valid'}
                </span>
              </div>
              {ticket.physicalRequested && <div className="flex items-center gap-1.5 text-[10px] text-[#60a5fa]/70"><Package size={11} />Physical ticket requested</div>}
            </div>

            {/* QR code */}
            <div className="shrink-0 text-center">
              <div className="p-2 bg-white rounded-xl">
                <img src={qrUrl} alt="Ticket QR Code" width={120} height={120} className="rounded-lg" />
              </div>
              <p className="text-[8px] text-white/20 mt-1.5 font-mono break-all max-w-[120px]">{ticketId.slice(-12)}</p>
            </div>
          </div>

          {/* Used overlay */}
          {isUsed && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-3xl flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-[#34d399]/20 border-2 border-[#34d399] flex items-center justify-center mx-auto mb-3">
                  <Check size={28} className="text-[#34d399]" />
                </div>
                <p className="text-lg font-black text-[#34d399] uppercase">Checked In</p>
                {ticket.checkedInAt && <p className="text-xs text-white/40 mt-1">{new Date(ticket.checkedInAt).toLocaleString()}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <p className="text-[8px] text-white/15 uppercase tracking-widest">plajah.com</p>
          <p className="text-[8px] text-white/15 font-mono">{ticketId.slice(-16)}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 space-y-2">
        <button onClick={handleBrowserPrint} className="w-full flex items-center justify-center gap-2 py-3.5 bg-white/5 border border-white/10 rounded-xl font-black text-xs uppercase tracking-widest text-white/60 hover:text-white hover:border-white/20 transition-all">
          <Printer size={14} /> Print Ticket
        </button>

        <button onClick={() => setShowPrintForm(v => !v)} className="w-full flex items-center justify-center gap-2 py-3 bg-white/[0.03] border border-white/8 rounded-xl font-black text-[10px] uppercase tracking-widest text-white/40 hover:text-white/60 transition-all">
          <Printer size={12} /> Send to Physical Printer (PrintNode)
        </button>

        {showPrintForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
            <div className="p-4 bg-white/[0.03] border border-white/8 rounded-xl space-y-3">
              <p className="text-[9px] text-white/30 uppercase tracking-widest">PrintNode Printer ID</p>
              <input value={printerId} onChange={e => setPrinterId(e.target.value)} placeholder="e.g. 12345" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none" />
              <button onClick={handlePrintNode} disabled={printing || !printerId.trim()} className="w-full py-2.5 bg-[#60a5fa] text-white rounded-lg font-black text-xs uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                {printing ? <RefreshCw size={12} className="animate-spin" /> : <Printer size={12} />}
                {printing ? 'Printing…' : 'Send to Printer'}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      <p className="text-center text-[9px] text-white/20 uppercase tracking-widest mt-6">Present this QR code at the door for entry</p>

      {/* Print-specific CSS */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .print-ticket { display: block !important; page-break-inside: avoid; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
};

export default TicketView;
