// BotanyHall — the history of the discipline, as its own room.
//
// The Canopy tells you what a plant IS. This tells you how anyone found out,
// which is the stranger story: two thousand years to work out that plants eat
// air, thirty-four years for Mendel's paper to be read by anyone who understood
// it, fifteen rejections for the idea that every leaf contains a captured
// bacterium.
//
// It is a reading room, not a 3D scene — the material is text and dates, and
// wrapping that in a WebGL hall would cost frames and add nothing. It borrows
// the wing's typography so it reads as the same museum: serif display for
// names, uppercase letter-spaced labels for apparatus, generous measure.

import { useMemo, useState } from 'react';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { MILESTONES, PIONEERS, ERAS } from '../../../data/flora/botany';

export interface BotanyHallProps {
  onBack: () => void;
}

type Tab = 'timeline' | 'pioneers';

export default function BotanyHall({ onBack }: BotanyHallProps) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [openId, setOpenId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...MILESTONES].sort((a, b) => a.sort - b.sort),
    [],
  );

  /**
   * Which era a milestone belongs to, worked out from the era ranges rather
   * than tagged on each entry — so adding a milestone puts itself in the right
   * band automatically, and a tag can never disagree with a date.
   */
  const eraFor = (sort: number) => {
    if (sort <= 1240) return ERAS[0];
    if (sort <= 1682) return ERAS[1];
    if (sort <= 1831) return ERAS[2];
    if (sort <= 1948) return ERAS[3];
    return ERAS[4];
  };

  return (
    <div className="bh-root">
      <style>{CSS}</style>

      <header className="bh-head">
        <button className="bh-back" onClick={onBack} aria-label="Back to the forest">
          <ArrowLeft size={18} />
        </button>
        <div className="bh-title">
          <p className="bh-eyebrow">Museion · The Living Forest</p>
          <h1>The Study of Plants</h1>
          <p className="bh-sub">Twenty-three centuries of finding out</p>
        </div>
        <nav className="bh-tabs">
          <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}>
            <Clock size={13} /> Milestones
          </button>
          <button className={tab === 'pioneers' ? 'on' : ''} onClick={() => setTab('pioneers')}>
            <Users size={13} /> Pioneers
          </button>
        </nav>
      </header>

      <div className="bh-body">
        {tab === 'timeline' && (
          <div className="bh-timeline">
            {ERAS.map((era) => {
              const items = ordered.filter((m) => eraFor(m.sort).id === era.id);
              if (!items.length) return null;
              return (
                <section key={era.id} className="bh-era">
                  <div className="bh-era-head">
                    <h2>{era.label}</h2>
                    <p className="bh-era-range">{era.range}</p>
                    <p className="bh-era-blurb">{era.blurb}</p>
                  </div>
                  <ol className="bh-list">
                    {items.map((m) => (
                      <li key={m.year + m.title} className="bh-item">
                        <div className="bh-year">{m.year}</div>
                        <div className="bh-entry">
                          <h3>{m.title}</h3>
                          <p className="bh-who">{m.who}</p>
                          <p className="bh-what">{m.what}</p>
                          <p className="bh-why">{m.why}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        )}

        {tab === 'pioneers' && (
          <div className="bh-people">
            {PIONEERS.map((p) => {
              const open = openId === p.id;
              return (
                <article key={p.id} className={`bh-person ${open ? 'open' : ''}`}>
                  <button
                    className="bh-person-head"
                    onClick={() => setOpenId(open ? null : p.id)}
                    aria-expanded={open}
                  >
                    <div>
                      <h3>{p.name}</h3>
                      <p className="bh-life">{p.life} · {p.place}</p>
                    </div>
                    <p className="bh-known">{p.known}</p>
                  </button>
                  {open && <p className="bh-story">{p.story}</p>}
                </article>
              );
            })}
          </div>
        )}

        <footer className="bh-foot">
          <p>
            Every person, date and publication in this room is documented. Where a date is
            disputed it is given as approximate; where a contribution is contested — the
            extent of resource-sharing between trees, the credit owed for the Calvin cycle —
            the room says so rather than choosing the tidier version.
          </p>
        </footer>
      </div>
    </div>
  );
}

const CSS = `
.bh-root{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#0c1710 0%,#0a120c 55%,#080f0a 100%);color:#e8f0e6;
  font-family:'Inter',system-ui,sans-serif;overflow:hidden}
.bh-head{display:flex;align-items:flex-start;gap:18px;padding:26px 30px 18px;
  border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.bh-back{width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.04);color:rgba(255,255,255,.6);display:flex;align-items:center;
  justify-content:center;cursor:pointer;flex-shrink:0;transition:all .18s}
.bh-back:hover{background:rgba(255,255,255,.1);color:#fff}
.bh-title{flex:1;min-width:220px}
.bh-eyebrow{font-size:9px;font-weight:900;letter-spacing:.42em;text-transform:uppercase;
  color:rgba(143,216,160,.6);margin:0 0 6px}
.bh-title h1{font-family:'Fraunces',Georgia,serif;font-size:30px;font-weight:600;margin:0;
  letter-spacing:-.01em;line-height:1.05}
.bh-sub{font-size:12px;color:rgba(255,255,255,.42);margin:5px 0 0;font-style:italic;
  font-family:'Fraunces',Georgia,serif}
.bh-tabs{display:flex;gap:8px;align-self:center}
.bh-tabs button{display:flex;align-items:center;gap:6px;padding:9px 15px;border-radius:11px;
  border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);
  color:rgba(255,255,255,.5);font-size:9px;font-weight:900;letter-spacing:.2em;
  text-transform:uppercase;cursor:pointer;transition:all .18s}
.bh-tabs button:hover{background:rgba(255,255,255,.08);color:#fff}
.bh-tabs button.on{background:rgba(87,194,106,.14);border-color:rgba(87,194,106,.4);color:#8fd8a0}

.bh-body{flex:1;overflow-y:auto;padding:26px 30px 60px}

.bh-era{margin:0 0 46px}
.bh-era-head{max-width:70ch;margin:0 0 20px;padding-bottom:12px;
  border-bottom:1px solid rgba(255,255,255,.07)}
.bh-era-head h2{font-family:'Fraunces',Georgia,serif;font-size:21px;font-weight:600;margin:0}
.bh-era-range{font-size:9px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;
  color:rgba(143,216,160,.55);margin:5px 0 0}
.bh-era-blurb{font-size:13px;line-height:1.6;color:rgba(255,255,255,.5);margin:8px 0 0}

.bh-list{list-style:none;margin:0;padding:0}
.bh-item{display:grid;grid-template-columns:118px 1fr;gap:20px;padding:16px 0;
  border-bottom:1px solid rgba(255,255,255,.045)}
.bh-item:last-child{border-bottom:none}
.bh-year{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;
  color:rgba(255,255,255,.34);padding-top:3px;font-variant-numeric:tabular-nums}
.bh-entry{max-width:74ch}
.bh-entry h3{font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:600;margin:0}
.bh-who{font-size:12px;font-style:italic;color:#8fd8a0;margin:4px 0 0;
  font-family:'Fraunces',Georgia,serif}
.bh-what{font-size:13px;line-height:1.62;color:rgba(255,255,255,.72);margin:9px 0 0}
.bh-why{font-size:13px;line-height:1.68;color:rgba(255,255,255,.5);margin:8px 0 0}

.bh-people{display:grid;gap:10px;max-width:96ch}
.bh-person{border:1px solid rgba(255,255,255,.08);border-radius:16px;
  background:rgba(255,255,255,.025);overflow:hidden;transition:border-color .2s}
.bh-person.open{border-color:rgba(87,194,106,.32);background:rgba(87,194,106,.05)}
.bh-person-head{width:100%;display:flex;align-items:baseline;justify-content:space-between;
  gap:20px;padding:15px 18px;background:none;border:none;color:inherit;cursor:pointer;
  text-align:left;flex-wrap:wrap}
.bh-person-head h3{font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:600;margin:0}
.bh-life{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:rgba(255,255,255,.32);margin:4px 0 0;font-variant-numeric:tabular-nums}
.bh-known{font-size:12px;color:rgba(143,216,160,.85);margin:0;font-style:italic;
  font-family:'Fraunces',Georgia,serif;text-align:right;flex:1;min-width:200px}
.bh-story{font-size:13px;line-height:1.72;color:rgba(255,255,255,.66);
  margin:0;padding:0 18px 17px;max-width:78ch}

.bh-foot{margin:44px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,.07);max-width:78ch}
.bh-foot p{font-size:11px;line-height:1.7;color:rgba(255,255,255,.34);margin:0}

@media (max-width:720px){
  .bh-head{padding:18px 16px 14px}
  .bh-body{padding:18px 16px 44px}
  .bh-item{grid-template-columns:1fr;gap:4px}
  .bh-known{text-align:left}
}
@media (prefers-reduced-motion:reduce){
  .bh-back,.bh-tabs button,.bh-person{transition:none}
}
`;
