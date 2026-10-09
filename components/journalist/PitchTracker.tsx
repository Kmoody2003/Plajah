import React, { useState } from 'react';
import { Check, Plus, Send, Trash2, X } from 'lucide-react';
import { Button, Chip, Input, Surface, Textarea } from '../ui';
import { newId, newPitch, saveItem } from '../../services/journalist/newsroomStore';
import { canTransitionPitch, stalePitches, storyFromPitch } from '../../services/journalist/deskLogic';
import type { Pitch, PitchStatus } from '../../services/journalist/types';
import { useNewsroomList, type Scope } from './useNewsroom';

const COLORS: Record<PitchStatus, string> = { DRAFT: '#9C96B4', SUBMITTED: '#00DAF3', ACCEPTED: '#06D6A0', REJECTED: '#FF5C6C', KILLED: '#6b6b7b' };

export const PitchTracker: React.FC<{ orgId?: string; scope: Scope }> = ({ orgId, scope }) => {
  const { items, error, save, remove } = useNewsroomList<Pitch>('newsroom_pitches', orgId);
  const [headline, setHeadline] = useState(''); const [angle, setAngle] = useState(''); const [outlet, setOutlet] = useState(''); const [due, setDue] = useState('');
  const stale = stalePitches(items);

  const add = () => {
    if (!headline.trim() || !angle.trim()) return;
    void save(newPitch(headline.trim(), angle.trim(), { orgId: orgId || undefined, targetOutlet: outlet.trim() || undefined, responseDue: due ? new Date(due).getTime() : undefined }));
    setHeadline(''); setAngle(''); setOutlet(''); setDue('');
  };
  const setStatus = async (p: Pitch, to: PitchStatus) => {
    if (!canTransitionPitch(p.status, to)) return;
    const next: Pitch = { ...p, status: to };
    if (to === 'ACCEPTED' && !p.storyId) {
      // Accepting creates the story on the desk and links both ways.
      const story = storyFromPitch(next, { id: newId('story') });
      await saveItem('newsroom_stories', story);
      next.storyId = story.id;
    }
    void save(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <Surface level={2} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Input label="Working headline" value={headline} onChange={e => setHeadline(e.target.value)} className="flex-1 min-w-[220px]" />
          <Input label="Outlet / editor" placeholder="Metro desk" value={outlet} onChange={e => setOutlet(e.target.value)} className="w-48" />
          <Input label="Answer due" type="date" value={due} onChange={e => setDue(e.target.value)} className="w-44" />
        </div>
        <Textarea label="The angle: what is new, why now, who is affected" rows={3} value={angle} onChange={e => setAngle(e.target.value)} />
        <div><Button variant="primary" icon={<Plus />} onClick={add} disabled={!headline.trim() || !angle.trim()}>Save pitch</Button></div>
      </Surface>
      {stale.length > 0 && <p className="text-sm" style={{ color: '#FF8C00' }}>{stale.length} pitch{stale.length > 1 ? 'es are' : ' is'} past the answer date. Follow up or close {stale.length > 1 ? 'them' : 'it'}.</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--pj-danger)' }}>{error}</p>}
      <ul className="flex flex-col gap-3">
        {items.sort((a, b) => b.updatedAt - a.updatedAt).map(p => (
          <li key={p.id}>
            <Surface level={1} className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{p.headline}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{p.angle}</p>
                  <p className="text-[11px] mt-1 opacity-60">{[p.targetOutlet, p.responseDue ? `answer by ${new Date(p.responseDue).toLocaleDateString()}` : '', p.storyId ? 'on the desk' : ''].filter(Boolean).join(' · ')}</p>
                </div>
                <Chip style={{ color: COLORS[p.status] }}>{p.status}</Chip>
              </div>
              <div className="pj-actions">
                {p.status === 'DRAFT' && <Button size="sm" variant="secondary" icon={<Send />} onClick={() => void setStatus(p, 'SUBMITTED')}>Mark submitted</Button>}
                {p.status === 'SUBMITTED' && scope.canManage && <>
                  <Button size="sm" variant="success" icon={<Check />} onClick={() => void setStatus(p, 'ACCEPTED')}>Accepted: add to desk</Button>
                  <Button size="sm" variant="outline" icon={<X />} onClick={() => void setStatus(p, 'REJECTED')}>Rejected</Button>
                </>}
                {p.status === 'REJECTED' && <Button size="sm" variant="secondary" onClick={() => void setStatus(p, 'SUBMITTED')}>Re-pitch elsewhere</Button>}
                {p.status !== 'KILLED' && p.status !== 'ACCEPTED' && <Button size="sm" variant="ghost" onClick={() => void setStatus(p, 'KILLED')}>Kill</Button>}
                <Button size="sm" variant="danger-quiet" iconOnly aria-label="Delete pitch" onClick={() => { if (window.confirm('Delete this pitch?')) void remove(p.id); }}><Trash2 /></Button>
              </div>
            </Surface>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PitchTracker;
