import React, { useRef } from 'react';
import { PenTool, BookOpen, Mic2, Globe, DollarSign, Download, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';

/** One-page pitch document for writers & journalists.
 *  Not a public web page — export as PDF and send to creators via DM/email. */
export default function WritersPitchDoc() {
  const docRef = useRef<HTMLDivElement>(null);

  const exportPDF = () => window.print();

  const exportPNG = async () => {
    if (!docRef.current) return;
    const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: '#020202', useCORS: true });
    const a = document.createElement('a');
    a.download = 'plajah-writers-pitch.png';
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
        <span className="text-xs text-white/25 self-center ml-auto">Send to writers via DM or email</span>
      </div>

      <div
        ref={docRef}
        className="w-full max-w-[800px] bg-[#020202] text-white rounded-2xl overflow-hidden print:rounded-none"
        style={{ border: '1px solid rgba(16,185,129,0.2)' }}
      >
        <div style={{ height: 6, background: 'linear-gradient(90deg, #10b981, #06b6d4)' }} />

        <div className="p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="text-xs font-bold tracking-widest text-emerald-400 uppercase mb-1">Plajah · Founding Writer Program</div>
              <h1 className="text-3xl font-black">For Writers & Journalists</h1>
            </div>
            <PenTool size={36} className="text-emerald-400 opacity-60" />
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 mb-8">
            <p className="text-2xl font-black leading-tight">
              "Your writing deserves<br />
              <span className="text-emerald-400">more than a Substack."</span>
            </p>
            <p className="text-sm text-white/50 mt-2">
              Articles, books, podcasts, and memberships — one owned profile. Your subscriber list is yours.
              You keep 90% of every dollar.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { icon: DollarSign, title: 'Direct subscriptions', body: 'Readers subscribe monthly. 90% to you. Substack keeps 0%.' },
              { icon: BookOpen, title: 'E-books built in', body: 'Publish EPUB/PDF books. Sell or gate by membership tier.' },
              { icon: Mic2, title: 'Podcast + articles', body: 'Same profile, same audience. One link-in-bio covers everything.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <Icon size={18} className="text-emerald-400 mb-2" />
                <div className="text-sm font-bold mb-1">{title}</div>
                <div className="text-xs text-white/40">{body}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">Substack / Medium</div>
              <div className="text-xl font-black text-red-400">10% cut + algorithm</div>
              <div className="text-xs text-white/30 mt-1">They own your reach. They can change the rules.</div>
            </div>
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">Plajah Sanctuary (100 readers)</div>
              <div className="text-xl font-black text-green-400">$449 / month</div>
              <div className="text-xs text-white/30 mt-1">100 × $4.99 · 90% to you · your list, forever</div>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-8">
            <div className="text-sm font-bold mb-2 text-emerald-400">Every format in one profile</div>
            <div className="grid grid-cols-3 gap-1">
              {['Long-form articles', 'Serialized journalism', 'E-books (EPUB + PDF)', 'Podcast episodes', 'Video essays', 'Newsletters (Postman)', 'Reading clubs', 'Discussion threads', 'Fediverse cross-posting'].map((f) => (
                <div key={f} className="text-xs text-white/40 flex items-center gap-1"><span className="text-emerald-400">✓</span>{f}</div>
              ))}
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-8 flex items-start gap-3">
            <Globe size={16} className="text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-bold mb-0.5">Fediverse cross-posting built in</div>
              <div className="text-xs text-white/40">Every article broadcasts to Mastodon + Bluesky automatically. One post, every decentralized network.</div>
            </div>
          </div>

          <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.1))', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: 20 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold tracking-widest text-emerald-400 uppercase mb-1">Founding Writer Program</div>
                <div className="font-black text-lg">Free Creator Pro ($29.99/mo) — for life</div>
                <div className="text-sm text-white/50 mt-0.5">100 founding writer spots · Featured at writer launch · Direct line to the team</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-emerald-400 font-bold">plajah.com/for-writers</div>
                <div className="text-xs text-white/30">Apply now</div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex justify-between text-xs text-white/20">
            <span>Plajah · Publishing for independent writers</span>
            <span>team@plajah.com</span>
          </div>
        </div>
      </div>

      <style>{`@media print { .no-print { display: none !important; } }`}</style>
    </div>
  );
}
