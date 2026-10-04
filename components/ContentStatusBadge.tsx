import React from 'react';
import { CONTENT_STATUS_META, type ContentStatus } from '../services/contentStatus';

/** Small chip for UNDER_REVIEW / COMING_SOON content. Renders nothing for LIVE. Plajah DS tokens only. */
const ContentStatusBadge: React.FC<{ status?: ContentStatus; className?: string }> = ({ status, className }) => {
  if (!status || status === 'LIVE') return null;
  const m = CONTENT_STATUS_META[status];
  const review = status === 'UNDER_REVIEW';
  return (
    <span title={m.detail} aria-label={m.detail} data-testid={`content-status-${status}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${className || ''}`}
      style={{ background: review ? 'var(--pj-warning-soft)' : 'var(--pj-info-soft)', color: review ? 'var(--pj-warning)' : 'var(--pj-info)', border: `1px solid ${review ? 'var(--pj-warning)' : 'var(--pj-info)'}` }}>
      {m.label}
    </span>
  );
};
export default ContentStatusBadge;
