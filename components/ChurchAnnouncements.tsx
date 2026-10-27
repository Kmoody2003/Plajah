import React, { useEffect, useState } from 'react';
import { Megaphone, Heart, Layers } from 'lucide-react';
import { Organization, Post } from '../types';
import {
  listenToOrgPosts,
  createOrgPost,
  togglePostLike,
  postFieldsForAssetEmbed,
} from '../services/backendService';
import { auth } from '../services/firebase';
import { TYPE } from '../src/lib/designSystem';
import OrgAudienceToggle, {
  type OrgPostTarget,
  orgTargetToPostFields,
} from './elevate/OrgAudienceToggle';
import UniversalPostComposer, { type ComposerSubmitData } from './UniversalPostComposer';
import { resolveComposerMedia } from './FeedView';
import ShareButton from './ShareButton';

// Real, persistent church announcements feed. Staff post announcements (as the
// church identity) using UniversalPostComposer + OrgAudienceToggle (Public, Members,
// Members-Only, Departments, Sub-Groups).
const ChurchAnnouncements: React.FC<{
  orgId: string;
  orgName: string;
  orgPhoto: string;
  org?: Organization;
  isOwner?: boolean;
  /** elevateCan(POST_AS_ORG) — preferred over isOwner */
  canPost?: boolean;
}> = ({ orgId, orgName, orgPhoto, org, isOwner, canPost }) => {
  const mayPost = canPost ?? isOwner;
  const [target, setTarget] = useState<OrgPostTarget>({
    scope: 'PUBLIC',
    departmentIds: [],
    subGroupIds: [],
    rosterGroups: [],
    targetLabels: [],
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const uid = auth.currentUser?.uid;

  useEffect(() => listenToOrgPosts(orgId, setPosts), [orgId]);

  const handlePublishAnnouncement = async (data: ComposerSubmitData) => {
    const resolvedMedia = await resolveComposerMedia(data.attachments || [], uid || orgId);
    const embedFields = await postFieldsForAssetEmbed(data.assetEmbed);
    const targetFields = orgTargetToPostFields(target, org);

    await createOrgPost(orgId, orgName, orgPhoto, {
      text: (data.text || '').trim(),
      ...targetFields,
      ...(resolvedMedia.length ? { media: resolvedMedia } : {}),
      ...(data.poll ? { poll: data.poll } : {}),
      ...(data.quotedPost ? { quotedPost: data.quotedPost } : {}),
      ...(data.taggedUsers?.length ? { taggedUsers: data.taggedUsers } : {}),
      ...embedFields,
    } as Partial<Post>);
  };

  if (posts.length === 0 && !mayPost) return null;

  return (
    <section className="mt-10">
      <h2 className={`${TYPE.labelMd} font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2`}>
        <Megaphone size={12} className="text-small-orange" /> Announcements
      </h2>

      {mayPost && (
        <div className="mb-4">
          <UniversalPostComposer
            currentUser={auth.currentUser}
            compact
            avatarUrl={orgPhoto || auth.currentUser?.photoURL || undefined}
            placeholder={`Post an announcement as ${orgName}…`}
            submitLabel="Publish"
            destinationSlot={
              <OrgAudienceToggle
                org={org}
                target={target}
                onTargetChange={setTarget}
                compact
              />
            }
            onPost={handlePublishAnnouncement}
          />
        </div>
      )}

      {posts.length === 0 ? (
        <p className="type-body-sm text-white/30 uppercase tracking-widest text-center py-6">
          No announcements yet
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map(p => {
            const liked = !!uid && p.likedBy?.includes(uid);
            return (
              <div key={p.id} className="rounded-2xl p-4 bg-white/[0.03] border border-white/10">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <img
                    src={p.authorPhoto || orgPhoto}
                    className="w-8 h-8 rounded-full border border-white/10 object-cover"
                    alt=""
                  />
                  <p className="type-body-md font-black text-white flex-1 min-w-0 truncate">
                    {p.authorName || orgName}
                    <span className={`text-white/30 font-bold ${TYPE.labelSm}`}>
                      {' '}
                      · {new Date(p.timestamp).toLocaleDateString()}
                    </span>
                  </p>
                  {p.orgTargetLabels && p.orgTargetLabels.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/35 text-purple-200 text-[9px] font-black uppercase inline-flex items-center gap-1">
                      <Layers size={9} /> {p.orgTargetLabels.join(' · ')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-3">{p.text}</p>
                {p.media?.[0]?.url && (
                  <img
                    src={p.media[0].url}
                    className="rounded-xl border border-white/10 max-h-72 w-full object-cover mb-3"
                    alt=""
                  />
                )}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => (uid ? togglePostLike(p.id) : alert('Sign in to react.'))}
                    className={`tap flex items-center gap-1.5 ${TYPE.labelMd} font-black uppercase tracking-widest transition-colors`}
                    style={{ color: liked ? '#FF8C00' : 'rgba(255,255,255,0.4)' }}
                  >
                    <Heart size={12} fill={liked ? '#FF8C00' : 'none'} /> {p.likesCount || 0}
                  </button>
                  <ShareButton
                    url={`${window.location.origin}/?org=${orgId}&post=${p.id}`}
                    title={`${p.authorName || orgName} Announcement`}
                    description={p.text?.slice(0, 140)}
                    contentId={p.id}
                    contentType="post"
                    compact
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ChurchAnnouncements;
