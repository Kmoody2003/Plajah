import React, { useEffect, useMemo, useRef, useState } from 'react';
import Mascot2D, { type Mascot2DHandle } from '../mascots/Mascot2D';
import TodayDueFirst from '../academia/TodayDueFirst';
import { ageBandFor } from '../../data/ageScaling';
import { levelInfo } from '../../data/vocaPassages';
import { loadLocal, defaultProgress, startLevelFor, nextPassage, ZONE, type VocaProgress } from '../../services/voca/vocaProgress';
import { loadCloud, pickNewer } from '../../services/voca/vocaCloud';
import { fetchUserClubs, fetchClassrooms } from '../../services/backendService';
import { lessonLink } from '../../services/assignmentTemplateService';
import { requestTextChat, proposeClub } from '../../services/homeroomService';

/**
 * Homeroom — the student's home screen (view STUDENT_HOME). The Creator Hub, rebuilt around school:
 * who you are → what's due → reading → play → classes, chat, clubs → your Sigil shelf.
 *
 * Rules carried in from the design:
 *  • child accounts always land here; switching context needs a grown-up;
 *  • chat with classmates is voice notes by default — text chat is something a student ASKS their guardian
 *    for, with limits; guardians see every thread (ensureGuardianCc) and share moderation;
 *  • a student can propose a club, but it stays a draft until a teacher at their school or their own guardian
 *    agrees to sponsor it;
 *  • Sigils are earned from real reading (Voca) — effort, growth and consistency, never rank.
 */

interface Props { user?: any; profile?: any; onNavigate: (view: string) => void }

