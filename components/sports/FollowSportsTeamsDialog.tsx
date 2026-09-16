import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, X } from 'lucide-react';
import { ALL_TEAMS } from '../../data/leagueTeams';
import type { FollowedTeam } from '../../services/sportsPersonalization';
import { Button } from '../ui/Button';

export function FollowSportsTeamsDialog({ favorites, onChange, onClose }: {
  favorites: FollowedTeam[]; onChange: (teams: FollowedTeam[]) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const query = search.trim().toLowerCase();
  const results = query ? ALL_TEAMS.filter(team => `${team.name} ${team.league} ${team.abbreviation}`.toLowerCase().includes(query)).slice(0, 40) : [];
  const isFollowed = (team: FollowedTeam) => favorites.some(f => f.name === team.name && f.league === team.league);
  return createPortal(<dialog ref={dialog} onCancel={onClose} aria-labelledby="follow-sports-title"
    className="rounded-sheet p-5 sm:p-7 w-[min(560px,calc(100%-24px))] max-h-[85dvh] overflow-y-auto backdrop:bg-black/70"
    style={{ background: 'var(--card-bg, #17151e)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 id="follow-sports-title" className="type-headline-sm">Your teams</h2>
      <Button variant="ghost" iconOnly aria-label="Close team picker" onClick={onClose}><X /></Button>
    </div>
    <p className="type-body-md mb-4" style={{ color: 'var(--text-secondary)' }}>On game day, your followed teams take the lead. Follow up to 16 teams across leagues.</p>
    <label htmlFor="follow-sports-search" className="type-label-lg block mb-2">Find a team</label>
    <input id="follow-sports-search" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team or league"
      className="w-full rounded-control px-4 py-3 mb-5" style={{ color: 'var(--text-primary)', background: 'var(--glass-2)', border: '1px solid var(--border-color)' }} />
    <div className="space-y-3">
      {(query ? results : favorites).map(team => {
        const followed = isFollowed(team);
        return <div key={`${team.league}:${team.name}`} className="flex items-center gap-3">
          {team.logo && <img src={team.logo} alt="" className="w-9 h-9 object-contain" />}
          <div className="flex-1 min-w-0"><p className="type-title-sm">{team.name}</p><p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>{team.league}</p></div>
          <Button aria-label={`${followed ? 'Unfollow' : 'Follow'} ${team.name}`} aria-pressed={followed} disabled={!followed && favorites.length >= 16}
            icon={followed ? <Check /> : <Plus />} onClick={() => onChange(followed ? favorites.filter(f => !(f.name === team.name && f.league === team.league)) : [...favorites, team])}>
            {followed ? 'Following' : 'Follow'}
          </Button>
        </div>;
      })}
      {query && !results.length && <p role="status">No matching teams found.</p>}
      {!query && !favorites.length && <p className="type-body-md" style={{ color: 'var(--text-secondary)' }}>Search to follow your first team.</p>}
    </div>
    <div className="flex justify-end mt-6"><Button onClick={onClose}>Done</Button></div>
  </dialog>, document.body);
}
