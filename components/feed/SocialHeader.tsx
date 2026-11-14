// Plajah Social header: wordmark, search and Create on top; For You / Following / News and Sources below.
// Sticky inside the page scroller. Everything that used to be its own tab or chip lives in the two menus here.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronDown, Clock, Columns2, Heart, MessageSquare, Mic, Plus, Radio, Search, SlidersHorizontal, Sparkles, User, Users, X } from 'lucide-react';

export type SocialLens = 'ALL' | 'FOLLOWING' | 'NEWS';
export interface SocialSource { id: string; label: string; detail: string; color: string; on: boolean }

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; detail?: string; on?: boolean; onClick: () => void }> = ({ icon, label, detail, on, onClick }) => (
  <button type="button" role="menuitem" className="pj-social-mi" onClick={onClick}>
    {icon}
    <span className="pj-social-mi-text">{label}{detail && <small>{detail}</small>}</span>
    {on !== undefined && <i className={`pj-social-switch ${on ? 'on' : ''}`} aria-hidden />}
  </button>
);

interface Props {
  lens: SocialLens | null;
  scopeLabel: string | null;
  onClearScope: () => void;
  onLens: (lens: SocialLens) => void;
  onBack: () => void;
  signedIn: boolean;
  sources: SocialSource[];
  onToggleSource: (id: string) => void;
  onConnect: () => void;
  blueskyConnected: boolean;
  onSearchBluesky: () => void;
  liked: boolean;
  dual: boolean;
  syncScroll: boolean;
  streak?: React.ReactNode;
  on: {
    post: () => void; today: () => void; story: () => void; room: () => void; talk: () => void; goLive: () => void;
    myPosts: () => void; liked: () => void; saved: () => void; people: () => void; controls: () => void; dual: () => void; sync: () => void;
  };
}

const SocialHeader: React.FC<Props> = ({
  lens, scopeLabel, onClearScope, onLens, onBack, signedIn, sources, onToggleSource, onConnect,
  blueskyConnected, onSearchBluesky, liked, dual, syncScroll, streak, on,
}) => {
  const [menu, setMenu] = useState<null | 'create' | 'sources'>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => { if (!root.current?.querySelector('.pj-social-menu')?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-social-menu]')) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const pick = (fn: () => void) => () => { setMenu(null); fn(); };

  return (
    <header ref={root} className="pj-social-head">
      <div className="pj-social-top">
        <button type="button" onClick={onBack} aria-label="Back" className="pj-social-icon"><ArrowLeft size={18} /></button>
        <h1 className="pj-social-mark">Plajah <span className="pj-text-brand">Social</span></h1>
        <button type="button" className="pj-social-search" onClick={() => { try { window.dispatchEvent(new CustomEvent('plajah:open-command')); } catch { /* */ } }}>
          <Search size={15} /> <span>Search people, posts, rooms, news</span>
        </button>
        <button type="button" className="pj-social-icon pj-social-search-icon" aria-label="Search" onClick={() => { try { window.dispatchEvent(new CustomEvent('plajah:open-command')); } catch { /* */ } }}><Search size={17} /></button>
        <button type="button" data-social-menu className="pj-social-create" aria-expanded={menu === 'create'} onClick={() => setMenu(m => (m === 'create' ? null : 'create'))}>
          <Plus size={16} /> <span>Create</span>
        </button>
      </div>
      <div className="pj-social-sub">
        <nav className="pj-social-seg" aria-label="Feed views">
          {([['ALL', 'For You'], ['FOLLOWING', 'Following'], ['NEWS', 'News']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-current={lens === id ? 'page' : undefined} onClick={() => onLens(id)}>{label}</button>
          ))}
        </nav>
        {scopeLabel && (
          <button type="button" className="pj-social-scope" onClick={onClearScope}>{scopeLabel} <X size={13} /></button>
        )}
        <button type="button" data-social-menu className="pj-social-sources" aria-expanded={menu === 'sources'} onClick={() => setMenu(m => (m === 'sources' ? null : 'sources'))}>
          <i aria-hidden>{sources.filter(s => s.on).map(s => <span key={s.id} style={{ background: s.color }} />)}</i>
          <span className="pj-social-sources-label">Sources</span>
          <ChevronDown size={14} />
        </button>
      </div>

      {menu === 'create' && (
        <div className="pj-social-menu" role="menu">
          <MenuItem icon={<MessageSquare size={17} />} label="Post" detail="Share with your audience" onClick={pick(on.post)} />
          <MenuItem icon={<Clock size={17} />} label="Today" detail="Gone in 24 hours" onClick={pick(on.today)} />
          <MenuItem icon={<Sparkles size={17} />} label="Story" detail="Photos and clips at the top" onClick={pick(on.story)} />
          <MenuItem icon={<Users size={17} />} label="Start a room" detail="15 to 45 minutes, anyone can join" onClick={pick(on.room)} />
          <MenuItem icon={<Mic size={17} />} label="Start a live talk" detail="A hosted conversation" onClick={pick(on.talk)} />
          <MenuItem icon={<Radio size={17} />} label="Go live" detail="Video to your followers" onClick={pick(on.goLive)} />
        </div>
      )}

      {menu === 'sources' && (
        <div className="pj-social-menu" role="menu">
          <h4>In this feed</h4>
          <div className="pj-social-mi is-static"><span className="pj-social-dot" style={{ background: '#D40055' }} /><span className="pj-social-mi-text">Plajah<small>Everyone here</small></span></div>
          {sources.filter(s => s.id !== 'plajah').map(s => (
            <MenuItem key={s.id} icon={<span className="pj-social-dot" style={{ background: s.color }} />} label={s.label} detail={s.detail} on={s.on} onClick={() => onToggleSource(s.id)} />
          ))}
          <MenuItem icon={<Plus size={17} />} label="Connect a network" detail="Bluesky, Mastodon or Audius" onClick={pick(onConnect)} />
          {blueskyConnected && <MenuItem icon={<Search size={17} />} label="Search Bluesky" onClick={pick(onSearchBluesky)} />}
          {signedIn && (
            <>
              <h4>Show only</h4>
              <MenuItem icon={<User size={17} />} label="My posts" onClick={pick(on.myPosts)} />
              <MenuItem icon={<Heart size={17} />} label="Liked" on={liked} onClick={pick(on.liked)} />
              <MenuItem icon={<Bookmark size={17} />} label="Saved" onClick={pick(on.saved)} />
              <h4>More</h4>
              <MenuItem icon={<Users size={17} />} label="Find people" onClick={pick(on.people)} />
              <MenuItem icon={<SlidersHorizontal size={17} />} label="Feed controls" detail="Muted words, show less" onClick={pick(on.controls)} />
              <MenuItem icon={<Columns2 size={17} />} label="Posts and media side by side" on={dual} onClick={on.dual} />
              {dual && <MenuItem icon={<Columns2 size={17} />} label="Scroll both together" on={syncScroll} onClick={on.sync} />}
              {streak && <div className="pj-social-mi is-static pj-social-streak">{streak}</div>}
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default SocialHeader;
