// components/church/OrgEducationScopeGovernancePanel.tsx
// Plajah Elevate — Christian Education Department Scope & Resource Governance Panel.
//
// Enforces the Organization Education Wing rule:
//   - By default, an organization's Instructor Studio & Teacher Tools only surface
//     Religious & Biblical content + the organization's own uploaded body of resources.
//   - The Head of Christian Education (or Department Admin / Pastor / Owner) can scale
//     the education wing up under the organization if it offers Tutoring, Continuing
//     Education, Stewardship/Life Skills, Sacred Music, or Literacy/ESL.

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Sliders,
  FolderOpen,
  Check,
  Plus,
  X,
  RotateCcw,
  BookOpen,
  Sparkles,
  FileText,
  ExternalLink,
} from 'lucide-react';
import type { Organization } from '../../types';
import {
  ORG_EDUCATION_TRACKS,
  loadOrgEducationScope,
  saveOrgEducationScope,
  getDefaultOrgEducationScope,
  listOrgUploadedEducationResources,
  type OrgEducationScopeConfig,
  type OrgEducationScopeTrackId,
  type OrgUploadedEducationResource,
} from '../../services/orgEducationScopeService';

interface OrgEducationScopeGovernancePanelProps {
  org: Organization;
  canManageScope: boolean;
  currentUserName?: string;
  onScopeChange?: (config: OrgEducationScopeConfig) => void;
  onOpenWorksheetExtractor?: () => void;
}

