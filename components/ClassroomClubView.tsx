'use client';
import React, { useState } from 'react';

/**
 * ClassroomClubView — a classroom rendered AS A CLUB (the room interior).
 * Club-style cover + members + its own social feed, with sub-group CLASSES as channels,
 * a Class-Points leaderboard, assignments and resources. Teacher / Student / Parent views.
 *
 * Structurally a Club (reuses the Clubs model per platform decision): classroom = Club,
 * classes = Club sub-groups/rooms. Ported 1:1 from the verified artifact (The Classroom).
 * Self-contained scoped <style> so it renders independent of global CSS. Role derives from
 * accountType; demo-populated fallback until the emergent-school backend feeds real data.
 */

type Role = 'teacher' | 'student' | 'parent';
type Channel = 'feed' | 'assign' | 'members' | 'points' | 'res';

interface ClassroomClubViewProps {
  profile?: any;
  user?: any;
  /** Optional real classroom; falls back to a demo room when absent. */
  classroom?: { id?: string; name?: string; school?: string; schoolState?: 'unofficial' | 'building' | 'official' } | null;
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

function roleFromProfile(p: any): Role {
  const t = p?.accountType;
  if (t === 'PARENT') return 'parent';
  if (t === 'STUDENT' || t === 'CHILD' || p?.provisionedByTeacherUid) return 'student';
  return 'teacher'; // TEACHER / school admin / owner default
}

const CLASSES = [
  { id: 'p3', ic: '🧬', hue: '#8B5CF6', t: 'Period 3 · Biology', u: '24 students' },
  { id: 'p1', ic: '🧪', hue: '#06D6A0', t: 'Period 1 · Chemistry', u: '22 students' },
  { id: 'hr', ic: '☀️', hue: '#FF8C00', t: 'Homeroom 4B', u: '26 students' },
];
const CHANNELS: { id: Channel; lb: string; ic: string; badge?: string }[] = [
  { id: 'feed', lb: 'Feed', ic: '💬' }, { id: 'assign', lb: 'Assignments', ic: '📥', badge: '2' },
  { id: 'members', lb: 'Members', ic: '👥' }, { id: 'points', lb: 'Class Points', ic: '🏅' }, { id: 'res', lb: 'Resources', ic: '📎' },
];

interface Post { pin?: boolean; who: string; role: Role | 'school'; av: string; hue: string; time: string; tx: string; attach?: { ic: string; hue: string; t: string; u: string }; react: { likes: number; comments: number }; points?: number; }

const FEED: Post[] = [
  { pin: true, who: 'Ms. Rivera', role: 'teacher', av: 'MR', hue: 'var(--grad-warm)', time: 'Pinned', tx: 'Welcome to Period 3 Biology! This week we’re dissecting the water cycle in Plajah Labs. Lab report due Friday — rubric is attached.', attach: { ic: '🔬', hue: '#8B5CF6', t: 'Water Cycle Lab', u: 'Assignment · rubric shown up front · due Fri' }, react: { likes: 18, comments: 5 } },
  { who: 'Diego M.', role: 'student', av: 'DM', hue: '#06D6A0', time: '2h', tx: 'Turned in my lab report early! The evaporation section was tricky 😅', react: { likes: 9, comments: 2 }, points: 3 },
  { who: 'Ms. Rivera', role: 'teacher', av: 'MR', hue: 'var(--grad-warm)', time: '4h', tx: 'Great observations in class today, everyone. Awarded Class Points for the group that modeled condensation. 🌧️', react: { likes: 22, comments: 3 } },
  { who: 'Ava T.', role: 'student', av: 'AT', hue: '#00DAF3', time: 'Yesterday', tx: 'Question — does the rubric want the diagram hand-drawn or can we use the Labs sim export?', react: { likes: 4, comments: 6 } },
];
const PARENT_FEED: Post[] = [
  { who: 'Lincoln High', role: 'school', av: 'LH', hue: 'var(--grad-brand)', time: '1d', tx: 'Fall conferences open for booking next week. Picture day is Friday. 📸', react: { likes: 31, comments: 4 } },
  { who: 'Ms. Rivera', role: 'teacher', av: 'MR', hue: 'var(--grad-warm)', time: '2h', tx: 'Biology lab this week — ask your student about the water cycle model! Lab reports due Friday.', react: { likes: 12, comments: 2 } },
  { who: 'Dana K.', role: 'parent', av: 'DK', hue: 'rgba(6,214,160,.5)', time: '5h', tx: 'Thank you for the reading list — Maya finished two already. 📖', react: { likes: 7, comments: 1 } },
];
const LEADER: [string, string, string, number, boolean?][] = [['AT', 'Ava T.', '#00DAF3', 148], ['DM', 'Diego M.', '#06D6A0', 132], ['MR-s', 'Maya R.', '#D40055', 127, true], ['NP', 'Noah P.', '#FF8C00', 119], ['JL', 'Jaya L.', '#8B5CF6', 104]];
const MEMBERS: [string, string, string, string, boolean][] = [['MR', 'Ms. Rivera', '#FF8C00', 'Teacher', true], ['AT', 'Ava T.', '#00DAF3', 'Student', true], ['DM', 'Diego M.', '#06D6A0', 'Student', true], ['MR-s', 'Maya R.', '#D40055', 'Student', false], ['NP', 'Noah P.', '#FF8C00', 'Student', false]];
const ASSIGN: { ic: string; hue: string; t: string; u: string; due: string; cls: string }[] = [
  { ic: '🔬', hue: '#8B5CF6', t: 'Water Cycle Lab Report', u: 'Rubric · writes to Learner Ledger', due: 'Due Fri', cls: 'soon' },
  { ic: '📖', hue: '#06D6A0', t: 'Ch. 4 Reading Check', u: 'Formative · 10 questions', due: 'Open', cls: 'open' },
  { ic: '🧫', hue: '#00DAF3', t: 'Cell Diagram', u: 'Turned in · graded 4/4', due: 'Done', cls: 'done' },
];
const ROLE_TABS: { id: Role; ico: string; label: string }[] = [
  { id: 'teacher', ico: '🍎', label: 'Teacher' }, { id: 'student', ico: '🎒', label: 'Student' }, { id: 'parent', ico: '👪', label: 'Parent' },
];
const shortAv = (s: string) => s.replace('-s', '');

const ClassroomClubView: React.FC<ClassroomClubViewProps> = ({ profile, classroom, onBack, onNavigate }) => {
  const [role, setRole] = useState<Role>(() => roleFromProfile(profile));
  const [cls, setCls] = useState('p3');
  const [chan, setChan] = useState<Channel>('feed');
  const roomName = classroom?.name || 'Ms. Rivera’s Room';
  const school = classroom?.school || 'Lincoln High';
  const nav = (v?: string) => { if (v && onNavigate) onNavigate(v); };

  const PostRow = (p: Post, i: number) => (
    <div className={`post ${p.pin ? 'pin' : ''}`} key={i}>
      <div className="av" style={{ background: p.hue }}>{p.av}</div>
      <div className="b">
        {p.pin && <div className="pinlab">📌 Pinned by teacher</div>}
        <div className="who"><span className="nm">{p.who}</span><span className={`role r-${p.role}`}>{p.role}</span>{p.points ? <span className="pts">🏅 +{p.points} pts</span> : null}<span className="time">{p.time}</span></div>
        <div className="tx">{p.tx}</div>
        {p.attach && (
          <div className="attach"><span className="ic" style={{ background: `linear-gradient(135deg,${p.attach.hue},#241a34)` }}>{p.attach.ic}</span><span><span className="t" style={{ display: 'block' }}>{p.attach.t}</span><span className="u">{p.attach.u}</span></span><span className="go">Open →</span></div>
        )}
        <div className="reactbar"><span>👍 {p.react.likes}</span><span>💬 {p.react.comments}</span>{role === 'teacher' && <span>🏅 Award points</span>}<span>↗ Share</span></div>
      </div>
    </div>
  );

  const renderMain = () => {
    if (chan === 'feed') {
      const feed = role === 'parent' ? PARENT_FEED : FEED;
      return (
        <>
          {role === 'teacher' && (
            <div className="composer"><div className="av">MR</div><div className="cbody"><textarea placeholder="Post to Period 3 · Biology — announcement, assignment, or a note…" /><div className="row"><div className="tools"><button className="ptool" title="Attach">📎</button><button className="ptool" title="Assignment">📥</button><button className="ptool" title="Poll">📊</button><button className="ptool" title="Award points">🏅</button></div><button className="btn btn-primary btn-sm">Post</button></div></div></div>
          )}
          {role === 'student' && (
            <div className="composer"><div className="av" style={{ background: '#00DAF3' }}>ME</div><div className="cbody"><textarea placeholder="Share with your class or ask a question…" /><div className="row"><div className="tools"><button className="ptool" title="Attach">📎</button><button className="ptool" title="Turn in">✅</button></div><button className="btn btn-primary btn-sm">Post</button></div></div></div>
          )}
          {role === 'parent' && (
            <div className="note" style={{ marginBottom: 16 }}><span style={{ fontSize: '1.1rem' }}>👁️</span><div className="t"><b>You’re viewing the class feed as a parent.</b> You can read the school and classroom feeds and see your own child — you’re copied on every teacher message, but can’t post here.</div></div>
          )}
          {feed.map(PostRow)}
        </>
      );
    }
    if (chan === 'assign') {
      return (
        <div className="panel"><div className="phd"><h2>Assignments · Period 3 Biology</h2>{role === 'teacher' && <button className="btn btn-primary btn-sm">+ New</button>}</div><div className="pbd">
          {ASSIGN.map((a, i) => <div className="assign" key={i}><span className="ic" style={{ background: `linear-gradient(135deg,${a.hue},#241a34)` }}>{a.ic}</span><div className="m"><div className="t">{a.t}</div><div className="u">{a.u}</div></div><span className={`due ${a.cls}`}>{a.due}</span></div>)}
        </div></div>
      );
    }
    if (chan === 'members') {
      return (
        <div className="panel"><div className="phd"><h2>Members · 24</h2>{role === 'teacher' && <button className="btn btn-ghost btn-sm">Manage roster</button>}</div><div className="pbd">
          {MEMBERS.map((m, i) => <div className="mrow" key={i}><span className="av" style={{ background: m[2] }}>{shortAv(m[0])}</span><span className="nm">{m[1]}</span>{m[4] && <span className="on" />}<span className="tag">{m[3]}</span></div>)}
          <div className="note"><span style={{ fontSize: '1.05rem' }}>🔒</span><div className="t">Students can message <b>teachers and guardians only</b> — never each other. Guardians are auto-CC’d on messages to their child.</div></div>
        </div></div>
      );
    }
    if (chan === 'points') {
      return (
        <div className="panel"><div className="phd"><h2>Class Points · this week</h2>{role === 'teacher' && <button className="btn btn-primary btn-sm">🏅 Award</button>}</div><div className="pbd">
          {LEADER.map((l, i) => <div className="lb" key={i}><span className="rank">{i + 1}</span><span className="av" style={{ background: l[2] }}>{shortAv(l[0])}</span><span className={`nm ${l[4] ? 'me' : ''}`}>{l[1]}{l[4] ? ' (you)' : ''}</span><span className="pt">{l[3]}</span></div>)}
          <div className="note"><span style={{ fontSize: '1.05rem' }}>✅</span><div className="t">Points tie to <b>real artifacts</b> — awarded for work that writes to the Learner Ledger, not a black box.</div></div>
        </div></div>
      );
    }
    return (
      <div className="panel"><div className="phd"><h2>Resources</h2>{role === 'teacher' && <button className="btn btn-primary btn-sm">+ Add</button>}</div><div className="pbd">
        <div className="assign"><span className="ic" style={{ background: 'linear-gradient(135deg,#8B5CF6,#241a34)' }}>📕</span><div className="m"><div className="t">OpenStax Biology for AP</div><div className="u">Free textbook · read in Lorea</div></div><span className="due open">Free</span></div>
        <div className="assign"><span className="ic" style={{ background: 'linear-gradient(135deg,#00DAF3,#241a34)' }}>🔬</span><div className="m"><div className="t">Water Cycle · Plajah Labs</div><div className="u">Interactive 3D sim</div></div><span className="due open">Open</span></div>
        <div className="assign"><span className="ic" style={{ background: 'linear-gradient(135deg,#FF8C00,#241a34)' }}>🎬</span><div className="m"><div className="t">Photosynthesis explainer</div><div className="u">Rights-cleared · Internet Archive</div></div><span className="due open">Watch</span></div>
      </div></div>
    );
  };

  const renderRail = () => {
    if (role === 'parent') {
      return (
        <>
          <div className="rail-card"><div className="rh"><h3>Your child here</h3></div><div className="rb"><div className="mrow"><span className="av" style={{ background: '#D40055' }}>MR</span><span className="nm">Maya R.</span><span className="on" /><span className="tag">Grade 6</span></div><div style={{ fontSize: '.8rem', color: 'var(--ink-dim)', marginTop: 8 }}>Reading Level 4 · 12-day streak · 2 assignments due this week.</div><button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => nav('LEARNER_LEDGER')}>Open Maya’s progress</button></div></div>
          <div className="rail-card"><div className="rh"><h3>Copied to you</h3></div><div className="rb"><div className="note" style={{ margin: 0 }}><span style={{ fontSize: '1.05rem' }}>✉️</span><div className="t"><b>4 messages</b> from Ms. Rivera this week — you’re on every thread involving Maya.</div></div></div></div>
        </>
      );
    }
    return (
      <>
        <div className="rail-card"><div className="rh"><h3>🏅 Points leaders</h3><span className="see">See all</span></div><div className="rb">{LEADER.map((l, i) => <div className="lb" key={i}><span className="rank">{i + 1}</span><span className="av" style={{ background: l[2] }}>{shortAv(l[0])}</span><span className={`nm ${l[4] ? 'me' : ''}`}>{l[1]}</span><span className="pt">{l[3]}</span></div>)}</div></div>
        <div className="rail-card"><div className="rh"><h3>Up next</h3></div><div className="rb"><div className="assign" style={{ margin: '0 0 8px' }}><span className="ic" style={{ background: 'linear-gradient(135deg,#8B5CF6,#241a34)' }}>🔬</span><div className="m"><div className="t">Water Cycle Lab</div><div className="u">Due Friday</div></div></div><div className="assign" style={{ margin: 0 }}><span className="ic" style={{ background: 'linear-gradient(135deg,#06D6A0,#241a34)' }}>📖</span><div className="m"><div className="t">Ch.4 Reading Check</div><div className="u">Open now</div></div></div></div></div>
        {role === 'teacher' && (
          <div className="rail-card"><div className="rh"><h3>Teacher tools</h3></div><div className="rb"><button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => nav('TEACHER_TOOLS')}>🎯 Plan from mastery</button><button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => nav('TEACHER_TOOLS')}>📊 Open gradebook</button><button className="btn btn-ghost btn-sm" style={{ width: '100%' }}>👥 Manage roster</button></div></div>
        )}
      </>
    );
  };

  return (
    <div className="pj-classroom-club">
      <style>{CLUB_CSS}</style>
      <div className="topbar"><div className="wrap">
        <button className="back" onClick={onBack}>← Classes</button>
        <div className="spacer" />
        <div className="roleswitch" role="tablist" aria-label="View as">
          {ROLE_TABS.map(rt => <button key={rt.id} role="tab" aria-selected={role === rt.id} onClick={() => { setRole(rt.id); setChan('feed'); }}><span>{rt.ico}</span><span className="lbl">{rt.label}</span></button>)}
        </div>
      </div></div>

      <main className="wrap">
        <div className="cover">
          <div className="art"><span className="emoji">🚪</span></div>
          <div className="c-inner">
            <div className="chips"><span className="cchip">🎓 Academic</span><span className="cchip">🏫 {school}</span><span className="cchip official">✓ Official</span></div>
            <h1>{roomName}</h1>
            <div className="meta"><span>👥 24 members</span><span className="dot" /><span>📚 3 classes</span><span className="dot" /><span className="avstack"><i>MR</i><i>AT</i><i>DM</i><i>+21</i></span></div>
          </div>
        </div>

        <div className="classrail">
          {CLASSES.map(c => (
            <div className="cls" key={c.id} aria-selected={c.id === cls} onClick={() => setCls(c.id)}>
              <span className="ic" style={{ background: `linear-gradient(135deg,${c.hue},#241a34)` }}>{c.ic}</span>
              <span><span className="t" style={{ display: 'block' }}>{c.t}</span><span className="u">{c.u}</span></span>
            </div>
          ))}
          {role === 'teacher' && <button className="add">+ Add class</button>}
        </div>

        <div className="channels">
          {CHANNELS.map(ch => <button key={ch.id} aria-selected={ch.id === chan} onClick={() => setChan(ch.id)}><span>{ch.ic}</span>{ch.lb}{ch.badge && <span className="badge">{ch.badge}</span>}</button>)}
        </div>

        <div className="grid">
          <div className="mainc">{renderMain()}</div>
          <aside>{renderRail()}</aside>
        </div>

        <p className="foot-note">A classroom is a Club — its own cover, members, feed and sub-group classes. Same engine as the Global Collective, tuned for teaching.</p>
      </main>
    </div>
  );
};

