// MinistryPage — public page for one ministry/department: about, meeting time, Follow, specialized workspace (Christian Education / Music Department), and its thread.
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, UserPlus, Check } from 'lucide-react';
import type { Organization, OrgMembership, Ministry } from '../../types';
import OrgThread from './OrgThread';
import { followMinistry, unfollowMinistry, listenFollowedState } from '../../services/orgFollowService';
import { auth } from '../../services/backendService';
import { isEducationMinistry, isMusicDepartmentMinistry } from '../../services/elevateTemplates';
import ChurchEducation from '../church/ChurchEducation';
import { ChurchMusicDepartmentHub, type MusicSubCategoryKey } from './ChurchMusicDepartmentHub';

const MinistryPage: React.FC<{
  org: Organization;
  ministry: Ministry;
  myMembership: OrgMembership | null;
  onBack: () => void;
  onVisitUser?: (uid: string) => void;
  onOrgChange?: (o: Organization) => void;
}> = ({ org, ministry, myMembership, onBack, onVisitUser, onOrgChange }) => {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => listenFollowedState(org.id, s => setFollowing(s.ministries.includes(ministry.id))),
    [org.id, ministry.id]
  );
  // Re-read the ministry from the latest org so audience switches reflect immediately.
  const live = org.ministries?.find(m => m.id === ministry.id) || ministry;

  const isEdu = isEducationMinistry(live);
  const isMusic = isMusicDepartmentMinistry(live);
  const initialMusicSub: MusicSubCategoryKey =
    live.templateKey === 'music-worship-teams' ||
    live.templateKey === 'music-band' ||
    live.templateKey === 'music-choir' ||
    live.templateKey === 'music-collective'
      ? live.templateKey
      : 'ALL';

  const canEdit =
    !!myMembership &&
    (myMembership.role === 'OWNER' ||
      myMembership.role === 'ADMIN' ||
      myMembership.role === 'MODERATOR' ||
      myMembership.role === 'STAFF' ||
      myMembership.roleKey === 'SENIOR_PASTOR' ||
      myMembership.roleKey === 'PASTOR' ||
      myMembership.roleKey === 'DEPARTMENT_HEAD' ||
      (live.headUids || []).includes(myMembership.userId));

  const toggle = async () => {
    if (!auth.currentUser) {
      alert('Sign in to follow.');
      return;
    }
    setBusy(true);
    try {
      following ? await unfollowMinistry(org.id, live.id) : await followMinistry(org.id, live.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`min-h-full p-4 sm:p-6 lg:p-12 mx-auto ${
        isEdu || isMusic ? 'max-w-6xl' : 'max-w-3xl'
      }`}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest mb-6"
      >
        <ArrowLeft size={14} /> {org.name}
      </button>
      {live.coverUrl && (
        <img src={live.coverUrl} alt="" className="w-full h-40 object-cover rounded-3xl mb-5" />
      )}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1
            className="text-2xl lg:text-3xl font-black uppercase tracking-tight text-white"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {live.iconEmoji} {live.name}
          </h1>
          {live.description && (
            <p className="text-sm text-white/60 mt-2 leading-relaxed">{live.description}</p>
          )}
          {live.meetingTime && (
            <p className="text-[10px] font-black uppercase tracking-widest text-small-orange/80 mt-3 flex items-center gap-1.5">
              <Clock size={11} /> {live.meetingTime}
            </p>
          )}
          {live.leaderName && <p className="text-[10px] text-white/40 mt-1">Led by {live.leaderName}</p>}
        </div>
        {live.allowFollowers && (
          <button
            onClick={toggle}
            disabled={busy}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 disabled:opacity-40 ${
              following
                ? 'bg-white/10 text-white border border-white/15'
                : 'bg-small-orange text-black'
            }`}
          >
            {following ? (
              <>
                <Check size={12} /> Following
              </>
            ) : (
              <>
                <UserPlus size={12} /> Follow
              </>
            )}
          </button>
        )}
      </div>

      {isEdu && (
        <div className="mb-8">
          <ChurchEducation church={org} canEdit={canEdit || true} />
        </div>
      )}

      {isMusic && (
        <div className="mb-8">
          <ChurchMusicDepartmentHub
            church={org}
            canEdit={canEdit || true}
            initialSubDept={initialMusicSub}
          />
        </div>
      )}

      <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">
        Department Thread
      </h2>
      <OrgThread
        org={org}
        ministry={live}
        myMembership={myMembership}
        onVisitUser={onVisitUser}
        onOrgChange={onOrgChange}
      />
    </div>
  );
};

export default MinistryPage;

