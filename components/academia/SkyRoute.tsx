// SkyRoute — loads the signed-in learner's mastery, then hands it to SkyView.
//
// Split from SkyView so the view itself stays a pure function of (graph, mastery): that's what
// lets it be previewed, screenshotted and tested without a Firestore session. This wrapper is
// the only part that knows an account exists.
//
// A parent or teacher opening the Sky sees the map WITHOUT anyone's progress on it, and the
// view says so rather than implying it is theirs. Their own versions — a child's sky, a class's
// dim standards — need a learner picker that doesn't exist yet, and showing an unlabelled empty
// map would read as "your child has done nothing", which is a different and much worse claim.

import React, { useEffect, useState } from 'react';
import SkyView from './SkyView';
import { loadProficiency } from '../../services/learningLedgerService';

const SkyRoute: React.FC<{
  user?: any;
  profile?: any;
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}> = ({ user, profile, onBack, onNavigate }) => {
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const accountType = profile?.accountType;
  // CHILD and school-provisioned accounts are learners too; anyone else is looking at the map
  // rather than standing on it.
  const isLearner = accountType === 'STUDENT' || accountType === 'CHILD' || !!profile?.provisionedByTeacherUid;

  useEffect(() => {
    let alive = true;
    if (!user?.uid || !isLearner) return;
    loadProficiency(user.uid)
      .then(p => { if (alive && p?.byStandard) setMastery(p.byStandard); })
      .catch(() => { /* an empty sky is the honest fallback — never a fabricated one */ });
    return () => { alive = false; };
  }, [user?.uid, isLearner]);

  return (
    <SkyView
      masteryByStandard={mastery}
      viewerIsLearner={isLearner}
      onBack={onBack}
      onOpenDomain={onNavigate ? () => onNavigate('CLASSROOMS') : undefined}
    />
  );
};

export default SkyRoute;
