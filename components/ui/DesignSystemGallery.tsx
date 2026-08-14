import React, { useEffect, useState } from 'react';
import {
  Play, Heart, Share2, Plus, X, Check, Trash2, ChevronRight, Search,
  Mic, Radio, Settings, Download, Star,
} from 'lucide-react';
import { Button, IconButton, type ButtonVariant, type ButtonSize } from './Button';
import { Surface, Actions, Eyebrow } from './Surface';
import { Input, Textarea, Chip } from './Field';

/**
 * Design-system gallery — every primitive, every variant, every size, in every theme.
 *
 * Reachable at /ds. Rendered standalone (no app shell, no auth), because its job
 * is to isolate the control layer from everything around it.
 *
 * This exists because `vite build` does not typecheck and most of this platform's
 * surfaces (TV, native) cannot be previewed easily — a visual gallery is the
 * cheapest way to catch a control that breaks in one of the nine themes.
 *
 * Spec: docs/PLAJAH_DESIGN_SYSTEM.md
 */

const THEMES = [
  'dark', 'light', 'pastel', 'plajah', 'big-screen', 'phone', 'ethereal', 'nebula', 'citrus',
] as const;
type Theme = typeof THEMES[number];

const VARIANTS: ButtonVariant[] = [
  'primary', 'accent', 'secondary', 'outline', 'ghost', 'danger', 'danger-quiet', 'success',
];
const SIZES: ButtonSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

const BRAND_TOKENS = [
  ['--pj-purple', 'Primary brand'],
  ['--pj-magenta', 'Brand accent'],
  ['--pj-orange', 'Signal / action'],
  ['--pj-cyan', 'Spatial / live'],
  ['--pj-lilac', 'Ethereal'],
] as const;

const STATE_TOKENS = [
  ['--pj-success', 'Success'],
  ['--pj-warning', 'Warning'],
  ['--pj-danger', 'Danger'],
  ['--pj-info', 'Info'],
] as const;

const GRADIENTS = [
  ['--pj-grad-brand', 'brand', 'Primary CTA, featured borders'],
  ['--pj-grad-warm', 'warm', 'Hero / marketing'],
  ['--pj-grad-ember', 'ember', 'Energy, live, sport'],
  ['--pj-grad-spatial', 'spatial', 'Spatial audio, realtime'],
  ['--pj-grad-ethereal', 'ethereal', 'Calm surfaces'],
] as const;

const RADII = [
  ['--pj-radius-xs', 'xs · 8', 'Tags, code'],
  ['--pj-radius-sm', 'sm · 12', 'Chips, small inputs'],
  ['--pj-radius-md', 'md · 16', 'Square controls, inputs'],
  ['--pj-radius-lg', 'lg · 24', 'Cards'],
  ['--pj-radius-xl', 'xl · 28', 'Sheets, modals'],
  ['--pj-radius-2xl', '2xl · 36', 'Hero panels'],
  ['--pj-radius-full', 'full', 'Controls, avatars'],
] as const;

/** Section wrapper — keeps the gallery's own chrome out of the components on show. */
const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section style={{ marginBottom: 'var(--pj-space-16)' }}>
    <header style={{ marginBottom: 'var(--pj-space-6)' }}>
      <h2 className="type-headline-md" style={{ margin: 0, color: 'var(--text-primary)' }}>{title}</h2>
      {note && <p className="type-body-sm" style={{ margin: '6px 0 0', color: 'var(--on-surface-variant)', maxWidth: '68ch' }}>{note}</p>}
    </header>
    {children}
  </section>
);

const Row: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 120px) 1fr', gap: 'var(--pj-space-5)', alignItems: 'center', padding: 'var(--pj-space-4) 0', borderTop: '1px solid var(--m3-border)' }}>
    <span className="type-label-md" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-3)', alignItems: 'center' }}>{children}</div>
  </div>
);

