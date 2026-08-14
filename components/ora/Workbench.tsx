import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Surface, Eyebrow, Chip } from '../ui';
import { assembleWorkbench, loose, type WorkbenchResult, type WorkProject } from '../../services/oraWorkbench';

/**
 * Ora — Workbench.
 *
 * The productivity half's proof. There is no "create your first project" empty
 * state here, because the projects already exist: this reads the real releases,
 * manuscripts and uploads on the account and lays them out as work in progress.
 *
 * The loose-ends list is the part that earns its keep — every entry is a
 * concretely missing field on a real record ("no cover image", "no thumbnail"),
 * never a guess about whether something is finished.
 *
 * Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md §4b
 */

const SERVICE_TINT: Record<string, string> = {
  CHORA: 'var(--pj-orange)',
  LOREA: 'var(--pj-lilac)',
  REELLO: 'var(--pj-magenta)',
};

const ProjectCard: React.FC<{ p: WorkProject }> = ({ p }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? p.items : p.items.slice(0, 3);
  return (
    <Surface level={1}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--pj-space-3)' }}>
        <span
          aria-hidden="true"
          style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: SERVICE_TINT[p.service] || 'var(--pj-border)' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--pj-space-2)', flexWrap: 'wrap' }}>
            <p className="type-title-md" style={{ margin: 0 }}>{p.title}</p>
            <Chip>{p.label}</Chip>
          </div>
          <p className="type-body-sm" style={{ margin: '2px 0 0', color: 'var(--on-surface-variant)' }}>{p.state}</p>
        </div>
        {/* IconButton is button-only by type; a real navigation needs an anchor,
            so this uses Button's `as="a"` with iconOnly for the same geometry. */}
        {p.ref && (
          <Button
            as="a"
            href={p.ref}
            variant="ghost"
            size="sm"
            iconOnly
            icon={<ExternalLink />}
            aria-label={`Open in ${p.label}`}
          />
        )}
      </div>

      {p.items.length > 0 && (
        <div style={{ marginTop: 'var(--pj-space-4)', display: 'grid', gap: 'var(--pj-space-2)' }}>
          {shown.map((i) => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--pj-space-3)' }}>
              <span className="type-body-md" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i.title}
              </span>
              <span className="type-body-sm" style={{ color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {i.state}
              </span>
              {i.needs && (
                <span
                  className="type-label-md"
                  style={{ color: 'var(--pj-orange)', whiteSpace: 'nowrap' }}
                  title={i.needs}
                >
                  ·
                </span>
              )}
            </div>
          ))}
          {p.items.length > 3 && (
            <Button
              variant="ghost"
              size="xs"
              icon={open ? <ChevronDown /> : <ChevronRight />}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? 'Show less' : `${p.items.length - 3} more`}
            </Button>
          )}
        </div>
      )}
    </Surface>
  );
};

export const Workbench: React.FC = () => {
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setResult(await assembleWorkbench());
    setBusy(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ends = result ? loose(result) : [];

  return (
    <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--pj-space-3)' }}>
        <div style={{ flex: 1 }}>
          <Eyebrow>Workbench</Eyebrow>
          <p className="type-body-sm" style={{ margin: 'var(--pj-space-2) 0 0', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            {result && result.itemCount > 0
              ? `Assembled from your work. You added none of this by hand — Plajah found ${result.itemCount} piece${result.itemCount === 1 ? '' : 's'}.`
              : 'Your releases, manuscripts and uploads, assembled as work in progress.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={busy} onClick={load}>
          Refresh
        </Button>
      </div>

      {/* Loose ends first — the only genuinely actionable thing on the screen,
          and every entry is an absent field on a real record, not a guess. */}
      {ends.length > 0 && (
        <Surface level={2} shape="sheet" brand>
          <Eyebrow>Loose ends</Eyebrow>
          <div style={{ marginTop: 'var(--pj-space-3)', display: 'grid', gap: 'var(--pj-space-3)' }}>
            {ends.slice(0, 8).map(({ project, item, label }) => (
              <div key={`${project}_${item.id}`} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--pj-space-3)' }}>
                <span className="type-body-md" style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.title}</strong>
                  <span style={{ color: 'var(--on-surface-variant)' }}> — {project}</span>
                </span>
                <span className="type-body-sm" style={{ color: 'var(--pj-orange)', whiteSpace: 'nowrap' }}>{item.needs}</span>
                <Chip>{label}</Chip>
              </div>
            ))}
          </div>
          {ends.length > 8 && (
            <p className="type-body-sm" style={{ margin: 'var(--pj-space-3) 0 0', color: 'var(--on-surface-variant)' }}>
              and {ends.length - 8} more.
            </p>
          )}
        </Surface>
      )}

      {result?.projects.map((p) => <ProjectCard key={p.id} p={p} />)}

      {!busy && result && result.projects.length === 0 && (
        <p className="type-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', padding: 'var(--pj-space-8) 0' }}>
          {result.partial
            ? 'Could not reach your work just now. Nothing is missing — try refreshing.'
            : 'Nothing on the workbench yet. Release something on Chora, start a book in Lorea, or post to Reello and it will appear here on its own.'}
        </p>
      )}

      {/* An unreadable source is said out loud rather than rendered as "you have
          nothing" — silently showing an empty workbench would be a lie. */}
      {result?.partial && result.projects.length > 0 && (
        <p className="type-body-sm" style={{ color: 'var(--on-surface-variant)', textAlign: 'center' }}>
          Some of your work could not be read just now, so this list may be incomplete.
        </p>
      )}
    </div>
  );
};

export default Workbench;
