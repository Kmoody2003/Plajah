// AcademiaHomeView — the role dispatcher for ACADEMIA_HOME. Each role gets a hub built around what
// that person actually does here, instead of one tile grid for everybody:
//   student → Homeroom (learning apps + stats first)
//   teacher → Teacher Studio (lessons, worksheets, class performance)
//   parent  → Family hub (talk to the teacher, child progress, child's work)
// The full tile directory still exists, one tap away, as ACADEMIA_DIRECTORY.

import React from 'react';
import type { UserProfile } from '../types';
import HomeroomView from './homeroom/HomeroomView';
import TeacherHub from './academia/TeacherHub';
import ParentHub from './academia/ParentHub';
import { lensOf } from '../services/roleLens';
import HomeschoolHub from './academia/HomeschoolHub';
import SchoolSetupSheet from './academia/SchoolSetupSheet';
import { useSchoolProfile } from '../hooks/useSchoolProfile';
import { describeProfile } from '../services/schoolProfile';

type Role = 'teacher' | 'parent' | 'student';

export const roleOf = (p?: UserProfile | null): Role => {
  const t = (p as any)?.accountType;
  if (t === 'TEACHER') return 'teacher';
  if (t === 'PARENT') return 'parent';
  return 'student'; // STUDENT + CHILD + anyone else landing here
};

const AcademiaHomeView: React.FC<{ user?: any; profile?: UserProfile | null; onNavigate: (view: string) => void }> = ({ user, profile, onNavigate }) => {
  const role = roleOf(profile);
  const isAdminLens = !!lensOf(profile);
  const { sp, configured, update } = useSchoolProfile(profile);
  const [setup, setSetup] = React.useState(false);
  const adult = role !== 'student';
  const directory = (
    <div className="bg-[#0a0a0f] px-5 pb-10">
      <div className="max-w-5xl mx-auto">
        <button type="button" onClick={() => onNavigate('ACADEMIA_DIRECTORY')}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-white/70 text-[12px] font-black uppercase tracking-widest py-3 transition-colors">
          Everything in Academia →
        </button>
        <button type="button" onClick={() => onNavigate('LEARN')}
          className="w-full mt-2 rounded-2xl border border-[#3FB98E]/30 bg-[#3FB98E]/10 hover:bg-[#3FB98E]/20 text-[#7fe0bd] text-[12px] font-black uppercase tracking-widest py-3 transition-colors">
          Open the Learn map: every course, with practice →
        </button>
      </div>
    </div>
  );

  const schoolBar = adult ? (
    <div className="bg-[#0a0a0f] px-5 pt-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <p className="text-[12px] text-white/60 truncate">{configured ? <><b className="text-white/85">{sp.name || 'Your school'}</b> · {describeProfile(sp)}</> : 'Tell us about your school (public, charter, private, faith-based or homeschool) and Academia will fit it.'}</p>
        <button type="button" onClick={() => setSetup(true)} className="text-[11px] font-black uppercase tracking-wider rounded-full border border-white/15 px-3 py-1.5 hover:bg-white/10 whitespace-nowrap">{configured ? 'Edit' : 'Set up'}</button>
      </div>
      {setup && <SchoolSetupSheet initial={sp} onSave={update} onClose={() => setSetup(false)} />}
    </div>
  ) : null;

  if (role === 'parent' && sp.setting === 'homeschool') return <><HomeschoolHub user={user} profile={profile} onNavigate={onNavigate} />{directory}</>;
  if (role === 'teacher') return <>{schoolBar}<TeacherHub user={user} profile={profile} onNavigate={onNavigate} isAdminLens={isAdminLens} />{directory}</>;
  if (role === 'parent') return <>{schoolBar}<ParentHub user={user} profile={profile} onNavigate={onNavigate} />{directory}</>;
  return <><HomeroomView user={user} profile={profile} onNavigate={onNavigate} />{directory}</>;
};

export default AcademiaHomeView;