const CSS = `
.hr{--bg:#09070e;--g1:rgba(255,255,255,.035);--g2:rgba(255,255,255,.065);--g3:rgba(255,255,255,.1);--bd:rgba(255,255,255,.1);
  --ink:#f6f1f5;--dim:rgba(246,241,245,.68);--faint:rgba(246,241,245,.44);--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;--ok:#06D6A0;
  --grad:linear-gradient(135deg,#6B0099,#D40055);--warm:linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00);
  --fd:"Outfit","Space Grotesk",system-ui,sans-serif;--fb:"Inter",system-ui,sans-serif;--fm:"JetBrains Mono",ui-monospace,monospace;
  min-height:100%;background:var(--bg);color:var(--ink);font-family:var(--fb);padding:16px 16px 56px}
.hr *{box-sizing:border-box}
.hr button,.hr input,.hr textarea,.hr select{font:inherit;color:inherit}
.hr .wrap{max-width:1180px;margin:0 auto;display:grid;gap:16px}
.hr .top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.hr .av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6B0099,#00DAF3);display:grid;place-items:center;font-family:var(--fd);font-weight:900}
.hr .who b{font-family:var(--fd);font-weight:800;display:block}
.hr .who small{color:var(--faint);font-size:.76rem}
.hr .seg{display:flex;gap:3px;padding:4px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);margin-left:auto;align-items:center}
.hr .pill{appearance:none;border:0;background:transparent;cursor:pointer;height:32px;padding:0 13px;border-radius:99px;font-family:var(--fd);font-weight:800;font-size:.76rem;color:var(--dim)}
.hr .pill[aria-pressed="true"]{background:#fff;color:#12091b}
.hr .pill:disabled{opacity:.45;cursor:not-allowed}
.hr .lock{font-size:.7rem;color:var(--faint);padding:0 8px 0 4px}
.hr h1,.hr h2,.hr h3{font-family:var(--fd);margin:0}
.hr .eyebrow{font-family:var(--fd);font-weight:800;font-size:.66rem;letter-spacing:.24em;text-transform:uppercase;color:var(--faint)}
.hr .h2{font-weight:900;font-style:italic;text-transform:uppercase;font-size:.95rem;letter-spacing:.02em}
.hr .hello{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;border-radius:28px;padding:18px 22px;
  background:radial-gradient(120% 140% at 0% 0%,rgba(212,0,85,.26),transparent 60%),radial-gradient(120% 140% at 100% 100%,rgba(107,0,153,.34),transparent 60%),var(--g1);border:1px solid var(--bd)}
.hr .hello h1{font-weight:900;font-style:italic;font-size:clamp(1.6rem,4vw,2.4rem);line-height:1.05}
.hr .hello.senior{grid-template-columns:1fr;background:var(--g1)}
.hr .hello.senior h1{font-style:normal;font-size:1.5rem}
.hr .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.hr .chip{font-family:var(--fd);font-weight:700;font-size:.74rem;padding:5px 11px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);color:var(--dim);white-space:nowrap}
.hr .chip.hot{background:rgba(255,140,0,.12);border-color:rgba(255,140,0,.35);color:#ffb35c}
.hr .chip.ok{background:rgba(6,214,160,.1);border-color:rgba(6,214,160,.35);color:#5ff0c6}
.hr .grid{display:grid;grid-template-columns:1.45fr 1fr;gap:16px;align-items:start}
.hr .col{display:grid;gap:16px;min-width:0}
.hr .card{background:var(--g1);border:1px solid var(--bd);border-radius:24px;padding:16px;min-width:0}
.hr .card-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.hr .link{appearance:none;border:0;background:none;cursor:pointer;font-family:var(--fd);font-weight:700;font-size:.74rem;color:var(--faint)}
.hr .link:hover{color:var(--ink)}
.hr .read{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}
.hr .bar{height:9px;border-radius:99px;background:var(--g3);overflow:hidden;margin-top:8px}
.hr .bar i{display:block;height:100%;background:var(--warm);border-radius:99px}
.hr .btn{appearance:none;cursor:pointer;height:42px;padding:0 18px;border-radius:99px;border:0;background:var(--grad);color:#fff;font-family:var(--fd);font-weight:800;font-size:.84rem;white-space:nowrap}
.hr .btn.ghost{background:var(--g2);border:1px solid var(--bd);color:var(--ink)}
.hr .btn:disabled{opacity:.5;cursor:not-allowed}
.hr .play{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.hr .game{appearance:none;border:0;cursor:pointer;text-align:left;border-radius:18px;padding:14px;min-height:96px;display:flex;flex-direction:column;justify-content:flex-end;position:relative;overflow:hidden;color:#fff}
.hr .game b{font-family:var(--fd);font-weight:900;font-style:italic;font-size:1rem}
.hr .game small{font-size:.74rem;opacity:.85}
.hr .game .new{position:absolute;top:10px;right:10px;font-family:var(--fd);font-weight:800;font-size:.58rem;letter-spacing:.1em;background:#fff;color:#12091b;padding:3px 7px;border-radius:99px}
.hr .list{display:grid;gap:8px}
.hr .item{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;padding:10px;border-radius:16px;background:var(--g2);border:0;text-align:left;cursor:pointer;width:100%}
.hr .ico{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-family:var(--fd);font-weight:900;font-size:.78rem}
.hr .item b{font-weight:600;font-size:.9rem;display:block}
.hr .item small{color:var(--faint);font-size:.74rem}
.hr .tag{font-family:var(--fd);font-weight:800;font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;border-radius:99px;background:var(--g3);color:var(--dim);white-space:nowrap}
.hr .tag.ok{background:rgba(6,214,160,.14);color:#5ff0c6}
.hr .tag.wait{background:rgba(255,140,0,.16);color:#ffb35c}
.hr .policy{font-size:.82rem;color:var(--dim);border-left:3px solid var(--ok);background:rgba(6,214,160,.06);padding:8px 12px;border-radius:0 10px 10px 0;margin-bottom:10px}
.hr .empty{color:var(--faint);font-size:.85rem;padding:6px 2px}
.hr .shelf{display:flex;gap:12px;flex-wrap:wrap}
.hr .sig{display:grid;justify-items:center;gap:4px;width:74px;text-align:center}
.hr .sig .m{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:1.4rem;border:2px solid rgba(201,162,74,.85)}
.hr .sig.locked .m{border:2px dashed var(--bd);filter:grayscale(1);opacity:.5}
.hr .sig small{font-size:.66rem;color:var(--dim);line-height:1.2}
.hr .modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;z-index:60;padding:16px}
.hr .sheet{background:#130e1c;border:1px solid var(--bd);border-radius:24px;padding:20px;width:min(520px,100%);display:grid;gap:12px}
.hr .field{display:grid;gap:6px}
.hr .field label{font-family:var(--fd);font-weight:800;font-size:.74rem;color:var(--dim)}
.hr .field input,.hr .field textarea,.hr .field select{background:#0d0915;border:1px solid var(--bd);border-radius:12px;padding:10px 12px}
.hr .note{font-size:.8rem;color:var(--faint)}
.hr :focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
@media (max-width:900px){.hr .grid{grid-template-columns:1fr}.hr .play{grid-template-columns:1fr 1fr}}
@media (max-width:520px){.hr .play{grid-template-columns:1fr}.hr .hello{grid-template-columns:1fr}}
`;