export const DesignSystemGallery: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [loading, setLoading] = useState(false);
  const [selectedChip, setSelectedChip] = useState('Stillness');

  // Themes are body classes. Swap ours in without disturbing any other body class
  // the app may have set (platform-android, capacitor-*, etc.).
  useEffect(() => {
    const prev = Array.from(document.body.classList).filter((c) => c.startsWith('theme-'));
    prev.forEach((c) => document.body.classList.remove(c));
    document.body.classList.add(`theme-${theme}`);
    return () => {
      document.body.classList.remove(`theme-${theme}`);
      prev.forEach((c) => document.body.classList.add(c));
    };
  }, [theme]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-color)',
        color: 'var(--text-primary)',
        overflowY: 'auto',
        padding: '0 0 var(--pj-space-20)',
      }}
    >
      {/* theme switcher — sticky, because a control that only breaks in Citrus is
          the exact bug this page exists to find */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'color-mix(in srgb, var(--bg-color) 88%, transparent)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid var(--m3-border)',
          padding: 'var(--pj-space-4) var(--pj-space-6)',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', gap: 'var(--pj-space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Eyebrow style={{ marginRight: 'auto' }}>Plajah design system</Eyebrow>
          {THEMES.map((t) => (
            <Chip key={t} interactive selected={theme === t} onClick={() => setTheme(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </div>

      {/* key={theme} remounts the whole gallery on a theme switch. Chrome keeps stale
          computed styles on already-painted nodes when a custom property changes on an
          ancestor — a freshly created element resolves the new value correctly while the
          old one does not. Remounting makes what you see here match a real page load,
          which is the only reading of this page worth trusting. */}
      <div key={theme} style={{ maxWidth: 1080, margin: '0 auto', padding: 'var(--pj-space-12) var(--pj-space-6) 0' }}>
        <h1 className="type-display-sm" style={{ margin: '0 0 var(--pj-space-3)' }}>Controls, surfaces & tokens</h1>
        <p className="type-body-lg" style={{ color: 'var(--on-surface-variant)', maxWidth: '68ch', marginTop: 0, marginBottom: 'var(--pj-space-12)' }}>
          Every primitive in <code>components/ui</code>, in all nine themes. If a control looks wrong
          here, it is wrong everywhere. Spec in <code>docs/PLAJAH_DESIGN_SYSTEM.md</code>.
        </p>

        {/* ── buttons: variants × sizes ─────────────────────────────────── */}
        <Section
          title="Button — variants"
          note="Weight, not decoration. Exactly one primary per view; if a screen has three gradient buttons, two of them are lying about their importance."
        >
          {VARIANTS.map((v) => (
            <Row key={v} label={v}>
              <Button variant={v}>Label</Button>
              <Button variant={v} icon={<Play />}>With icon</Button>
              <Button variant={v} iconRight={<ChevronRight />}>Trailing</Button>
              <IconButton variant={v} aria-label={`${v} icon only`}><Heart /></IconButton>
              <Button variant={v} disabled>Disabled</Button>
            </Row>
          ))}
        </Section>

        <Section
          title="Button — sizes"
          note="Height is fixed per size, so buttons on a row align whether they hold an icon, a label, or both. xs and sm sit below the 44px comfortable hit area, so Button adds .tap to them automatically — visual size unchanged, touch target restored."
        >
          {SIZES.map((s) => (
            <Row key={s} label={s}>
              <Button size={s} variant="primary" icon={<Play />}>Play</Button>
              <Button size={s} variant="secondary">Secondary</Button>
              <Button size={s} variant="ghost" icon={<Share2 />}>Share</Button>
              <IconButton size={s} variant="secondary" aria-label="Add"><Plus /></IconButton>
              <IconButton size={s} variant="secondary" square aria-label="Settings"><Settings /></IconButton>
            </Row>
          ))}
        </Section>

        <Section
          title="Button — states"
          note="Loading preserves width, so a row never reflows mid-save. Try tabbing: one focus ring serves keyboard, screen readers and TV D-pad alike."
        >
          <Row label="loading">
            <Button variant="primary" loading>Saving</Button>
            <Button variant="secondary" loading>Uploading</Button>
            <IconButton variant="ghost" loading aria-label="Working"><Download /></IconButton>
            <Button
              variant="accent"
              loading={loading}
              icon={<Radio />}
              onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 1800); }}
            >
              {loading ? 'Going live' : 'Go live'}
            </Button>
          </Row>
          <Row label="full width">
            <div style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 'var(--pj-space-3)' }}>
              <Button variant="primary" size="lg" fullWidth icon={<Mic />}>Start recording</Button>
              <Button variant="outline" fullWidth>Cancel</Button>
            </div>
          </Row>
          <Row label="as link">
            <Button as="a" href="#buttons" variant="outline" iconRight={<ChevronRight />}>Anchor styled as button</Button>
          </Row>
        </Section>

        {/* ── surfaces ──────────────────────────────────────────────────── */}
        <Section
          title="Surface — elevation"
          note="On a translucent platform, elevation is shadow depth and glass opacity moving together. level moves both, so a card is never opaque-but-flat or shadowed-but-transparent."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--pj-space-4)' }}>
            {([1, 2, 3, 4, 5] as const).map((lvl) => (
              <Surface key={lvl} level={lvl}>
                <Eyebrow>Level {lvl}</Eyebrow>
                <p className="type-title-md" style={{ margin: '8px 0 4px' }}>
                  {['Resting card', 'Raised / hover', 'Floating panel', 'Drawer, player', 'Modal'][lvl - 1]}
                </p>
                <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
                  glass-{lvl} + elev-{lvl}
                </p>
              </Surface>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--pj-space-4)', marginTop: 'var(--pj-space-4)' }}>
            <Surface level={2} shape="sheet"><Eyebrow>shape=sheet</Eyebrow><p className="type-body-sm" style={{ color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>28px — modals, drawers</p></Surface>
            <Surface level={2} shape="hero"><Eyebrow>shape=hero</Eyebrow><p className="type-body-sm" style={{ color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>36px — full-bleed features</p></Surface>
            <Surface level={2} brand><Eyebrow>brand border</Eyebrow><p className="type-body-sm" style={{ color: 'var(--on-surface-variant)', margin: '8px 0 0' }}>One featured card per view</p></Surface>
          </div>
        </Section>

        {/* ── forms ─────────────────────────────────────────────────────── */}
        <Section
          title="Inputs & chips"
          note="Inputs take their height from the same control tokens as Button, so an input and the button beside it are exactly the same height — the most common alignment bug in the codebase today."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--pj-space-6)', alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
              <Input label="Display name" placeholder="Kenne" hint="Shown on your profile and releases." />
              <Input label="Release date" type="date" required />
              <Input label="Handle" defaultValue="not a handle" error="Handles can only contain letters, numbers and underscores." />
              <Textarea label="Notes" placeholder="What happened today…" hint="Private by default." />
            </div>
            <div style={{ display: 'grid', gap: 'var(--pj-space-5)' }}>
              <div>
                <Eyebrow>Input + button alignment</Eyebrow>
                <div className="pj-row" style={{ marginTop: 'var(--pj-space-3)' }}>
                  <input className="pj-input" placeholder="Search the library" aria-label="Search" />
                  <Button variant="accent" icon={<Search />}>Search</Button>
                </div>
              </div>
              <div>
                <Eyebrow>Chips</Eyebrow>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--pj-space-2)', marginTop: 'var(--pj-space-3)' }}>
                  {['Stillness', 'Goals', 'Journal', 'Focus', 'Rest'].map((c) => (
                    <Chip key={c} interactive selected={selectedChip === c} onClick={() => setSelectedChip(c)}>{c}</Chip>
                  ))}
                  <Chip brand><Star size={12} /> Featured</Chip>
                </div>
              </div>
              <div>
                <Eyebrow>Action row</Eyebrow>
                <Surface level={2} shape="sheet" style={{ marginTop: 'var(--pj-space-3)' }}>
                  <p className="type-title-md" style={{ margin: '0 0 6px' }}>Delete this draft?</p>
                  <p className="type-body-sm" style={{ margin: '0 0 var(--pj-space-5)', color: 'var(--on-surface-variant)' }}>
                    This cannot be undone.
                  </p>
                  {/* Primary goes LAST in DOM order; .pj-actions reverses and stretches it below 480px */}
                  <Actions>
                    <Button variant="ghost">Keep</Button>
                    <Button variant="danger" icon={<Trash2 />}>Delete draft</Button>
                  </Actions>
                </Surface>
              </div>
            </div>
          </div>
        </Section>

        {/* ── tokens ────────────────────────────────────────────────────── */}
        <Section title="Colour" note="Brand is theme-invariant — surfaces re-theme, the brand does not. Semantic colours mean status and nothing else.">
          <Eyebrow>Brand</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--pj-space-3)', margin: 'var(--pj-space-3) 0 var(--pj-space-8)' }}>
            {BRAND_TOKENS.map(([token, label]) => (
              <div key={token}>
                <div style={{ height: 64, borderRadius: 'var(--pj-radius-md)', background: `var(${token})`, border: '1px solid var(--m3-border)' }} />
                <p className="type-label-md" style={{ margin: '8px 0 0' }}>{label}</p>
                <code className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{token}</code>
              </div>
            ))}
          </div>
          <Eyebrow>Semantic</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--pj-space-3)', marginTop: 'var(--pj-space-3)' }}>
            {STATE_TOKENS.map(([token, label]) => (
              <div key={token}>
                <div style={{ height: 44, borderRadius: 'var(--pj-radius-md)', background: `var(${token})` }} />
                <p className="type-label-md" style={{ margin: '8px 0 0' }}>{label}</p>
                <code className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{token}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Gradients" note="Five, and only five. The purple→magenta ramp inlined across dozens of components is --pj-grad-brand.">
          <div style={{ display: 'grid', gap: 'var(--pj-space-3)' }}>
            {GRADIENTS.map(([token, name, use]) => (
              <div key={token} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: 'var(--pj-space-4)', alignItems: 'center' }}>
                <div style={{ height: 52, borderRadius: 'var(--pj-radius-md)', backgroundImage: `var(${token})` }} />
                <div>
                  <p className="type-label-lg" style={{ margin: 0 }}>{name}</p>
                  <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{use} · <code>{token}</code></p>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 'var(--pj-space-4)' }}>
              <span className="pj-text-brand type-headline-md">Gradient text via .pj-text-brand</span>
            </div>
          </div>
        </Section>

        <Section title="Shape" note="Twenty radii in the codebase collapse to seven. The larger the surface, the larger the radius.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--pj-space-3)' }}>
            {RADII.map(([token, label, use]) => (
              <div key={token}>
                <div style={{ height: 78, borderRadius: `var(${token})`, background: 'var(--glass-3)', border: '1px solid var(--m3-border)' }} />
                <p className="type-label-md" style={{ margin: '8px 0 0' }}>{label}</p>
                <p className="type-body-sm" style={{ margin: 0, color: 'var(--on-surface-variant)' }}>{use}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" note="Fluid via clamp(), so headings scale down on phones automatically. Use TYPE.* or the .type-* classes — never a raw text-[2rem].">
          <div style={{ display: 'grid', gap: 'var(--pj-space-3)' }}>
            {[
              ['type-display-lg', 'Display large'],
              ['type-display-sm', 'Display small'],
              ['type-headline-md', 'Headline medium'],
              ['type-title-lg', 'Title large'],
              ['type-body-lg', 'Body large — the quick brown fox jumps over the lazy dog.'],
              ['type-body-md', 'Body medium — the quick brown fox jumps over the lazy dog.'],
              ['type-label-lg', 'Label large'],
              ['type-label-sm', 'Label small'],
            ].map(([cls, sample]) => (
              <div key={cls} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 180px) 1fr', gap: 'var(--pj-space-4)', alignItems: 'baseline', paddingTop: 'var(--pj-space-3)', borderTop: '1px solid var(--m3-border)' }}>
                <code className="type-body-sm" style={{ color: 'var(--on-surface-variant)' }}>.{cls}</code>
                <span className={cls}>{sample}</span>
              </div>
            ))}
            <div style={{ paddingTop: 'var(--pj-space-4)', borderTop: '1px solid var(--m3-border)' }}>
              <Eyebrow>Eyebrow — .pj-eyebrow</Eyebrow>
            </div>
          </div>
        </Section>

        <footer style={{ borderTop: '1px solid var(--m3-border)', paddingTop: 'var(--pj-space-6)', color: 'var(--on-surface-variant)' }}>
          <p className="type-body-sm" style={{ margin: 0 }}>
            Tokens: <code>styles/plajah-ds.css</code> · Primitives: <code>components/ui/</code> ·
            Layout &amp; motion: <code>src/lib/designSystem.tsx</code> · Spec: <code>docs/PLAJAH_DESIGN_SYSTEM.md</code>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default DesignSystemGallery;
