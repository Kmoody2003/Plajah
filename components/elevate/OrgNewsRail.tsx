// OrgNewsRail — the side rail on Elevate pages (and for Elevate-scoped people): the org's own billboard.
// Cycles through what the org just published — public videos and releases, articles, shop items — newest
// first. Nothing published yet → a friendly note that this space fills with the org's news first.
// `adsBelow`: the caller shows the regular ad rotation under the rail (account 30+ days old).
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Sparkles } from 'lucide-react';
import type { Article, Organization, StoreProduct, Video } from '../../types';
import { db } from '../../services/firebase';
import { fetchOrgVideos, fetchOrgReleases, orgMediaUids, type OrgRelease } from '../../services/orgMedia';
import { subscribeCatalog } from '../../services/commerceBus';
import { orgStoreOwnerUid } from './OrgStoreSection';
import { EV, EV_FONT } from './vellum';

export type OrgNewsItem =
  | { kind: 'video'; key: string; ts: number; title: string; image?: string; raw: Video }
  | { kind: 'release'; key: string; ts: number; title: string; label: string; image?: string; raw: OrgRelease }
  | { kind: 'article'; key: string; ts: number; title: string; image?: string; raw: Article }
  | { kind: 'product'; key: string; ts: number; title: string; image?: string; price: number; raw: StoreProduct };

const toMs = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};

async function orgArticles(org: Organization): Promise<Article[]> {
  const uids = orgMediaUids(org).slice(0, 4);
  const lists = await Promise.all(uids.map(uid =>
    getDocs(query(collection(db, 'articles'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(4)))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as Article)))
      .catch(() => [] as Article[])));
  return lists.flat().filter(a => a.isPublic !== false && !(a as { isDraft?: boolean }).isDraft);
}