export const OrgEducationScopeGovernancePanel: React.FC<OrgEducationScopeGovernancePanelProps> = ({
  org,
  canManageScope,
  currentUserName,
  onScopeChange,
  onOpenWorksheetExtractor,
}) => {
  const [config, setConfig] = useState<OrgEducationScopeConfig>(() => loadOrgEducationScope(org));
  const [uploadedResources, setUploadedResources] = useState<OrgUploadedEducationResource[]>(() =>
    listOrgUploadedEducationResources(org)
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourcesModalOpen, setResourcesModalOpen] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');

  useEffect(() => {
    const sync = () => {
      setConfig(loadOrgEducationScope(org));
      setUploadedResources(listOrgUploadedEducationResources(org));
    };
    sync();
    window.addEventListener('plajah:orgEduScopeUpdated', sync);
    return () => window.removeEventListener('plajah:orgEduScopeUpdated', sync);
  }, [org]);

  const toggleTrack = (trackId: OrgEducationScopeTrackId) => {
    if (!canManageScope || trackId === 'ORG_UPLOADED_RESOURCES') return;
    const exists = config.enabledTracks.includes(trackId);
    const nextTracks = exists
      ? config.enabledTracks.filter(t => t !== trackId)
      : [...config.enabledTracks, trackId];
    if (nextTracks.length === 0) return;
    const saved = saveOrgEducationScope({
      ...config,
      enabledTracks: nextTracks,
      updatedByName: currentUserName || 'Christian Education Head',
    });
    setConfig(saved);
    onScopeChange?.(saved);
  };

  const addCustomTopic = () => {
    const trimmed = topicDraft.trim();
    if (!trimmed || !canManageScope) return;
    setTopicDraft('');
    const saved = saveOrgEducationScope({
      ...config,
      customFocusTopics: Array.from(new Set([...(config.customFocusTopics || []), trimmed])),
      updatedByName: currentUserName || 'Christian Education Head',
    });
    setConfig(saved);
    onScopeChange?.(saved);
  };

  const removeCustomTopic = (topic: string) => {
    if (!canManageScope) return;
    const saved = saveOrgEducationScope({
      ...config,
      customFocusTopics: (config.customFocusTopics || []).filter(t => t !== topic),
      updatedByName: currentUserName || 'Christian Education Head',
    });
    setConfig(saved);
    onScopeChange?.(saved);
  };

  const resetToChurchDefault = () => {
    if (!canManageScope) return;
    const def = getDefaultOrgEducationScope(org);
    const saved = saveOrgEducationScope({
      ...def,
      updatedByName: currentUserName || 'Christian Education Head',
    });
    setConfig(saved);
    onScopeChange?.(saved);
  };

  const activeTrackDefs = ORG_EDUCATION_TRACKS.filter(t => config.enabledTracks.includes(t.id));

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-[#120e1c]/90 p-3.5 sm:p-4 space-y-3 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/35 text-amber-300 grid place-items-center shrink-0 mt-0.5">
            <ShieldCheck size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                Scoped to {org.name} · Christian Education Wing
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold">
                Full K-12 Catalog Filtered Out
              </span>
            </div>
            <p className="text-xs text-white/65 mt-0.5">
              Instructor Studio &amp; Tools only surface topics and materials provisioned for{' '}
              <b className="text-white">{org.name}</b> ({activeTrackDefs.map(t => t.shortLabel).join(' · ')}).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadedResources(listOrgUploadedEducationResources(org));
              setResourcesModalOpen(v => !v);
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-[11px] font-bold inline-flex items-center gap-1.5"
          >
            <FolderOpen size={13} />
            <span>Org Uploaded Resources ({uploadedResources.length})</span>
          </button>

          {canManageScope && (
            <button
              type="button"
              onClick={() => setDrawerOpen(v => !v)}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-black inline-flex items-center gap-1.5"
            >
              <Sliders size={13} />
              <span>{drawerOpen ? 'Close Scope Settings' : 'Department Head: Set Content Scope'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Track Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {activeTrackDefs.map(track => (
          <span
            key={track.id}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 border"
            style={{
              background: `${track.badgeColor}18`,
              borderColor: `${track.badgeColor}50`,
              color: track.badgeColor,
            }}
          >
            <Check size={11} />
            {track.shortLabel}
          </span>
        ))}
        {(config.customFocusTopics || []).map(topic => (
          <span
            key={topic}
            className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold text-white/85 inline-flex items-center gap-1"
          >
            <Sparkles size={10} className="text-amber-300" />
            {topic}
            {canManageScope && (
              <button
                type="button"
                onClick={() => removeCustomTopic(topic)}
                className="text-white/40 hover:text-white ml-0.5"
                title="Remove focus topic"
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Organization Uploaded Body of Resources Drawer */}
      {resourcesModalOpen && (
        <div className="rounded-xl border border-emerald-400/30 bg-black/50 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300">
                {org.name} · Uploaded Body of Resources &amp; Extracted Tela Units
              </h4>
              <p className="text-[11px] text-white/55">
                Materials uploaded by your department instructors, volunteers, and leaders.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onOpenWorksheetExtractor && (
                <button
                  type="button"
                  onClick={onOpenWorksheetExtractor}
                  className="px-2.5 py-1 rounded-lg bg-emerald-400 text-black text-[11px] font-black inline-flex items-center gap-1"
                >
                  <Plus size={12} /> Capture / Upload Worksheet or Doc
                </button>
              )}
              <button
                type="button"
                onClick={() => setResourcesModalOpen(false)}
                className="text-white/50 hover:text-white text-xs px-2 py-1"
              >
                Close
              </button>
            </div>
          </div>

          {uploadedResources.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-white/55">
              No organization documents or Tela lessons have been uploaded yet. Use the{' '}
              <b className="text-white">Worksheet &amp; Doc Capture</b> tool in the Teacher&apos;s Toolbox or the{' '}
              <b className="text-white">Manage → Department Uploads</b> tab to add your church&apos;s study guides and handouts.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {uploadedResources.map(res => (
                <div
                  key={res.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} className="text-emerald-300 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">{res.title}</span>
                    </div>
                    <p className="text-[11px] text-white/55 truncate mt-0.5">{res.summary}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {res.departmentName} · by {res.uploadedByName}
                    </p>
                  </div>
                  {res.telaDocId && (
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('plajah:openTela', { detail: { docId: res.telaDocId } })
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold shrink-0 inline-flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> Open Tela
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Department Head Scope Configuration Drawer */}
      {drawerOpen && canManageScope && (
        <div className="rounded-xl border border-amber-400/35 bg-black/60 p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <BookOpen size={13} /> Head of Christian Education · Content &amp; Track Governance
              </h4>
              <p className="text-[11px] text-white/60 mt-0.5">
                By default, {org.name} is scoped to <b>Religious &amp; Biblical Studies</b> and{' '}
                <b>Organization Uploaded Resources</b>. Toggle additional tracks below if your education wing offers
                tutoring, continuing education, stewardship, or literacy classes under {org.name}.
              </p>
            </div>
            <button
              type="button"
              onClick={resetToChurchDefault}
              className="px-2.5 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-[11px] font-bold text-white/75 inline-flex items-center gap-1"
            >
              <RotateCcw size={11} /> Reset to Church Default
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-2.5">
            {ORG_EDUCATION_TRACKS.map(track => {
              const on = config.enabledTracks.includes(track.id);
              return (
                <button
                  key={track.id}
                  type="button"
                  disabled={track.lockedCore}
                  onClick={() => toggleTrack(track.id)}
                  className={`text-left rounded-xl p-3 border transition flex items-start gap-2.5 ${
                    on
                      ? 'bg-white/[0.06] border-amber-400/50'
                      : 'bg-white/[0.02] border-white/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-md grid place-items-center shrink-0 mt-0.5 border"
                    style={{
                      background: on ? track.badgeColor : 'transparent',
                      borderColor: on ? track.badgeColor : 'rgba(255,255,255,0.25)',
                      color: on ? '#000' : 'transparent',
                    }}
                  >
                    <Check size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{track.label}</span>
                      {track.defaultEnabledForChurch && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 shrink-0">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/60 leading-relaxed mt-0.5">{track.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Focus Topics */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
            <span className="text-[11px] font-bold text-white/70">Add Custom Organization Topic:</span>
            <input
              value={topicDraft}
              onChange={e => setTopicDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomTopic();
                }
              }}
              placeholder="e.g., Book of Acts Study, Deacon Training, SAT Math Tutoring..."
              className="flex-1 min-w-[210px] bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400/60"
            />
            <button
              type="button"
              onClick={addCustomTopic}
              className="px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1"
            >
              <Plus size={12} /> Add Topic
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgEducationScopeGovernancePanel;
