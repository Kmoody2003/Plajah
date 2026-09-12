/**
 * WelcomePackage — the "Boarding Plajah" welcome, as a re-openable full-screen view.
 *
 * Ports the approved boarding-pass artifact (a night-departures board; letter signed
 * "Love, Plajah") into the app. Content lives in data/welcomePackage.ts; this file is the
 * presentation + the role toggle + routing the gates/itinerary into real views.
 *
 * All classes are prefixed `wpk-` and every rule is scoped under `.wpk-root`, so the
 * boarding-pass CSS (generic names like .ticket/.board/.stop) can't leak into the app.
 * The design commits to its own dark "night board" world regardless of app theme — that
 * is intentional, matching the artifact.
 *
 * Opened from: first-login soft banner, the SYSTEM notification (link 'WELCOME_PACKAGE'),
 * and the profile "Your Welcome Package" pill. See App.tsx render block + NAVIGATE handler.
 */
import React, { useState } from 'react';
import { WP_ITINERARY, WP_PROMISES, WP_PAYWAYS, WP_ROLES, WP_GATES } from '../data/welcomePackage';

interface WelcomePackageProps {
  displayName?: string;
  onBack: () => void;
  onNavigate: (view: string) => void;
  /** First-run only: renders a sticky "Continue" that advances into the 2-page onboarding. */
  onContinue?: () => void;
}

