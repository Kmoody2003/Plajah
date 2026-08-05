import React, { useRef } from 'react';
import { Music, Radio, DollarSign, Mic2, Zap, Download, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';

/** One-page pitch document for independent musicians.
 *  Not a public web page — export as PDF and send to creators via DM/email. */
export default function MusicPitchDoc() {
  const docRef = useRef<HTMLDivElement>(null);

  const exportPDF = () => window.print();

  const exportPNG = async () => {
    if (!docRef.current) return;
    const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: '#020202', useCORS: true });
    const a = document.createElement('a');
    a.download = 'plajah-music-pitch.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#111] p-6 flex flex-col items-center">
      {/* Export controls — hidden in print */}
      <div className="no-print flex gap-3 mb-6 w-full max-w-[800px]">
        <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10">
          <Printer size={14} /> Print / Save as PDF
        </button>
        <button onClick={exportPNG} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10">
          <Download size={14} /> Export image
        </button>
        <span className="text-xs text-white/25 self-center ml-auto">Send this doc to music creators via DM or email</span>
      </div>

      {/* The document itself — 800px wide, letter proportions */}
      <div
        ref={docRef}
        className="w-full max-w-[800px] bg-[#020202] text-white rounded-2xl overflow-hidden print:rounded-none print:max-w-none"
        style={{ border: '1px solid rgba(255,140,0,0.2)' }}
      >
        {/* Orange top bar */}
        <div style={{ height: 6, background: 'linear-gradient(90deg, #ff8c00, #ff4500)' }} />

        <div className="p-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-xs font-bold tracking-widest text-orange-400 uppercase mb-1">Plajah · Founding Creator Program</div>
              <h1 className="text-3xl font-black">For Independent Musicians</h1>
            </div>
            <Music size={36} className="text-orange-400 opacity-60" />
          </div>

          {/* Headline pitch */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 mb-8">
            <p className="text-2xl font-black leading-tight">
              "TikTok made you famous.<br />
              <span className="text-orange-400">Plajah makes you money."</span>
            </p>
            <p className="text-sm text-white/50 mt-2">
              One platform for streaming, direct fan payments, artist radio, memberships, and merch.
              You keep 90% of every dollar.
            </p>
          </div>

          {/* Three columns */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: Radio, title: 'Your 24/7 Artist Radio', body: 'Auto-built from your catalog. No curation. One click.' },
              { icon: DollarSign, title: '90% to you, always', body: 'Tips, memberships, merch, downloads. Direct to your bank via Stripe.' },
              { icon: Mic2, title: 'Sanctuary Memberships', body: 'Monthly recurring fans. Exclusive tracks, private chat, early access.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <Icon size={18} className="text-orange-400 mb-2" />
                <div className="text-sm font-bold mb-1">{title}</div>
                <div className="text-xs text-white/40">{body}</div>
              </div>
            ))}
          </div>

          {/* Revenue reality */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">Spotify streaming</div>
              <div className="text-xl font-black text-red-400">$0.003 / stream</div>
              <div className="text-xs text-white/30 mt-1">Need 1M streams to earn $3,000</div>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">Plajah Sanctuary (200 fans)</div>
              <div className="text-xl font-black text-green-400">$898 / month</div>
              <div className="text-xs text-white/30 mt-1">200 fans × $4.99/mo · you keep 90%</div>
            </div>
          </div>

          {/* Hide N Seek + platform */}
          <div className="flex gap-4 mb-8">
            <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-orange-400" />
                <span className="text-sm font-bold">Hide N Seek discovery</span>
              </div>
              <p className="text-xs text-white/40">Hide tracks across the platform. Fans hunt for your music and earn PlajahBucks. Your most dedicated fans find you.</p>
            </div>
            <div className="flex-1 bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="text-sm font-bold mb-1">Every screen</div>
              <div className="flex flex-wrap gap-1">
                {['iOS', 'Android', 'Web', 'FireTV', 'Samsung TV', 'Roku', 'Alexa', 'Google Home'].map((p) => (
                  <span key={p} className="px-2 py-0.5 bg-white/5 rounded text-xs text-white/40">{p}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Founding Creator CTA */}
          <div style={{ background: 'linear-gradient(135deg, rgba(255,140,0,0.15), rgba(255,69,0,0.1))', border: '1px solid rgba(255,140,0,0.3)', borderRadius: 12, padding: 20 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold tracking-widest text-orange-400 uppercase mb-1">Founding Creator Program</div>
                <div className="font-black text-lg">Free Creator Pro ($29.99/mo) — for life</div>
                <div className="text-sm text-white/50 mt-0.5">100 founding musician spots · Founding badge · Featured placement · Direct line to the team</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-orange-400 font-bold">plajah.com/for-music</div>
                <div className="text-xs text-white/30">Apply now</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between text-xs text-white/20">
            <span>Plajah · Music for independent artists</span>
            <span>team@plajah.com</span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #020202; }
        }
      `}</style>
    </div>
  );
}