const isChildAccount = (p: any) => !!(p?.isChild || p?.accountType === 'CHILD');

function sigils(p: VocaProgress) {
  const now = Date.now(), week = p.sessions.filter(s => now - s.at < 7 * 86_400_000).length;
  const books = Object.values(p.completed).filter(c => c.stars >= 1).length;
  const byLevel = p.sessions.filter(s => s.level === p.level && !s.noisy);
  const baseline = byLevel.slice(0, 3); const recent = byLevel.slice(-3);
  const avg = (a: typeof byLevel) => a.reduce((x, s) => x + s.wcpm, 0) / (a.length || 1);
  const rising = byLevel.length >= 6 && avg(recent) >= avg(baseline) * 1.1;
  return [
    { id: 'comeback', icon: '🔥', name: 'Comeback', how: `${Math.min(p.totals.comebacks, 10)}/10 comeback words`, earned: p.totals.comebacks >= 10, bg: 'radial-gradient(circle at 35% 30%,#D40055,#6B0099)' },
    { id: 'steady', icon: '✦', name: 'Steady Flame', how: `${Math.min(week, 5)}/5 reads this week`, earned: week >= 5, bg: 'radial-gradient(circle at 35% 30%,#FF8C00,#D40055)' },
    { id: 'tide', icon: '🌊', name: 'Rising Tide', how: 'beat your own pace by 10%', earned: rising, bg: 'radial-gradient(circle at 35% 30%,#00DAF3,#2b3c7a)' },
    { id: 'page', icon: '📖', name: 'Last Page', how: `${Math.min(books, 3)}/3 stories finished`, earned: books >= 3, bg: 'radial-gradient(circle at 35% 30%,#06D6A0,#0b5f6b)' },
  ];
}