const CSS = `
.wpk-root{
  --bg:#160a20; --bg-2:#1e0e2b; --panel:#25133440; --ink:#f4ecfa; --ink-soft:#b79ec9;
  --line:#3a2350; --gate-line:#472a63;
  --purple:#8a1fc0; --magenta:#ff2d7e; --orange:#ff9b1f; --cyan:#22e0f5; --lilac:#d0bcff;
  --amber:#ffb43a; --grad:linear-gradient(100deg,#9c2bd6,#ff2d7e 70%,#ff9b1f); --ticket:#1c0e28;
  position:absolute; inset:0; overflow-y:auto; background:var(--bg); color:var(--ink);
  font-family:"Archivo",system-ui,sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased;
  background-image:radial-gradient(ellipse at 80% -10%,rgba(255,45,126,.16),transparent 55%),radial-gradient(ellipse at 0% 100%,rgba(34,224,245,.12),transparent 50%);
}
.wpk-root *{box-sizing:border-box}
.wpk-back{position:sticky;top:14px;margin:14px 0 0 14px;z-index:5;display:inline-flex;align-items:center;gap:8px;
  font-family:"JetBrains Mono",monospace;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;
  color:var(--ink);background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:999px;padding:9px 16px;transition:.16s}
.wpk-back:hover{background:rgba(255,255,255,.12)}
.wpk-wrap{max-width:860px;margin:0 auto;padding:clamp(12px,3vw,28px) clamp(14px,4vw,22px) 60px}
.wpk-mono{font-family:"JetBrains Mono",monospace}
.wpk-ticket{background:var(--ticket);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 30px 70px -30px rgba(0,0,0,.7)}
.wpk-stub{background:var(--grad);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.wpk-brand{font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-size:1.15rem;letter-spacing:.02em;display:flex;align-items:center;gap:10px}
.wpk-bloom{width:26px;height:26px;border-radius:50%;background:conic-gradient(from 200deg,#fff,rgba(255,255,255,.25),#fff);position:relative}
.wpk-bloom::after{content:"";position:absolute;inset:35%;border-radius:50%;background:var(--magenta)}
.wpk-meta{font-family:"JetBrains Mono",monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;opacity:.92;text-align:right}
.wpk-stubright{display:flex;align-items:center;gap:14px}
.wpk-seal{position:relative;width:66px;height:66px;flex:none;filter:drop-shadow(0 4px 10px rgba(90,54,0,.45))}
.wpk-seal .wpk-ring{position:absolute;inset:0;border-radius:50%;border:2px dashed rgba(255,255,255,.75)}
.wpk-seal .wpk-core{position:absolute;inset:6px;border-radius:50%;color:#5a3a00;text-align:center;
  background:radial-gradient(circle at 34% 28%,#FFEEB8,#FFD44d 42%,#E5A61f 74%,#B77f0c);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  box-shadow:inset 0 1px 2px rgba(255,255,255,.65),inset 0 -2px 5px rgba(120,72,0,.4)}
.wpk-seal .wpk-star{font-size:.85rem;line-height:1;margin-bottom:1px}
.wpk-seal .wpk-core b{font-family:"JetBrains Mono",monospace;font-size:.5rem;font-weight:700;letter-spacing:.06em}
.wpk-seal .wpk-core i{font-family:"JetBrains Mono",monospace;font-style:normal;font-size:.42rem;opacity:.85;letter-spacing:.04em}
@media (prefers-reduced-motion:no-preference){.wpk-seal .wpk-ring{animation:wpkseal 10s linear infinite}@keyframes wpkseal{to{transform:rotate(360deg)}}}
@media (max-width:560px){.wpk-stubright{width:100%;justify-content:space-between}}
.wpk-perf{border-top:2px dashed var(--gate-line);position:relative}
.wpk-perf::before,.wpk-perf::after{content:"";position:absolute;top:-11px;width:20px;height:20px;border-radius:50%;background:var(--bg)}
.wpk-perf::before{left:-11px}.wpk-perf::after{right:-11px}
.wpk-board{padding:clamp(22px,4vw,40px)}
.wpk-route{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px}
.wpk-from{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:clamp(1.6rem,5vw,2.4rem);line-height:1}
.wpk-arrow{color:var(--magenta);font-size:1.5rem}
.wpk-to{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:clamp(1.6rem,5vw,2.4rem);line-height:1;
  background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.wpk-subline{font-family:"JetBrains Mono",monospace;font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft)}
.wpk-h1{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:clamp(2rem,6vw,3.2rem);line-height:1.02;letter-spacing:-.02em;margin:22px 0 0;text-wrap:balance}
.wpk-h1 span{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.wpk-dear{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:1.4rem;margin:26px 0 4px}
.wpk-dear .wpk-nm{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.wpk-p{margin:0 0 1.1em;max-width:64ch;color:var(--ink)}
.wpk-soft{color:var(--ink-soft)}
.wpk-lead{font-size:1.1rem}
.wpk-pull{font-family:"Bricolage Grotesque",sans-serif;font-weight:600;font-size:1.25rem;line-height:1.3;margin:22px 0;padding-left:16px;border-left:3px solid var(--orange);color:var(--ink)}
.wpk-label{font-family:"JetBrains Mono",monospace;font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--amber);font-weight:500;margin:0 0 6px}
.wpk-h2{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:clamp(1.4rem,4vw,1.9rem);margin:.1em 0 .5em;letter-spacing:-.01em;text-wrap:balance}
.wpk-divider{height:1px;background:var(--line);margin:34px 0}
.wpk-stops{display:flex;flex-direction:column;gap:0;margin:16px 0}
.wpk-stop{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line);width:100%;text-align:left;background:none;border-left:0;border-right:0;border-top:0;cursor:default;color:inherit;font:inherit}
.wpk-stop:last-child{border-bottom:0}
button.wpk-stop{cursor:pointer;transition:.16s}
button.wpk-stop:hover{background:rgba(255,255,255,.03)}
.wpk-code{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:.9rem;width:60px;color:#fff;border-radius:7px;padding:5px 0;text-align:center;letter-spacing:.05em}
.wpk-sname{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:1.02rem}
.wpk-sname small{display:block;font-family:"Archivo",sans-serif;font-weight:400;font-size:.86rem;color:var(--ink-soft);margin-top:1px}
.wpk-status{font-family:"JetBrains Mono",monospace;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;text-align:right;white-space:nowrap}
.wpk-st-now{color:var(--cyan)}.wpk-st-soon{color:var(--amber)}
.wpk-promises{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:8px}
.wpk-promise{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.wpk-big{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:1.15rem;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.wpk-pt{font-size:.85rem;color:var(--ink-soft);margin-top:2px}
.wpk-roles{display:flex;flex-wrap:wrap;gap:7px;margin:6px 0 16px}
.wpk-roles button{font-family:"JetBrains Mono",monospace;font-size:.78rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;color:var(--ink-soft);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 13px;transition:.16s}
.wpk-roles button:hover{color:var(--ink)}
.wpk-roles button[aria-selected="true"]{color:#fff;background:var(--grad);border-color:transparent}
.wpk-rolecard{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--magenta);border-radius:12px;padding:18px 20px}
.wpk-rt{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:1.15rem;margin-bottom:5px}
.wpk-rolecard p{margin:0;color:var(--ink-soft)}
.wpk-biznote{background:var(--panel);border:1px dashed var(--gate-line);border-radius:12px;padding:16px 18px;margin:16px 0;font-size:.96rem}
.wpk-biznote b{color:var(--ink)}
.wpk-invite{background:var(--grad);color:#fff;border-radius:16px;padding:22px 24px;margin:8px 0}
.wpk-invite .wpk-h2{color:#fff;margin-top:0}.wpk-invite .wpk-label{color:rgba(255,255,255,.85)}
.wpk-invite .wpk-p{color:rgba(255,255,255,.94)}
.wpk-invite .wpk-row{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}
.wpk-invite button{font-family:"JetBrains Mono",monospace;font-size:.78rem;letter-spacing:.04em;background:rgba(255,255,255,.16);color:#fff;font-weight:500;border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:9px 14px;transition:.16s;cursor:pointer}
.wpk-invite button:hover{background:rgba(255,255,255,.3)}
.wpk-love{font-family:"Bricolage Grotesque",sans-serif;font-weight:600;font-style:italic;font-size:1.3rem;margin-top:24px}
.wpk-sig{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:2rem;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.wpk-gatehead{text-align:center;margin:8px 0 4px}
.wpk-gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:11px;margin-top:16px}
.wpk-gate{text-align:left;color:var(--ink);background:var(--panel);border:1px solid var(--gate-line);border-radius:14px;padding:16px;transition:.16s;position:relative;overflow:hidden;cursor:pointer;font:inherit;width:100%}
.wpk-gno{font-family:"JetBrains Mono",monospace;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft)}
.wpk-gt{font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:1.08rem;margin:4px 0 2px}
.wpk-gd{font-size:.82rem;color:var(--ink-soft)}
.wpk-dot{position:absolute;top:14px;right:14px;width:8px;height:8px;border-radius:50%;box-shadow:0 0 10px currentColor}
.wpk-gate:hover{transform:translateY(-2px);border-color:var(--magenta);box-shadow:0 16px 40px -20px rgba(255,45,126,.5)}
.wpk-foot{text-align:center;color:var(--ink-soft);font-family:"JetBrains Mono",monospace;font-size:.74rem;letter-spacing:.08em;margin-top:22px}
@media (prefers-reduced-motion:no-preference){.wpk-dot{animation:wpkblink 2.4s ease-in-out infinite}@keyframes wpkblink{50%{opacity:.35}}}
.wpk-fare{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:16px 0}
.wpk-bar{height:14px;border-radius:999px;overflow:hidden;display:flex;border:1px solid var(--line);margin:12px 0 8px}
.wpk-you{background:var(--grad)}.wpk-pj{background:rgba(255,255,255,.14)}
.wpk-leg{display:flex;justify-content:space-between;font-family:"JetBrains Mono",monospace;font-size:.72rem}
.wpk-leg .wpk-y{color:var(--orange);font-weight:700}.wpk-leg .wpk-pgrey{color:var(--ink-soft)}
.wpk-continuebar{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:16px;z-index:6;background:linear-gradient(to top,var(--bg) 45%,transparent)}
.wpk-continue{font-family:"JetBrains Mono",monospace;font-weight:700;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;color:#fff;border:none;border-radius:999px;padding:14px 30px;display:inline-flex;align-items:center;gap:10px;background:var(--grad);box-shadow:0 10px 30px -8px rgba(255,45,126,.6);transition:filter .16s}
.wpk-continue:hover{filter:brightness(1.06)}
`;