const CLUB_CSS = `
.pj-classroom-club{
  --purple:#6B0099;--magenta:#D40055;--orange:#FF8C00;--cyan:#00DAF3;--lilac:#D0BCFF;
  --success:#06D6A0;--warning:#F59E0B;--info:#3B82F6;
  --grad-brand:linear-gradient(135deg,#6B0099,#D40055);--grad-warm:linear-gradient(120deg,#6B0099,#D40055 55%,#FF8C00);
  --bg:#08070d;--panel:#0d0b14;--ink:#f4f1f7;--ink-dim:rgba(244,241,247,.64);--ink-faint:rgba(244,241,247,.4);
  --g1:rgba(255,255,255,.04);--g2:rgba(255,255,255,.065);--g3:rgba(255,255,255,.1);
  --bd:rgba(255,255,255,.1);--bd-str:rgba(255,255,255,.17);
  --r-md:16px;--r-lg:22px;--r-xl:28px;--r-2xl:36px;
  --font-d:"Outfit","Space Grotesk",sans-serif;--font-b:"Inter",system-ui,sans-serif;--font-m:"JetBrains Mono",monospace;
  --glow-brand:0 6px 22px rgba(212,0,85,.32);--elev-3:0 14px 34px rgba(0,0,0,.5);
  font-family:var(--font-b);color:var(--ink);background:var(--bg);line-height:1.55;min-height:100%;
  background-image:radial-gradient(100% 60% at 12% -8%,rgba(107,0,153,.26),transparent 52%),radial-gradient(90% 60% at 96% 0%,rgba(212,0,85,.16),transparent 52%);
}
.pj-classroom-club *{box-sizing:border-box}
.pj-classroom-club .wrap{max-width:1240px;margin:0 auto;padding:0 clamp(14px,3.5vw,32px)}
.pj-classroom-club .topbar{position:sticky;top:0;z-index:50;backdrop-filter:blur(22px) saturate(180%);background:color-mix(in srgb,var(--bg) 74%,transparent);border-bottom:1px solid var(--bd)}
.pj-classroom-club .topbar .wrap{display:flex;align-items:center;gap:14px;height:60px}
.pj-classroom-club .back{appearance:none;border:1px solid var(--bd);background:var(--g2);color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.8rem;height:36px;padding:0 14px;border-radius:99px}
.pj-classroom-club .back:hover{background:var(--g3);color:var(--ink)}
.pj-classroom-club .spacer{flex:1}
.pj-classroom-club .roleswitch{display:flex;gap:4px;padding:5px;border-radius:99px;background:var(--g2);border:1px solid var(--bd-str)}
.pj-classroom-club .roleswitch button{appearance:none;border:0;background:transparent;color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.76rem;padding:0 14px;height:34px;border-radius:99px;transition:.2s;display:flex;align-items:center;gap:7px}
.pj-classroom-club .roleswitch button[aria-selected="true"]{background:var(--grad-warm);color:#fff;box-shadow:var(--glow-brand)}
.pj-classroom-club .roleswitch button:not([aria-selected="true"]):hover{color:var(--ink);background:var(--g3)}
@media(max-width:640px){.pj-classroom-club .roleswitch button span.lbl{display:none}.pj-classroom-club .roleswitch button{padding:0 11px}}
.pj-classroom-club .cover{position:relative;border-radius:var(--r-2xl);overflow:hidden;margin-top:20px;border:1px solid var(--bd-str);min-height:210px;display:flex;align-items:flex-end}
.pj-classroom-club .cover .art{position:absolute;inset:0;background:radial-gradient(120% 100% at 15% 0%,rgba(107,0,153,.75),transparent 60%),radial-gradient(100% 100% at 100% 100%,rgba(212,0,85,.6),transparent 55%),linear-gradient(135deg,#2a123f,#120a1c)}
.pj-classroom-club .cover .art::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(4,3,8,.9),transparent 65%)}
.pj-classroom-club .cover .art .emoji{position:absolute;top:22px;right:28px;font-size:5rem;opacity:.5}
.pj-classroom-club .cover .c-inner{position:relative;z-index:1;padding:clamp(18px,3vw,30px);width:100%}
.pj-classroom-club .cover .chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pj-classroom-club .cchip{font-size:.62rem;font-weight:800;font-family:var(--font-d);letter-spacing:.1em;text-transform:uppercase;padding:5px 11px;border-radius:8px;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);border:1px solid var(--bd);color:#fff;display:inline-flex;align-items:center;gap:6px}
.pj-classroom-club .cchip.official{background:rgba(6,214,160,.85);color:#04140e;border-color:transparent}
.pj-classroom-club .cover h1{font-family:var(--font-d);font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:-.02em;line-height:.9;font-size:clamp(2rem,5.5vw,3.4rem);color:#fff}
.pj-classroom-club .cover .meta{display:flex;align-items:center;gap:16px;margin-top:12px;flex-wrap:wrap;color:rgba(255,255,255,.75);font-size:.82rem;font-weight:600}
.pj-classroom-club .cover .meta .dot{width:4px;height:4px;border-radius:99px;background:rgba(255,255,255,.4)}
.pj-classroom-club .avstack{display:flex}
.pj-classroom-club .avstack i{width:28px;height:28px;border-radius:99px;border:2px solid #0a0813;margin-left:-8px;background:var(--grad-brand);display:grid;place-items:center;font-size:.6rem;font-weight:800;color:#fff;font-style:normal}
.pj-classroom-club .avstack i:first-child{margin-left:0}
.pj-classroom-club .classrail{display:flex;gap:10px;overflow-x:auto;padding:16px 0 4px;margin-top:6px}
.pj-classroom-club .classrail .cls{flex:0 0 auto;display:flex;align-items:center;gap:10px;background:var(--g1);border:1px solid var(--bd);border-radius:16px;padding:10px 14px;cursor:pointer;transition:.18s;white-space:nowrap}
.pj-classroom-club .classrail .cls:hover{background:var(--g3)}
.pj-classroom-club .classrail .cls[aria-selected="true"]{border-color:var(--magenta);box-shadow:0 0 0 1px var(--magenta),0 8px 22px rgba(212,0,85,.2);background:var(--g2)}
.pj-classroom-club .classrail .cls .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-size:15px;color:#fff}
.pj-classroom-club .classrail .cls .t{font-family:var(--font-d);font-weight:800;font-size:.84rem}
.pj-classroom-club .classrail .cls .u{font-size:.68rem;color:var(--ink-faint)}
.pj-classroom-club .classrail .add{flex:0 0 auto;border:1px dashed var(--bd-str);background:transparent;color:var(--ink-dim);border-radius:16px;padding:0 16px;font-family:var(--font-d);font-weight:700;font-size:.8rem;cursor:pointer}
.pj-classroom-club .channels{display:flex;gap:4px;padding:5px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);margin:14px 0 20px;width:max-content;max-width:100%;overflow-x:auto}
.pj-classroom-club .channels button{appearance:none;border:0;background:transparent;color:var(--ink-dim);cursor:pointer;font-family:var(--font-d);font-weight:700;font-size:.78rem;padding:0 15px;height:36px;border-radius:99px;white-space:nowrap;display:flex;align-items:center;gap:7px;transition:.15s}
.pj-classroom-club .channels button[aria-selected="true"]{background:var(--grad-brand);color:#fff}
.pj-classroom-club .channels button:not([aria-selected="true"]):hover{color:var(--ink);background:var(--g3)}
.pj-classroom-club .channels .badge{font-size:.62rem;font-family:var(--font-m);background:rgba(255,140,0,.2);color:var(--orange);padding:1px 6px;border-radius:99px}
.pj-classroom-club .grid{display:grid;gap:18px;grid-template-columns:1fr}
@media(min-width:920px){.pj-classroom-club .grid{grid-template-columns:1fr 320px;align-items:start}}
.pj-classroom-club .mainc{min-width:0}
.pj-classroom-club .panel{border:1px solid var(--bd);background:var(--panel);border-radius:var(--r-xl);overflow:hidden}
.pj-classroom-club .panel .phd{padding:15px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;gap:10px}
.pj-classroom-club .panel .phd h2{font-family:var(--font-d);font-weight:800;font-size:.94rem}
.pj-classroom-club .panel .pbd{padding:16px 18px}
.pj-classroom-club .composer{display:flex;gap:11px;padding:14px 16px;border:1px solid var(--bd);background:var(--g1);border-radius:var(--r-lg);margin-bottom:16px}
.pj-classroom-club .composer .av{width:38px;height:38px;border-radius:99px;flex-shrink:0;display:grid;place-items:center;font-weight:800;font-size:.8rem;color:#fff;background:var(--grad-warm)}
.pj-classroom-club .composer .cbody{flex:1;min-width:0}
.pj-classroom-club .composer textarea{width:100%;background:transparent;border:0;color:var(--ink);font-family:var(--font-b);font-size:.9rem;resize:none;outline:none;min-height:24px}
.pj-classroom-club .composer .row{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
.pj-classroom-club .composer .tools{display:flex;gap:6px}
.pj-classroom-club .ptool{width:32px;height:32px;border-radius:9px;border:1px solid var(--bd);background:var(--g2);color:var(--ink-dim);cursor:pointer;font-size:14px}
.pj-classroom-club .btn{appearance:none;border:1px solid transparent;cursor:pointer;font-family:var(--font-d);font-weight:700;height:38px;padding:0 16px;border-radius:99px;font-size:.82rem;display:inline-flex;align-items:center;gap:7px;transition:.16s}
.pj-classroom-club .btn-primary{background-image:var(--grad-warm);color:#fff;box-shadow:var(--glow-brand)}.pj-classroom-club .btn-primary:hover{filter:brightness(1.1)}
.pj-classroom-club .btn-ghost{background:var(--g2);color:var(--ink);border-color:var(--bd)}.pj-classroom-club .btn-ghost:hover{background:var(--g3)}
.pj-classroom-club .btn-sm{height:32px;padding:0 12px;font-size:.76rem}
.pj-classroom-club .post{display:flex;gap:12px;padding:16px;border:1px solid var(--bd);background:var(--g1);border-radius:var(--r-lg);margin-bottom:12px}
.pj-classroom-club .post.pin{border-color:rgba(255,140,0,.4);background:linear-gradient(135deg,rgba(255,140,0,.08),transparent)}
.pj-classroom-club .post .av{width:40px;height:40px;border-radius:99px;flex-shrink:0;display:grid;place-items:center;font-weight:800;font-size:.82rem;color:#fff}
.pj-classroom-club .post .b{flex:1;min-width:0}
.pj-classroom-club .post .who{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pj-classroom-club .post .who .nm{font-weight:700;font-size:.9rem}
.pj-classroom-club .post .who .role{font-size:.58rem;font-weight:800;font-family:var(--font-d);text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:99px}
.pj-classroom-club .post .who .time{font-size:.72rem;color:var(--ink-faint);margin-left:auto}
.pj-classroom-club .r-teacher{background:rgba(255,140,0,.16);color:var(--orange)}
.pj-classroom-club .r-student{background:rgba(0,218,243,.14);color:var(--cyan)}
.pj-classroom-club .r-school{background:rgba(107,0,153,.28);color:var(--lilac)}
.pj-classroom-club .r-parent{background:rgba(6,214,160,.16);color:var(--success)}
.pj-classroom-club .post .tx{font-size:.9rem;color:var(--ink-dim);margin-top:6px}
.pj-classroom-club .pts{display:inline-flex;align-items:center;gap:6px;background:rgba(6,214,160,.14);color:var(--success);font-weight:800;font-family:var(--font-d);font-size:.7rem;padding:3px 9px;border-radius:99px}
.pj-classroom-club .pinlab{font-size:.6rem;font-weight:800;font-family:var(--font-d);text-transform:uppercase;letter-spacing:.08em;color:var(--orange);margin-bottom:6px;display:flex;align-items:center;gap:6px}
.pj-classroom-club .attach{margin-top:11px;border:1px solid var(--bd);border-radius:12px;padding:12px;display:flex;gap:11px;align-items:center;background:var(--g2)}
.pj-classroom-club .attach .ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;font-size:17px;color:#fff}
.pj-classroom-club .attach .t{font-family:var(--font-d);font-weight:800;font-size:.86rem}
.pj-classroom-club .attach .u{font-size:.74rem;color:var(--ink-faint)}
.pj-classroom-club .attach .go{margin-left:auto;font-size:.72rem;font-weight:700;color:var(--cyan);font-family:var(--font-d)}
.pj-classroom-club .reactbar{display:flex;gap:14px;margin-top:12px;font-size:.76rem;color:var(--ink-faint)}
.pj-classroom-club .reactbar span{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.pj-classroom-club .reactbar span:hover{color:var(--ink)}
.pj-classroom-club .rail-card{border:1px solid var(--bd);background:var(--panel);border-radius:var(--r-xl);overflow:hidden;margin-bottom:16px}
.pj-classroom-club .rail-card .rh{padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}
.pj-classroom-club .rail-card .rh h3{font-family:var(--font-d);font-weight:800;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em}
.pj-classroom-club .rail-card .rh .see{font-size:.72rem;color:var(--cyan);font-weight:700}
.pj-classroom-club .rail-card .rb{padding:12px 16px}
.pj-classroom-club .lb{display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid var(--bd)}
.pj-classroom-club .lb:first-child{border-top:0}
.pj-classroom-club .lb .rank{width:20px;font-family:var(--font-d);font-weight:800;font-size:.8rem;color:var(--ink-faint);text-align:center}
.pj-classroom-club .lb .av{width:32px;height:32px;border-radius:99px;display:grid;place-items:center;font-weight:800;font-size:.72rem;color:#fff}
.pj-classroom-club .lb .nm{flex:1;font-weight:700;font-size:.84rem}
.pj-classroom-club .lb .pt{font-family:var(--font-m);font-weight:700;font-size:.8rem;color:var(--success)}
.pj-classroom-club .lb .me{color:var(--orange)}
.pj-classroom-club .mrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--bd)}
.pj-classroom-club .mrow:first-child{border-top:0}
.pj-classroom-club .mrow .av{width:30px;height:30px;border-radius:99px;display:grid;place-items:center;font-weight:800;font-size:.68rem;color:#fff}
.pj-classroom-club .mrow .nm{flex:1;font-size:.84rem;font-weight:600}
.pj-classroom-club .mrow .tag{font-size:.6rem;font-weight:700;font-family:var(--font-d);text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:99px;background:var(--g2);border:1px solid var(--bd);color:var(--ink-dim)}
.pj-classroom-club .mrow .on{width:8px;height:8px;border-radius:99px;background:var(--success);box-shadow:0 0 6px var(--success)}
.pj-classroom-club .note{display:flex;gap:10px;align-items:flex-start;padding:13px;border-radius:12px;background:rgba(6,214,160,.07);border:1px solid rgba(6,214,160,.22);margin-top:6px}
.pj-classroom-club .note .t{font-size:.8rem;color:var(--ink-dim)}.pj-classroom-club .note .t b{color:var(--ink)}
.pj-classroom-club .assign{display:flex;gap:12px;padding:14px;border:1px solid var(--bd);background:var(--g1);border-radius:var(--r-lg);margin-bottom:10px;align-items:center}
.pj-classroom-club .assign .ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;font-size:18px;color:#fff;flex-shrink:0}
.pj-classroom-club .assign .m{flex:1;min-width:0}.pj-classroom-club .assign .m .t{font-family:var(--font-d);font-weight:800;font-size:.9rem}.pj-classroom-club .assign .m .u{font-size:.76rem;color:var(--ink-faint);margin-top:2px}
.pj-classroom-club .assign .due{font-size:.64rem;font-weight:800;font-family:var(--font-d);text-transform:uppercase;letter-spacing:.05em;padding:4px 9px;border-radius:99px}
.pj-classroom-club .due.soon{background:rgba(245,158,11,.16);color:var(--warning)}.pj-classroom-club .due.done{background:rgba(6,214,160,.16);color:var(--success)}.pj-classroom-club .due.open{background:rgba(0,218,243,.14);color:var(--cyan)}
.pj-classroom-club .foot-note{text-align:center;color:var(--ink-faint);font-size:.78rem;padding:16px 0 44px}
@media(prefers-reduced-motion:reduce){.pj-classroom-club *{transition:none!important}}
`;

export default ClassroomClubView;
