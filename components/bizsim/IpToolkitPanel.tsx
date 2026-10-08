import React, { useMemo, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { IP_LINKS, IP_DISCLAIMER, type IpLink } from '../../data/ipToolkit';

/**
 * Official links for protecting ideas: copyright, trademarks, patents, trade secrets and licensing.
 * Plajah teaches and points to the official source; it never files for you and is not legal advice.
 */
const KIND_LABEL: Record<IpLink['kind'], string> = { copyright: 'Copyright', trademark: 'Trademarks', patent: 'Patents', 'trade-secret': 'Trade secrets', licensing: 'Licensing & identifiers', 'rights-org': 'Rights organizations', international: 'International', learn: 'Learn more' };
const ORDER: IpLink['kind'][] = ['copyright', 'trademark', 'patent', 'trade-secret', 'licensing', 'rights-org', 'international', 'learn'];

const IpToolkitPanel: React.FC<{ only?: IpLink['kind'][]; compact?: boolean }> = ({ only, compact }) => {
  const [filter, setFilter] = useState<IpLink['kind'] | 'all'>('all');
  const groups = useMemo(() => ORDER.filter(k => (!only || only.includes(k)) && (filter === 'all' || filter === k)).map(k => ({ k, links: IP_LINKS.filter(l => l.kind === k) })).filter(g => g.links.length), [filter, only]);
  const kinds = ORDER.filter(k => IP_LINKS.some(l => l.kind === k) && (!only || only.includes(k)));
  return (
    <section aria-label="Official IP links" className="text-white">
      <p className="text-[12px] text-white/65 leading-relaxed bg-amber-400/10 border border-amber-400/25 rounded-xl px-3 py-2 mb-3 flex gap-2"><ShieldCheck size={14} className="shrink-0 mt-0.5 text-amber-300" />{IP_DISCLAIMER}</p>
      {!compact && <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Filter links"><button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full text-[11px] font-black ${filter === 'all' ? 'bg-white text-black' : 'bg-white/8 text-white/65'}`}>All</button>{kinds.map(k => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-[11px] font-black ${filter === k ? 'bg-white text-black' : 'bg-white/8 text-white/65'}`}>{KIND_LABEL[k]}</button>)}</div>}
      <div className="grid gap-4">
        {groups.map(g => (
          <div key={g.k}>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45 mb-1.5">{KIND_LABEL[g.k]}</h3>
            <div className="grid gap-1.5">{g.links.map(l => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer noopener" className="block rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] px-3.5 py-2.5 transition-colors">
                <span className="flex items-center gap-2 text-[13px] font-black">{l.label}<ExternalLink size={11} className="text-white/40" /></span>
                <span className="block text-[12px] text-white/60 leading-snug mt-0.5">{l.what}{l.cost ? ` Cost: ${l.cost}.` : ''}</span>
                <span className="block text-[10px] text-white/30 mt-0.5">Checked: {l.verifiedOn}</span>
              </a>))}</div>
          </div>
        ))}
      </div>
    </section>
  );
};
export default IpToolkitPanel;