const WelcomePackage: React.FC<WelcomePackageProps> = ({ displayName, onBack, onNavigate, onContinue }) => {
  const [role, setRole] = useState('creator');
  const firstName = displayName?.split(' ')[0] || 'traveller';
  const activeRole = WP_ROLES.find(r => r.key === role) || WP_ROLES[0];

  return (
    <div className="wpk-root">
      <style>{CSS}</style>

      <button className="wpk-back" onClick={onBack}><span aria-hidden>←</span> Back</button>

      <div className="wpk-wrap">
        <div className="wpk-ticket">
          <div className="wpk-stub">
            <div className="wpk-brand"><span className="wpk-bloom" /> PLAJAH · BOARDING PASS</div>
            <div className="wpk-stubright">
              <div className="wpk-seal" role="img" aria-label="Pioneer — founding member, early access, number 001">
                <span className="wpk-ring" />
                <span className="wpk-core"><span className="wpk-star">★</span><b>PIONEER</b><i>Nº001</i></span>
              </div>
              <div className="wpk-meta">FOUNDING MEMBER<br />EARLY ACCESS · ONE-WAY</div>
            </div>
          </div>
          <div className="wpk-perf" />
          <div className="wpk-board">
            <div className="wpk-route">
              <span className="wpk-from">HERE</span>
              <span className="wpk-arrow">✈</span>
              <span className="wpk-to">WHEREVER YOU'RE GOING</span>
            </div>
            <div className="wpk-subline">Departures · no fixed arrival · you set the pace</div>

            <h1 className="wpk-h1">Welcome aboard. This is a <span>one-way ticket to your own potential.</span></h1>

            <p className="wpk-dear">Dear <span className="wpk-nm">{firstName}</span>,</p>
            <p className="wpk-p wpk-lead">You made it in. Before you rush the gates, one minute — this is the only long announcement we'll make.</p>
            <p className="wpk-p">Plajah wasn't built to win your attention. It was built to hand it back, pointed somewhere worth going. Most of the internet is a departures board where nothing ever leaves. We wanted the flights to be real — for you to actually get <em>somewhere</em>.</p>
            <p className="wpk-pull">You're early, and that's the good news. Some gates are open and boarding. Some are still being built — signposted on purpose, so you can see where we're headed and tell us if it's the right sky.</p>
            <p className="wpk-p wpk-soft">It's a big terminal. You don't have to see all of it today. Walk to the one gate that's useful to you now — the rest of the map reveals itself as you go. Depth here is meant to be discovered, not memorised at check-in.</p>

            <div className="wpk-divider" />

            <p className="wpk-label">Your itinerary · today's departures</p>
            <h2 className="wpk-h2">Ten places this ticket already takes you.</h2>
            <div className="wpk-stops">
              {WP_ITINERARY.map(s => {
                const inner = (
                  <>
                    <span className="wpk-code" style={{ background: s.color }}>{s.code}</span>
                    <span className="wpk-sname">{s.name}<small>{s.desc}</small></span>
                    <span className={`wpk-status ${s.statusKind === 'now' ? 'wpk-st-now' : 'wpk-st-soon'}`}>{s.status}</span>
                  </>
                );
                return s.nav
                  ? <button key={s.code} className="wpk-stop" onClick={() => onNavigate(s.nav!)}>{inner}</button>
                  : <div key={s.code} className="wpk-stop">{inner}</div>;
              })}
            </div>

            <div className="wpk-divider" />

            <p className="wpk-label">Fine print, but the good kind</p>
            <div className="wpk-promises">
              {WP_PROMISES.map((p, i) => (
                <div className="wpk-promise" key={i}><div className="wpk-big">{p.big}</div><div className="wpk-pt">{p.t}</div></div>
              ))}
            </div>

            <div className="wpk-divider" />

            <p className="wpk-label">Baggage claim · how you get paid</p>
            <h2 className="wpk-h2">Your money comes straight to you.</h2>
            <p className="wpk-p wpk-soft">Plajah is the instruction layer, never the vault — we never hold your funds. However a buyer chooses to pay, the money settles into <b style={{ color: 'var(--ink)' }}>your own account</b>. And how you cash out — bank or wallet — is your call, not ours.</p>
            <div className="wpk-stops">
              {WP_PAYWAYS.map(s => (
                <div className="wpk-stop" key={s.code}>
                  <span className="wpk-code" style={{ background: s.color }}>{s.code}</span>
                  <span className="wpk-sname">{s.name}<small>{s.desc}</small></span>
                  <span className="wpk-status wpk-st-now">{s.status}</span>
                </div>
              ))}
            </div>

            <div className="wpk-fare">
              <p className="wpk-label" style={{ marginBottom: 2 }}>The fare split · where a membership goes</p>
              <p className="wpk-p wpk-soft" style={{ margin: '6px 0 0', fontSize: '.94rem' }}>Plajah+ is the rare ticket where <b style={{ color: 'var(--ink)' }}>most of the fare flies back out to people.</b> We keep a lean, flat share to run the place; the majority is yours to direct to the creators you choose.</p>
              <div className="wpk-bar"><span className="wpk-you" style={{ width: '63%' }} /><span className="wpk-pj" style={{ width: '37%' }} /></div>
              <div className="wpk-leg"><span className="wpk-y">↦ ~60–67% to creators you pick</span><span className="wpk-pgrey">Plajah keeps the rest</span></div>
            </div>
            <p className="wpk-p wpk-soft" style={{ fontSize: '.9rem', marginTop: 10 }}>The whole model, in plain sight, no fine-print traps — the full fare card lives in your account whenever you want the numbers.</p>

            <div className="wpk-divider" />

            <p className="wpk-label">Choose your cabin</p>
            <h2 className="wpk-h2">Wherever you're flying from.</h2>
            <div className="wpk-roles" role="tablist">
              {WP_ROLES.map(r => (
                <button key={r.key} role="tab" aria-selected={role === r.key} onClick={() => setRole(r.key)}>{r.label}</button>
              ))}
            </div>
            <div className="wpk-rolecard"><div className="wpk-rt">{activeRole.title}</div><p>{activeRole.body}</p></div>

            <div className="wpk-biznote"><b>A window seat for everyone:</b> came only to create or to learn? The day you want to sell what you make or turn a skill into a living, that gate's already on your ticket — shop, payments, and Aria as your coach. No new platform, no new account. Just a door you haven't walked through yet.</div>

            <div className="wpk-divider" />

            <div className="wpk-invite">
              <p className="wpk-label">Group booking encouraged</p>
              <h2 className="wpk-h2">Fly with your people.</h2>
              <p className="wpk-p">A terminal is a lonely place empty. Plajah becomes unlike anywhere else online when the people you love are here too — invite your friends, bring your community, your class, your customers. Then tell us what's working and what isn't. We build in the open, with you.</p>
              <div className="wpk-row">
                <button onClick={() => onNavigate('CLUBS')}>JOIN THE PLAJAH CLUB →</button>
                <button onClick={() => onNavigate('FEED')}>OPEN DISCUSSIONS →</button>
                <button onClick={() => onNavigate('HELP_CENTER')}>SEND FEEDBACK →</button>
              </div>
            </div>

            <p className="wpk-love">And have fun up there — purpose and play were never enemies.</p>
            <p className="wpk-p wpk-soft">Whether Plajah makes it isn't ours to call. It comes down to one question: <b style={{ color: 'var(--ink)' }}>did it help you grow?</b> If it did, tell us. If it hasn't yet, tell us that too.</p>
            <p className="wpk-love">Safe travels,</p>
            <div className="wpk-sig">Love, Plajah</div>
          </div>
        </div>

        <div className="wpk-ticket" style={{ marginTop: 18 }}>
          <div className="wpk-board">
            <div className="wpk-gatehead">
              <p className="wpk-label" style={{ color: 'var(--amber)' }}>Final call</p>
              <h2 className="wpk-h2">So — which gate?</h2>
              <p className="wpk-p wpk-soft">Pick one. Every other gate stays open behind you.</p>
            </div>
            <div className="wpk-gates">
              {WP_GATES.map(g => (
                <button key={g.gno} className="wpk-gate" onClick={() => onNavigate(g.nav)}>
                  <span className="wpk-dot" style={{ color: g.color }} />
                  <div className="wpk-gno">{g.gno}</div>
                  <div className="wpk-gt">{g.title}</div>
                  <div className="wpk-gd">{g.desc}</div>
                </button>
              ))}
            </div>
            <p className="wpk-foot">REOPEN ANYTIME · PROFILE › YOUR WELCOME PACKAGE</p>
          </div>
        </div>
      </div>

      {onContinue && (
        <div className="wpk-continuebar">
          <button className="wpk-continue" onClick={onContinue}>Continue — set up your Plajah <span aria-hidden>→</span></button>
        </div>
      )}
    </div>
  );
};

export default WelcomePackage;