/** The org's latest public things, newest first (max 9). */
export function useOrgNews(org: Organization | null | undefined): { items: OrgNewsItem[]; loading: boolean } {
  const [media, setMedia] = useState<OrgNewsItem[] | null>(null);
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const orgId = org?.id;

  useEffect(() => {
    if (!org) { setMedia([]); return; }
    let alive = true;
    setMedia(null);
    Promise.all([
      fetchOrgVideos(org, 4).catch(() => [] as Video[]),
      fetchOrgReleases(org, 4).catch(() => [] as OrgRelease[]),
      orgArticles(org).catch(() => [] as Article[]),
    ]).then(([videos, releases, articles]) => {
      if (!alive) return;
      setMedia([
        ...videos.map(v => ({ kind: 'video' as const, key: `v:${v.id}`, ts: toMs((v as { timestamp?: unknown }).timestamp), title: v.title || 'New video', image: v.thumbnailUrl || v.coverImageUrl, raw: v })),
        ...releases.map(r => ({ kind: 'release' as const, key: r.key, ts: r.ts, title: r.title, label: r.label, image: r.cover, raw: r })),
        ...articles.map(a => ({ kind: 'article' as const, key: `a:${a.id}`, ts: toMs(a.timestamp), title: a.title || 'New article', image: a.coverImage, raw: a })),
      ]);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    if (!org) { setProducts([]); return; }
    setProducts(null);
    return subscribeCatalog(orgStoreOwnerUid(org), setProducts, { onError: () => setProducts([]) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return useMemo(() => {
    const shop: OrgNewsItem[] = (products || [])
      .filter(p => p.isActive !== false)
      .slice(0, 3)
      .map(p => ({ kind: 'product' as const, key: `p:${p.id}`, ts: p.createdAt || 0, title: p.title, image: p.images?.[0], price: p.price, raw: p }));
    const items = [...(media || []), ...shop].sort((a, b) => b.ts - a.ts).slice(0, 9);
    return { items, loading: media === null || products === null };
  }, [media, products]);
}

const KICKER: Record<OrgNewsItem['kind'], { label: string; color: string }> = {
  video: { label: 'New video', color: EV.violetText },
  release: { label: 'New release', color: EV.violetText },
  article: { label: 'New article', color: EV.gold },
  product: { label: 'New in the shop', color: EV.success },
};

const ROTATE_MS = 8000;
const PAGE = 3;

export const OrgNewsRail: React.FC<{
  org: Organization;
  /** Admins see a nudge to fill the rail. */
  canManage?: boolean;
  onOpen: (item: OrgNewsItem) => void;
  /** The regular ad rotation sits under the rail (the account is old enough). */
  adsBelow?: boolean;
}> = ({ org, canManage, onOpen, adsBelow }) => {
  const { items, loading } = useOrgNews(org);
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setPage(0); }, [org.id, items.length]);
  useEffect(() => {
    if (pages <= 1 || paused) return;
    const t = window.setInterval(() => setPage(p => (p + 1) % pages), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [pages, paused]);
  const shown = items.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-y-auto custom-scrollbar" style={{ fontFamily: EV_FONT.ui }} data-testid="org-news-rail"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: EV.muted }}>From {org.name}</p>
        {pages > 1 && (
          <div className="flex items-center gap-1 shrink-0" role="tablist" aria-label="Rail pages">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} role="tab" aria-selected={i === page} aria-label={`Page ${i + 1}`} onClick={() => setPage(i)}
                className="h-1 rounded-full transition-all" style={{ width: i === page ? 14 : 4, background: i === page ? EV.violetText : 'rgba(255,255,255,0.25)' }} />
            ))}
          </div>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: EV.panel }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl px-4 py-6 text-center flex flex-col items-center gap-2.5 border border-dashed" style={{ background: 'rgba(122,31,192,0.08)', borderColor: 'rgba(208,188,255,0.25)' }}>
          <Sparkles size={26} style={{ color: EV.violetText }} />
          <p className="m-0 text-[15px] font-bold leading-snug" style={{ color: EV.ink, fontFamily: EV_FONT.display }}>{org.name} news lives here</p>
          <p className="m-0 text-[13px] leading-relaxed" style={{ color: EV.ink2 }}>
            As {org.name} posts videos, articles and shop items, they’ll show up here first, so you never miss what’s happening at home.
          </p>
          {canManage && <p className="m-0 text-[12px] leading-relaxed" style={{ color: EV.muted }}>Post a video or add a shop item to fill this space.</p>}
        </div>
      ) : (
        <div key={page} className="flex flex-col gap-3 ev-fade">
          {shown.map(it => {
            const k = KICKER[it.kind];
            const wide = it.kind === 'video' || it.kind === 'release';
            return (
              <button key={it.key} onClick={() => onOpen(it)} className="text-left rounded-2xl overflow-hidden border transition-colors hover:border-white/25"
                style={{ background: EV.panel, borderColor: EV.line }}>
                {wide && <div className="aspect-video bg-black/40">{it.image && <img src={it.image} alt="" className="w-full h-full object-cover" loading="lazy" />}</div>}
                <div className={`flex gap-3 ${wide ? 'p-3' : 'p-3 items-center'}`}>
                  {!wide && it.image && <img src={it.image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" loading="lazy" />}
                  <div className="min-w-0">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: k.color }}>{it.kind === 'release' ? `New ${it.label.toLowerCase()}` : k.label}</p>
                    <p className="m-0 mt-1 text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: EV.ink }}>{it.title}</p>
                    {it.kind === 'product' && Number.isFinite(it.price) && <p className="m-0 mt-0.5 text-[12px]" style={{ color: EV.muted }}>${it.price.toFixed(2)}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {adsBelow ? (
        <p className="m-0 mt-auto pt-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: EV.muted }}>Sponsored ↓</p>
      ) : (
        <p className="m-0 mt-auto pt-2 text-[11px] leading-relaxed" style={{ color: EV.muted }}>Only {org.name} here for your first month on Plajah.</p>
      )}
    </div>
  );
};

export default OrgNewsRail;