const HomeroomView: React.FC<Props> = ({ user, profile, onNavigate }) => {
  const uid: string | undefined = user?.uid || profile?.uid;
  const band = ageBandFor(profile);
  const child = isChildAccount(profile);
  const first = (profile?.displayName || 'there').split(' ')[0];
  const [voca, setVoca] = useState<VocaProgress>(() => loadLocal(uid) ?? defaultProgress(startLevelFor(profile)));
  const [clubs, setClubs] = useState<any[] | null>(null);
  const [classes, setClasses] = useState<any[] | null>(null);
  const [sheet, setSheet] = useState<null | 'chat' | 'club'>(null);
  const [toast, setToast] = useState('');
  const coach = useRef<Mascot2DHandle>(null);

  useEffect(() => { const t = setTimeout(() => coach.current?.react('wave'), 500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!uid) { setClubs([]); setClasses([]); return; }
    let alive = true;
    loadCloud(uid).then(c => { const n = pickNewer(loadLocal(uid), c); if (alive && n) setVoca(n); });
    fetchUserClubs(uid).then(c => alive && setClubs(c || [])).catch(() => alive && setClubs([]));
    fetchClassrooms().then((all: any[]) => alive && setClasses((all || []).filter(c => c?.ownerId === uid || (c?.enrolledStudents || []).includes(uid)))).catch(() => alive && setClasses([]));
    return () => { alive = false; };
  }, [uid]);

  const info = levelInfo(voca.level);
  const story = useMemo(() => nextPassage(voca), [voca]);
  const zone = voca.sessions.filter(s => s.level === voca.level && !s.noisy).slice(-3).filter(s => s.accuracy >= ZONE.learning).length;
  const sig = sigils(voca);
  const textChat = profile?.parentalControls?.textChat;
  const textOn = !child || (textChat?.enabled && (!textChat.expiresAt || textChat.expiresAt > Date.now()));
  const hour = new Date().getHours(); const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const greet = band === 'early' ? `Hi ${first}! ${hour < 17 ? '☀️' : '🌙'}` : band === 'middle' ? `${part}, ${first}.` : `Good to see you, ${first}`;

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  return (
    <div className="hr">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="top">
          <div className="av">{first[0]?.toUpperCase() || 'S'}</div>
          <div className="who"><b>{profile?.displayName || 'Student'}</b><small>Homeroom · {info.grades}</small></div>
          <div className="seg" role="group" aria-label="Switch context">
            <button className="pill" type="button" aria-pressed="true">Student</button>
            <button className="pill" type="button" disabled={child} onClick={() => onNavigate('CREATOR_HUB')}>Creator</button>
            <button className="pill" type="button" disabled={child} onClick={() => onNavigate('DASHBOARD')}>Personal</button>
            {child && <span className="lock" title="A grown-up can switch from their account">🔒 grown-up</span>}
          </div>
        </div>

        <div className={`hello ${band === 'senior' ? 'senior' : ''}`}>
          {band !== 'senior' && <div style={{ width: band === 'early' ? 150 : 120 }}><Mascot2D ref={coach} who="chora" mood="idle" size={band === 'early' ? 150 : 120} /></div>}
          <div>
            <span className="eyebrow">Homeroom</span>
            <h1>{greet}</h1>
            <div className="chips">
              <span className="chip hot">🔥 {voca.streak.count}-day reading streak</span>
              <span className="chip ok">Level {info.level} · {info.name}</span>
              <span className="chip">{sig.filter(s => s.earned).length} Sigils</span>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="col">
            <TodayDueFirst uid={uid} role="student"
              onOpenAssignment={(id) => { try { window.history.pushState({}, '', lessonLink(id)); } catch { /* non-fatal */ } onNavigate('STUDENT_LESSON'); }}
              onNavigate={onNavigate} />

            <div className="card">
              <div className="card-hd"><h2 className="h2">Today's read</h2><button className="link" type="button" onClick={() => onNavigate('VOCA')}>Open Voca →</button></div>
              <div className="read">
                <div>
                  <span className="eyebrow">{story.kind} · Level {story.level}</span>
                  <h3 style={{ fontWeight: 900, fontSize: '1.25rem', margin: '4px 0' }}>{story.title}</h3>
                  <div className="bar"><i style={{ width: `${Math.min(100, zone / 3 * 100)}%` }} /></div>
                  <small style={{ color: 'var(--faint)', fontSize: '.76rem' }}>{zone}/3 strong reads to level up · Chora listens and coaches</small>
                </div>
                <button className="btn" type="button" onClick={() => onNavigate('VOCA')}>🎙️ Read with Chora</button>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><h2 className="h2">Play &amp; practice</h2></div>
              <div className="play">
                {[
                  { v: 'VOCA', t: 'Voca', d: 'Read aloud with Chora', bg: 'linear-gradient(135deg,#D40055,#6B0099)', isNew: true },
                  { v: 'HANDWRITING_WORKSHOP', t: 'Penna', d: 'Handwriting workshop', bg: 'linear-gradient(135deg,#C9871F,#6B0099)' },
                  { v: 'KIDS_LIBRARY', t: 'Library', d: 'Stories + learn to read', bg: 'linear-gradient(135deg,#2bd67a,#0b5f6b)' },
                  { v: 'LANGUAGE_QUEST', t: 'Languages', d: 'Spanish, French, Mandarin', bg: 'linear-gradient(135deg,#7a2bd6,#1e1b4b)' },
                  { v: 'SCIENCE_QUEST', t: 'Science', d: 'Lab Map quests', bg: 'linear-gradient(135deg,#36c5f0,#1e3a8a)' },
                  { v: 'MATH_CLASSROOM', t: 'Math', d: 'Drills by grade', bg: 'linear-gradient(135deg,#3B82F6,#1e1b4b)' },
                ].map(g => (
                  <button key={g.v} className="game" type="button" style={{ background: g.bg }} onClick={() => onNavigate(g.v)}>
                    {g.isNew && <span className="new">NEW</span>}<b>{g.t}</b><small>{g.d}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><h2 className="h2">My classes</h2><button className="link" type="button" onClick={() => onNavigate('CLASSROOMS')}>All classes →</button></div>
              <div className="list">
                {classes === null && <div className="empty">Loading your classes…</div>}
                {classes && classes.length === 0 && <div className="empty">No classes yet. Your teacher can add you, or join one with a class code in Classes.</div>}
                {(classes || []).slice(0, 5).map(c => (
                  <button key={c.id} className="item" type="button" onClick={() => onNavigate('CLASSROOMS')}>
                    <span className="ico" style={{ background: 'rgba(59,130,246,.18)', color: '#9cc0ff' }}>{(c.title || c.name || 'C').slice(0, 2).toUpperCase()}</span>
                    <span><b>{c.title || c.name || 'Class'}</b><small>{c.instructorName || c.teacherName || 'Teacher'}{c.gradeBand ? ` · ${c.gradeBand}` : ''}</small></span>
                    <span className="tag">open</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="col">
            <div className="card">
              <div className="card-hd"><h2 className="h2">Class chat</h2><span className="tag ok">parent-visible</span></div>
              <div className="policy">
                {textOn ? 'Voice notes and text chat with your classes. Your grown-ups can see your chats.' : 'Send voice notes to your classmates. Your grown-ups can see your chats.'}
              </div>
              <div className="list">
                <button className="item" type="button" onClick={() => onNavigate('CHAT')}>
                  <span className="ico" style={{ background: 'rgba(6,214,160,.16)', color: '#5ff0c6' }}>🎙️</span>
                  <span><b>Voice notes</b><small>your classes and clubs</small></span><span className="tag">open</span>
                </button>
                <button className="item" type="button" onClick={() => (textOn ? onNavigate('CHAT') : setSheet('chat'))}>
                  <span className="ico" style={{ background: 'rgba(212,0,85,.16)', color: '#ff7aa9' }}>Aa</span>
                  <span><b>Text chat</b><small>{textOn ? 'on' : 'ask a grown-up to turn it on'}</small></span>
                  <span className={`tag ${textOn ? 'ok' : 'wait'}`}>{textOn ? 'open' : 'ask'}</span>
                </button>
                <button className="item" type="button" onClick={() => onNavigate('CHAT')}>
                  <span className="ico" style={{ background: 'rgba(255,255,255,.08)' }}>✉️</span>
                  <span><b>My teachers</b><small>message your teacher</small></span><span className="tag">open</span>
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><h2 className="h2">My clubs</h2><button className="link" type="button" onClick={() => onNavigate('CLUBS')}>Browse →</button></div>
              <div className="list">
                {clubs === null && <div className="empty">Loading…</div>}
                {clubs && clubs.length === 0 && <div className="empty">You haven't joined a club yet.</div>}
                {(clubs || []).slice(0, 4).map(c => (
                  <button key={c.id} className="item" type="button" onClick={() => onNavigate('CLUBS')}>
                    <span className="ico" style={{ background: 'rgba(0,218,243,.15)', color: '#7deefb' }}>{(c.name || 'C').slice(0, 2).toUpperCase()}</span>
                    <span><b>{c.name}</b><small>{c.memberCount ? `${c.memberCount} members` : 'club'}</small></span><span className="tag ok">member</span>
                  </button>
                ))}
              </div>
              {band !== 'early'
                ? <button className="btn ghost" type="button" style={{ width: '100%', marginTop: 10, borderStyle: 'dashed' }} onClick={() => setSheet('club')}>+ Start a club</button>
                : <div className="note" style={{ marginTop: 8 }}>Clubs for younger readers are started by a teacher or parent.</div>}
            </div>

            <div className="card">
              <div className="card-hd"><h2 className="h2">Sigil shelf</h2><span className="tag">{sig.filter(s => s.earned).length}/{sig.length}</span></div>
              <div className="shelf">
                {sig.map(s => (
                  <div key={s.id} className={`sig ${s.earned ? '' : 'locked'}`} title={s.how}>
                    <div className="m" style={{ background: s.earned ? s.bg : 'transparent' }}>{s.icon}</div>
                    <small><b>{s.name}</b><br />{s.how}</small>
                  </div>
                ))}
              </div>
              <div className="note" style={{ marginTop: 10 }}>Earned by reading, trying hard words again, and showing up. Never by beating anyone.</div>
            </div>

            <button className="btn ghost" type="button" onClick={() => onNavigate('EDU_SOCIAL')}>School feed →</button>
          </div>
        </div>
      </div>

      {sheet === 'chat' && <ChatRequestSheet uid={uid} guardianUid={profile?.guardianUid} onClose={() => setSheet(null)} onDone={ok => { setSheet(null); flash(ok ? 'Request sent to your grown-up.' : "Couldn't send that right now. Ask your grown-up in person."); }} />}
      {sheet === 'club' && <ClubSheet uid={uid} classes={classes || []} guardianUid={profile?.guardianUid} child={child} onClose={() => setSheet(null)} onDone={ok => { setSheet(null); flash(ok ? 'Club idea sent! It goes live when your sponsor says yes.' : "Couldn't send that right now. Try again in a bit."); }} />}
      {toast && <div role="status" style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: '#12091b', padding: '10px 18px', borderRadius: 99, fontFamily: 'var(--fd)', fontWeight: 800, zIndex: 70 }}>{toast}</div>}
    </div>
  );
};
export default HomeroomView;

const ChatRequestSheet: React.FC<{ uid?: string; guardianUid?: string; onClose: () => void; onDone: (ok: boolean) => void }> = ({ uid, guardianUid, onClose, onDone }) => {
  const [scope, setScope] = useState<'classes' | 'classes_clubs'>('classes');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!uid || !guardianUid) { onDone(false); return; }
    setBusy(true); const ok = await requestTextChat({ childUid: uid, guardianUid, scope, note: note.trim().slice(0, 280) }); setBusy(false); onDone(ok);
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Ask for text chat" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h2 className="h2">Ask for text chat</h2>
        <p className="note" style={{ margin: 0 }}>Your grown-up decides who you can text, when, and for how long. They can always see your chats.</p>
        <div className="field"><label htmlFor="hr-scope">Who would you like to text?</label>
          <select id="hr-scope" value={scope} onChange={e => setScope(e.target.value as any)}><option value="classes">My classes</option><option value="classes_clubs">My classes and clubs</option></select></div>
        <div className="field"><label htmlFor="hr-note">Why? (optional)</label><textarea id="hr-note" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Our science group is planning our project." /></div>
        {!guardianUid && <p className="note" style={{ margin: 0 }}>Your account isn't linked to a grown-up yet, so ask your teacher.</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn" type="button" disabled={busy || !guardianUid} onClick={send}>{busy ? 'Sending…' : 'Send request'}</button></div>
      </div>
    </div>
  );
};

const ClubSheet: React.FC<{ uid?: string; classes: any[]; guardianUid?: string; child: boolean; onClose: () => void; onDone: (ok: boolean) => void }> = ({ uid, classes, guardianUid, onClose, onDone }) => {
  const teachers = useMemo(() => { const m = new Map<string, string>(); for (const c of classes) if (c?.ownerId) m.set(c.ownerId, c.instructorName || c.teacherName || c.title || 'Teacher'); return [...m.entries()]; }, [classes]);
  const [name, setName] = useState(''); const [purpose, setPurpose] = useState(''); const [meets, setMeets] = useState('');
  const [sponsor, setSponsor] = useState<string>(teachers[0] ? `teacher:${teachers[0][0]}` : guardianUid ? `guardian:${guardianUid}` : '');
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length >= 3 && purpose.trim().length >= 10 && sponsor;
  const send = async () => {
    if (!uid || !ok) return;
    const [kind, sid] = sponsor.split(':') as ['teacher' | 'guardian', string];
    setBusy(true); const r = await proposeClub({ proposerUid: uid, name: name.trim().slice(0, 60), purpose: purpose.trim().slice(0, 400), meets: meets.trim().slice(0, 80), sponsorKind: kind, sponsorUid: sid }); setBusy(false); onDone(r);
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Start a club" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h2 className="h2">Start a club</h2>
        <p className="note" style={{ margin: 0 }}>Every club needs an adult sponsor. Your club goes live when they say yes.</p>
        <div className="field"><label htmlFor="hr-cname">Club name</label><input id="hr-cname" value={name} onChange={e => setName(e.target.value)} placeholder="Comic Makers" /></div>
        <div className="field"><label htmlFor="hr-cwhat">What will you do?</label><textarea id="hr-cwhat" rows={3} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Draw comics together and share them every Friday." /></div>
        <div className="field"><label htmlFor="hr-cwhen">When will you meet? (optional)</label><input id="hr-cwhen" value={meets} onChange={e => setMeets(e.target.value)} placeholder="Fridays after lunch" /></div>
        <div className="field"><label htmlFor="hr-csp">Ask a sponsor</label>
          <select id="hr-csp" value={sponsor} onChange={e => setSponsor(e.target.value)}>
            {teachers.map(([id, n]) => <option key={id} value={`teacher:${id}`}>Teacher: {n}</option>)}
            {guardianUid && <option value={`guardian:${guardianUid}`}>My grown-up</option>}
            {!teachers.length && !guardianUid && <option value="">No sponsor available yet</option>}
          </select></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn" type="button" disabled={busy || !ok} onClick={send}>{busy ? 'Sending…' : 'Send to sponsor'}</button></div>
      </div>
    </div>
  );
};
