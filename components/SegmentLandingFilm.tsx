import React, { useRef } from 'react';
import { Film, Tv, DollarSign, Clock, Download, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';

/** One-page pitch document for indie filmmakers.
 *  Not a public web page — export as PDF and send to creators via DM/email. */
export default function FilmPitchDoc() {
  const docRef = useRef<HTMLDivElement>(null);

  const exportPDF = () => window.print();

  const exportPNG = async () => {
    if (!docRef.current) return;
    const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: '#020202', useCORS: true });
    const a = document.createElement('a');
    a.download = 'plajah-film-pitch.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#111] p-6 flex flex-col items-center">
      <div className="no-print flex gap-3 mb-6 w-full max-w-[800px]">
        <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10">
          <Printer size={14} /> Print / Save as PDF
        </button>
        <button onClick={exportPNG} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10">
          <Download size={14} /> Export image
        </button>
        <span className="text-xs text-white/25 self-center ml-auto">Send to filmmakers via DM or email</span>
      </div>

      <div
        ref={docRef}
        className="w-full max-w-[800px] bg-[#020202] text-white rounded-2xl overflow-hidden print:rounded-none"
        style={{ border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <div style={{ height: 6, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />

        <div className="p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-xs font-bold tracking-widest text-blue-400 uppercase mb-1">Plajah · Founding Director Program</div>
              <h1 className="text-3xl font-black">For Indie Filmmakers</h1>
            </div>
            <Film size={36} className="text-blue-400 opacity-60" />
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 mb-8">
            <p className="text-2xl font-black leading-tight">
              "Run your own 24/7 streaming TV channel.<br />
              <span className="text-blue-400">No aggregators. No gatekeepers."</span>
            </p>
            <p className="text-sm text-white/50 mt-2">
              FAST channel setup in 5 clicks. Mid-roll ads you control. Streams on FireTV, Roku, Samsung TV, Chromecast.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: Tv, title: '24/7 FAST Channel', body: 'Auto-schedules your library around the clock. Toggle on, add films, done.' },
              { icon: DollarSign, title: 'Ad breaks you set', body: 'Set mid-roll markers at exact timestamps. Your ads, your revenue.' },
              { icon: Clock, title: 'Live interrupts', body: 'Q&A or premiere at a set time — channel hands off and returns automatically.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <Icon size={18} className="text-blue-400 mb-2" />
                <div className="text-sm font-bold mb-1">{title}</div>
                <div className="text-xs text-white/40">{body}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">Filmhub / aggregator deal</div>
              <div className="text-xl font-black text-red-400">20–25% cut</div>
              <div className="text-xs text-white/30 mt-1">+ you lose programming control</div>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">Plajah FAST (10 films, 24/7)</div>
              <div className="text-xl font-black text-green-400">$200–800 / month</div>
              <div className="text-xs text-white/30 mt-1">passive ad revenue · you keep 90%</div>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-8">
            <div className="text-sm font-bold mb-2 text-blue-400">Full distribution toolkit included</div>
            <div className="grid grid-cols-3 gap-1">
              {['Festival mode + screener links', 'Rights dashboard', 'Cross-creator licensing', 'Distribution hub', 'AI film assistant', 'Public domain library', 'Season/episode structure', 'Cast & crew metadata', 'Pricing manager'].map((f) => (
                <div key={f} className="text-xs text-white/40 flex items-center gap-1"><span className="text-blue-400">✓</span>{f}</div>
              ))}
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 12, padding: 20 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold tracking-widest text-blue-400 uppercase mb-1">Founding Director Program</div>
                <div className="font-black text-lg">Free Creator Pro ($29.99/mo) — for life</div>
                <div className="text-sm text-white/50 mt-0.5">100 founding director spots · Featured channel at launch · 1:1 onboarding</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-blue-400 font-bold">plajah.com/for-film</div>
                <div className="text-xs text-white/30">Apply now</div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between text-xs text-white/20">
            <span>Plajah · Film distribution for indie creators</span>
            <span>team@plajah.com</span>
          </div>
        </div>
      </div>

      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
}
