import type React from 'react';
import {
  User, KeyRound, Lock, Bell, Palette, Tv, CreditCard, Package, Wrench,
  Mail, Share2, Baby, Link2, Image as ImageIcon, Activity, Fingerprint, Globe, Notebook, Send,
  LayoutTemplate, LayoutGrid, DollarSign, Radio, Film, FileText, BarChart2, Music2, Rss,
  BookOpen, CalendarClock, Users, CheckSquare, ShoppingBag, Building2, Video, Database, ShieldCheck, Sparkles,
} from 'lucide-react';

// One list of every settings page, grouped by what a person is trying to do. The desktop sidebar and
// the phone drill-down both read this, so a new page is added once and shows up in both (and in search).

type Icon = React.ComponentType<{ size?: number; className?: string }>;

export interface SettingsPage {
  id: string;                  // UserDashboard activeTab id, or a navigate target when `navigate` is set
  label: string;
  desc: string;
  icon: Icon;
  cap?: string;                // capability required to see the page
  navigate?: string;           // opens another app view (NAVIGATE event) instead of an in-dashboard tab
  keywords?: string;           // extra search terms
}

export interface SettingsGroup {
  id: string;
  title: string;
  desc: string;
  icon: Icon;
  tint: string;
  pages: SettingsPage[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: 'profile', title: 'Profile', desc: 'How you appear to other people.', icon: User, tint: '#ff8c00', pages: [
    { id: 'PROFILE', label: 'Name, photo & links', desc: 'Display name, bio, social handles, relationship status and the first tab visitors see.', icon: User, keywords: 'bio handle twitter x mastodon bluesky threads relationship landing page artist' },
  ] },
  { id: 'account', title: 'Account & Security', desc: 'Account type, emails and connected accounts.', icon: KeyRound, tint: '#a78bfa', pages: [
    { id: 'ACCOUNT', label: 'Account type', desc: 'Fan, Artist, Brand, Teacher and more. Choose what your account unlocks.', icon: Sparkles, keywords: 'business page role capability delete' },
    { id: 'ALIASES', label: 'Emails & aliases', desc: 'The addresses tied to your account.', icon: Mail, keywords: 'email address' },
    { id: 'CONNECTED_SERVICES', label: 'Connected services', desc: 'Accounts and keys you have linked to Plajah.', icon: Link2, keywords: 'api key stripe google youtube' },
    { id: 'NETWORKS', label: 'Social networks', desc: 'Post to and read from other networks.', icon: Share2, keywords: 'fediverse mastodon bluesky facebook instagram' },
    { id: 'FAMILY', label: 'Family', desc: 'Manage child and guardian accounts.', icon: Baby, keywords: 'child parent guardian kids' },
  ] },
  { id: 'privacy', title: 'Privacy & Safety', desc: 'Who sees what, and what you see.', icon: Lock, tint: '#34d399', pages: [
    { id: 'SAFETY', label: 'Privacy & content safety', desc: 'Private account, post audiences, blocked and muted accounts, filters and faith content.', icon: ShieldCheck, keywords: 'private block mute audience filter follow requests hymns prayers' },
  ] },
  { id: 'notifications', title: 'Notifications', desc: 'When and how Plajah gets your attention.', icon: Bell, tint: '#f472b6', pages: [
    { id: 'NOTIFICATIONS', label: 'Notifications', desc: 'Push and email alerts, by category.', icon: Bell, keywords: 'push email alerts' },
  ] },
  { id: 'appearance', title: 'Appearance', desc: 'Themes, backgrounds and layout.', icon: Palette, tint: '#38bdf8', pages: [
    { id: 'APPEARANCE', label: 'Theme & background', desc: 'Interface theme, custom background, slideshow and help tooltips.', icon: Palette, keywords: 'dark light pastel background video tooltip' },
    { id: 'THEMES', label: 'Theme presets', desc: 'Saved looks with photos and videos.', icon: LayoutTemplate },
    { id: 'SIDEBAR', label: 'Sidebar layout', desc: 'Choose which pages appear in your sidebar.', icon: LayoutGrid, keywords: 'menu navigation' },
  ] },
  { id: 'media', title: 'Media & Devices', desc: 'Photos, audio and connection health.', icon: Tv, tint: '#fb923c', pages: [
    { id: 'PHOTOS', label: 'Photo gallery', desc: 'Your albums and uploads.', icon: ImageIcon },
    { id: 'AUDIO_HEALTH', label: 'Audio health', desc: 'Checks your uploads for clipping and gaps.', icon: Activity, cap: 'CREATE_MUSIC' },
    { id: 'NETWORK_DIAGNOSTICS', label: 'Network health', desc: 'Test your connection to Plajah.', icon: Activity, keywords: 'speed connection diagnostics' },
  ] },
  { id: 'money', title: 'Money', desc: 'Payments, payouts and revenue.', icon: CreditCard, tint: '#34d399', pages: [
    { id: 'REVENUE', label: 'Revenue & payouts', desc: 'Sales, tips, subscriptions and payout setup.', icon: DollarSign, cap: 'MONETIZE', keywords: 'stripe payout earnings' },
  ] },
  { id: 'stuff', title: 'My Stuff', desc: 'Everything you have made or collected.', icon: Package, tint: '#fbbf24', pages: [
    { id: 'ASSETS', label: 'My assets', desc: 'Uploads, albums and files.', icon: Database },
    { id: 'WORLDS', label: 'My worlds', desc: 'Stories and universes you created.', icon: Globe },
    { id: 'INTERESTS', label: 'Interest notebook', desc: 'Tune your discovery feed.', icon: Notebook },
    { id: 'RIGHTS_REGISTRY', label: 'Rights & identifiers', desc: 'ISRC, ISWC and copyright records.', icon: Fingerprint, keywords: 'isrc iswc copyright' },
    { id: 'MAILING_LIST', label: 'Mailing list', desc: 'Connect directly with your audience.', icon: Send, keywords: 'newsletter newsstand subscribers' },
  ] },
  { id: 'tools', title: 'Creator Tools', desc: 'Workspaces for what you make. Shown when your account type includes them.', icon: Wrench, tint: '#ef4444', pages: [
    { id: 'BROADCAST', label: 'Master Control', desc: 'Go live and manage your channel.', icon: Tv, cap: 'LIVE_STREAM', keywords: 'live stream broadcast' },
    { id: 'RADIO_MANAGER', label: 'Artist radio station', desc: 'Station settings, stingers and ads.', icon: Radio, cap: 'RUN_RADIO' },
    { id: 'FILM_STUDIO', label: 'Film distribution', desc: 'Release and distribute films.', icon: Film, cap: 'CREATE_VIDEO' },
    { id: 'FILM_RIGHTS', label: 'Film rights & docs', desc: 'Contracts and clearances.', icon: FileText, cap: 'CREATE_VIDEO' },
    { id: 'FILM_ANALYTICS', label: 'Film analytics', desc: 'Views and audience.', icon: BarChart2, cap: 'CREATE_VIDEO' },
    { id: 'VIDEO_MANAGER', label: 'Video manager', desc: 'All your videos in one place.', icon: Video, cap: 'CREATE_VIDEO', navigate: 'VIDEO_MANAGER' },
    { id: 'MUSIC_STUDIO', label: 'Music hub', desc: 'Releases and albums.', icon: Music2, cap: 'CREATE_MUSIC' },
    { id: 'ARTIST_RADIO', label: 'Artist radio', desc: 'Your radio schedule.', icon: Radio, cap: 'CREATE_MUSIC' },
    { id: 'PODCAST_HUB', label: 'Podcast RSS', desc: 'Publish your show feed.', icon: Rss, cap: 'CREATE_MUSIC' },
    { id: 'BOOKS_STUDIO', label: 'Books hub', desc: 'Your books and drafts.', icon: BookOpen, cap: 'CREATE_BOOK' },
    { id: 'SERIAL_SCHEDULER', label: 'Serial scheduler', desc: 'Schedule chapter releases.', icon: CalendarClock, cap: 'CREATE_BOOK' },
    { id: 'BOOK_CLUBS', label: 'Book clubs', desc: 'Run reading groups.', icon: Users, cap: 'CREATE_BOOK' },
    { id: 'CLASSROOM_ANALYTICS', label: 'Classroom analytics', desc: 'How your classes are doing.', icon: BarChart2, cap: 'TEACH' },
    { id: 'CERTIFICATES', label: 'Certificates', desc: 'Issue course certificates.', icon: CheckSquare, cap: 'TEACH' },
    { id: 'STORE_MANAGEMENT', label: 'Store management', desc: 'Merchandise and digital sales.', icon: ShoppingBag, cap: 'SELL_MERCH', keywords: 'merch shop' },
    { id: 'ORG_HUB', label: 'Brands & orgs', desc: 'Pages for your brand, label or organization.', icon: Building2, cap: 'MONETIZE', navigate: 'ORG_HUB' },
  ] },
];

export const SETTINGS_PAGES: SettingsPage[] = SETTINGS_GROUPS.flatMap(g => g.pages);

export const SETTINGS_TAB_LABELS: Record<string, string> =
  SETTINGS_PAGES.reduce((acc, p) => { acc[p.id] = p.label; return acc; }, {} as Record<string, string>);

export const groupOfPage = (id: string): SettingsGroup | undefined =>
  SETTINGS_GROUPS.find(g => g.pages.some(p => p.id === id));

export const visiblePages = (g: SettingsGroup, can: (cap?: string) => boolean): SettingsPage[] =>
  g.pages.filter(p => can(p.cap));

/** Pages matching a search query (page label, description, keywords or group name). */
export const searchPages = (q: string, can: (cap?: string) => boolean): { group: SettingsGroup; page: SettingsPage }[] => {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const out: { group: SettingsGroup; page: SettingsPage }[] = [];
  SETTINGS_GROUPS.forEach(group => group.pages.forEach(page => {
    if (!can(page.cap)) return;
    const hay = `${page.label} ${page.desc} ${page.keywords || ''} ${group.title}`.toLowerCase();
    if (hay.includes(needle)) out.push({ group, page });
  }));
  return out;
};
