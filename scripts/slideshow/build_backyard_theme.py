"""Build the Back Yard themed-show asset pack.

Copies the curated plates / loops / backdrops from Kenne's asset folder into
public/slideshow/backyard/ and writes manifest.json describing every placeholder
window (the flat grey polaroid windows the user's photos are composited into).

  python scripts/slideshow/build_backyard_theme.py "D:/Plajah slide show assets/Back yard 1/Plajah SLide show creator assets"

Stills: one detection per plate.
Video loops: detection on every frame, tracked into stable window ids, gaps
interpolated, stored at 12 fps in a per-loop JSON (loaded on demand).

Shots that carry stand-in photos and the design sheets are design direction only and
are never shipped (see ROLES).
"""
import json, os, shutil, sys, glob
import numpy as np
import cv2

SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:\Plajah slide show assets\Back yard 1\Plajah SLide show creator assets"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'slideshow', 'backyard')

# key (filename prefix) -> (id, role, extra)
ROLES = [
    # photo plates (stills) — grey windows get the user's photos
    ('Polaroid_frame_hanging_on_string_bbe08467', 'plate-1a', 'plate', {}),
    ('Polaroid_frame_hanging_on_twine_ad19d888', 'plate-1b', 'plate', {}),
    ('Polaroid_frames_hanging_in_backyard_6016871c', 'plate-2a', 'plate', {}),
    ('Polaroid_frames_hanging_in_backyard_6ac3004d', 'plate-2b', 'plate', {}),
    ('Polaroid_frames_hanging_on_twine_280fe7d4', 'plate-3a', 'plate', {}),
    ('Polaroid_frames_hanging_on_twine_8a32ab5a', 'plate-3b', 'plate', {}),
    ('Polaroid_frames_hanging_on_line_6ec6d79b', 'plate-5a', 'plate', {}),
    ('Polaroid_frames_hanging_on_line_bb6f7033', 'plate-5b', 'plate', {}),
    ('Hanging_polaroid_rows_in_yard_98490cbc', 'rows-a', 'plate', {}),
    ('Hanging_polaroids_on_jute_lines_b1f724ef', 'rows-b', 'plate', {}),
    ('Polaroids_hanging_on_twine_lines_da1d53b9', 'rows-c', 'plate', {}),
    ('Polaroids_hanging_on_backyard_twine_ed79d2d3', 'rows-d', 'plate', {}),
    ('Polaroids_hanging_in_backyard_c7b2409d', 'rows-e', 'plate', {}),
    ('Polaroid_frames_hanging_on_twine_e9a8f4a9', 'wall-a', 'plate', {}),
    # Polaroid_frames_on_wooden_table_e9ea62a6 is left out: too many overlapped prints resolve only partly,
    # which would leave grey placeholders on screen.
    # Both table spreads are left out: prints buried under other prints can't be filled
    # reliably, and an exposed grey template is never acceptable.
    # ('Polaroid_frames_stacked_on_table_32b3766a', 'table-b', 'plate', {'table': True}),
    # photo loops (video) — swaying polaroids with grey windows
    ('Polaroid_frames_swaying_in_breeze_319b72a5', 'sway-a', 'plateLoop', {}),
    ('Polaroid_frames_swaying_in_breeze_51e8350f', 'sway-b', 'plateLoop', {}),
    ('Polaroid_frames_swaying_in_breeze_82f8f985', 'sway-c', 'plateLoop', {}),
    ('Polaroid_frames_swaying_in_breeze_adc0b90e', 'sway-d', 'plateLoop', {}),
    # openings (no stand-in photos)
    ('High_crane_opening_over_yard_d123c088', 'open-crane', 'opening', {}),
    ('Drone_descending_into_suburban', 'open-drone', 'opening', {}),
    ('High-angle_view_of_suburban_yard_8650571f', 'open-high', 'opening', {}),
    # soft plates (bokeh stills)
    ('Backyard_lanterns_at_golden_hour_65867c62', 'soft-a', 'soft', {}),
    ('Backyard_paper_lanterns_bokeh_0bc6a72b', 'soft-b', 'soft', {}),
    ('Backyard_string_lights_and_lanterns_55a67923', 'soft-c', 'soft', {}),
    ('Backyard_string_lights_and_lanterns_d8b3ad4e', 'soft-d', 'soft', {}),
    ('Paper_lanterns_in_suburban_backyard_645e6615', 'soft-e', 'soft', {}),
    ('Suburban_backyard_at_golden_hour_e05f8f69', 'soft-f', 'soft', {}),
    # closing
    ('Sky_lanterns_rising_at_sunset_34bf4351', 'close-sky-a', 'closing', {}),
    ('Sky_lanterns_rising_in_yard_491290cb', 'close-sky-b', 'closing', {}),
    # bokeh loops (video backdrops for full page + cards)
    ('Bokeh_lights_swaying_in_breeze_051570cb', 'bokeh-a', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_35bf5177', 'bokeh-b', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_42d08439', 'bokeh-c', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_9be14b6a', 'bokeh-d', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_a32ce2f5', 'bokeh-e', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_a39b38df', 'bokeh-f', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_a48915cb', 'bokeh-g', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_b78cd120', 'bokeh-h', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_f6074b3e', 'bokeh-i', 'bokeh', {}),
    ('Bokeh_lights_swaying_in_breeze_ff5e9bd1', 'bokeh-j', 'bokeh', {}),
    ('Golden_bokeh_lights_swaying_c3acec1b', 'bokeh-k', 'bokeh', {}),
    ('Golden_bokeh_lights_swaying_f17eab75', 'bokeh-l', 'bokeh', {}),
]


def read(p):
    return cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)


def grey_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s = hsv[..., 1].astype(np.float32); v = hsv[..., 2].astype(np.float32)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    mu = cv2.blur(g, (7, 7)); sd = np.sqrt(np.maximum(cv2.blur(g * g, (7, 7)) - mu * mu, 0))
    m = ((s < 38) & (v > 70) & (v < 215) & (sd < 9)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return m, g


def order_quad(q):
    """TL, TR, BR, BL."""
    q = np.asarray(q, np.float32)
    c = q.mean(0)
    ang = np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0])
    q = q[np.argsort(ang)]  # starts roughly at TL going clockwise in image coords (-pi..pi)
    # rotate so the first is the one with the smallest x+y
    k = int(np.argmin(q.sum(1)))
    return np.roll(q, -k, 0)


def detect(img, allow_partial=True, min_frac=0.0006):
    H, W = img.shape[:2]
    m, g = grey_mask(img)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in cs:
        a = cv2.contourArea(c)
        if a < W * H * min_frac:
            continue
        hull = cv2.convexHull(c)
        peri = cv2.arcLength(hull, True)
        q = None
        for eps in (0.02, 0.03, 0.045, 0.06, 0.08):
            ap = cv2.approxPolyDP(hull, eps * peri, True)
            if len(ap) == 4:
                q = ap.reshape(4, 2).astype(np.float32)
                break
        kind = 'quad'
        if q is not None:
            qa = cv2.contourArea(q)
            if qa <= 0 or a / qa < 0.82:
                q = None
        if q is None:
            if not allow_partial:
                continue
            # occluded window (stacks): best rotated rectangle — the per-pixel mask hides the overlap
            rect = cv2.minAreaRect(c)
            (rw, rh) = rect[1]
            if min(rw, rh) <= 0 or a / (rw * rh) < 0.55:
                continue
            q = cv2.boxPoints(rect).astype(np.float32)
            kind = 'partial'
        x, y, w, h = cv2.boundingRect(q.astype(np.int32))
        edge = x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1
        # prints cut by the frame are kept (narrow is fine) and extended past the border later
        lo, hi = (0.08, 6.0) if edge else (0.45, 2.1)
        if w / max(h, 1) < lo or w / max(h, 1) > hi:
            continue
        q = order_quad(q)
        inside = np.zeros((H, W), np.uint8)
        cv2.fillConvexPoly(inside, q.astype(np.int32), 1)
        sel = (inside > 0) & (m > 0)
        lum = float(g[sel].mean() / 255) if sel.any() else 0.55
        out.append({'q': q, 'edge': bool(edge), 'kind': kind, 'lum': lum, 'h': h / H})
    # a small, much brighter "window" is a sliver of white paper border, not a print.
    # (Plates can have several lighting zones — shaded back rows, a sunlit front row — so the
    # grey itself varies across a plate; only tiny bright slivers are rejected.)
    areas = [cv2.contourArea(d['q']) for d in out]
    med_area = float(np.median(areas)) if areas else 0
    lums = sorted(d['lum'] for d in out)
    med_lum = lums[len(lums) // 2] if lums else 0.587
    def thin(q):
        r = cv2.minAreaRect(q.astype(np.float32))[1]
        return min(r) / max(1e-6, max(r)) < 0.35
    out[:] = [d for d, a in zip(out, areas) if not (a < 0.25 * med_area and d['lum'] > med_lum + 0.1 and thin(d['q']))]
    rescue_prints(out, m, g, W, H, min_frac)
    extend_edges(out, W, H)
    return out, m


def rescue_prints(dets, m, g, W, H, min_frac):
    """Grey left over after detection that is ringed by white paper is a print we missed
    (overlapped, bent, cut by another print). Add it as a partial window so it gets a photo.
    Grey sky, fences or stone have no bright paper ring and are left alone."""
    covered = np.zeros((H, W), np.uint8)
    for d in dets:
        cv2.fillConvexPoly(covered, d['q'].astype(np.int32), 1)
    covered = cv2.dilate(covered, np.ones((9, 9), np.uint8))
    rest = ((m > 0) & (covered == 0)).astype(np.uint8)
    rest = cv2.morphologyEx(rest, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(rest, 8)
    for k in range(1, n):
        a = stats[k, cv2.CC_STAT_AREA]
        if a < W * H * 0.00025:
            continue
        blob = (lab == k).astype(np.uint8)
        vals = g[blob > 0]
        inner = float(vals.mean())
        # exactly the template grey and flat → certainly an unfilled print; otherwise it must
        # at least be ringed by bright paper (grey sky / fence / stone are left alone)
        exact = float(vals.std()) < 6 and any(abs(inner / 255 - d['lum']) <= 0.035 for d in dets)
        if not exact:
            ring = cv2.dilate(blob, np.ones((15, 15), np.uint8)) - cv2.dilate(blob, np.ones((5, 5), np.uint8))
            rv = g[ring > 0]
            ringed = rv.size > 0 and float((rv > inner + 18).mean()) >= 0.55
            # or: it sits in a row of prints of the same grey (two prints whose grey merged)
            ys, xs = np.nonzero(blob)
            bc = np.array([xs.mean(), ys.mean()])
            def beside(d):
                dc = d['q'].mean(0)
                dh = float(np.ptp(d['q'][:, 1]))
                return (abs(inner / 255 - d['lum']) <= 0.05
                        and abs(dc[1] - bc[1]) <= 0.6 * dh                                   # level with the row
                        and abs(dc[0] - bc[0]) <= 2.6 * float(np.linalg.norm(d['q'][2] - d['q'][0]))
                        and a >= 0.25 * cv2.contourArea(d['q']))                              # print-sized, not a sliver
            in_row = any(beside(d) for d in dets)
            if not (ringed or in_row):
                continue
        cs, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cs, key=cv2.contourArea)
        rect = cv2.minAreaRect(c)
        rw, rh = rect[1]
        if min(rw, rh) <= 0:
            continue
        # template grey can be any shape (a print half under others): the grey mask decides
        # what shows, so only non-exact blobs must look like a print
        if not exact and (a / (rw * rh) < 0.5 or max(rw, rh) / min(rw, rh) > 3.0 or a < W * H * 0.00025):
            continue
        q = order_quad(cv2.boxPoints(rect).astype(np.float32))
        x, y, w, h = cv2.boundingRect(q.astype(np.int32))
        edge = x <= 1 or y <= 1 or x + w >= W - 1 or y + h >= H - 1
        dets.append({'q': q, 'edge': bool(edge), 'kind': 'partial', 'lum': inner / 255, 'h': h / H})


def extend_edges(dets, W, H):
    """Give windows cut by the frame their full shape, using the nearest whole windows' size,
    so the photo maps at its true aspect and simply runs off-screen like the print does."""
    whole = [d for d in dets if not d['edge'] and d['kind'] == 'quad']
    for d in dets:
        if not d['edge'] or not whole:
            continue
        q = d['q']
        cy = float(q[:, 1].mean()); cx = float(q[:, 0].mean())
        near = sorted(whole, key=lambda o: abs(float(o['q'][:, 1].mean()) - cy) + 0.25 * abs(float(o['q'][:, 0].mean()) - cx))[:3]
        tw = float(np.median([np.linalg.norm(o['q'][1] - o['q'][0]) for o in near]))
        th = float(np.median([np.linalg.norm(o['q'][3] - o['q'][0]) for o in near]))
        tl, tr, br, bl = q.copy()
        if min(tr[0], br[0]) >= W - 2:     # cut on the right: push right side out
            tr[0] = tl[0] + tw; br[0] = bl[0] + tw
        if max(tl[0], bl[0]) <= 1:         # cut on the left
            tl[0] = tr[0] - tw; bl[0] = br[0] - tw
        if min(bl[1], br[1]) >= H - 2:     # cut at the bottom
            bl[1] = tl[1] + th; br[1] = tr[1] + th
        if max(tl[1], tr[1]) <= 1:         # cut at the top
            tl[1] = bl[1] - th; tr[1] = br[1] - th
        d['q'] = np.array([tl, tr, br, bl], np.float32)
        d['h'] = th / H


def norm_quad(q, W, H):
    return [round(float(v), 5) for p in q for v in (p[0] / W, p[1] / H)]


def window_entries(dets, W, H):
    dets = sorted(dets, key=lambda d: (round(float(d['q'][:, 1].mean()) / (H * 0.12)), float(d['q'][:, 0].mean())))
    out = []
    for i, d in enumerate(dets):
        out.append({
            'id': i, 'quad': norm_quad(d['q'], W, H), 'lum': round(d['lum'], 4),
            'edge': d['edge'], 'partial': d['kind'] == 'partial', 'height': round(d['h'], 4),
            # big enough to lean into and lift to full page
            'feature': (not d['edge']) and d['kind'] == 'quad' and d['h'] >= 0.12,
        })
    return out


def coverage(m, dets):
    H, W = m.shape
    cov = np.zeros((H, W), np.uint8)
    for d in dets:
        cv2.fillConvexPoly(cov, d['q'].astype(np.int32), 1)
    grey = m > 0
    return float((grey & (cov > 0)).sum() / max(1, grey.sum()))


def track_loop(path, step_fps=12):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames = []
    for f in range(n):
        ok, img = cap.read()
        if not ok:
            break
        dets, _ = detect(img, allow_partial=True)
        frames.append(dets)
    cap.release()
    # track by nearest centroid, frame to frame
    tracks = []  # each: {'quads': {frame: q}, 'last': centroid, 'lum': [...], 'h': [...]}
    for f, dets in enumerate(frames):
        used = set()
        cents = [d['q'].mean(0) for d in dets]
        for tr in tracks:
            best, bd = None, 1e9
            for j, c in enumerate(cents):
                if j in used:
                    continue
                dd = float(np.linalg.norm(c - tr['last']))
                if dd < bd:
                    best, bd = j, dd
            lim = max(12.0, tr['size'] * 0.45)
            if best is not None and bd < lim and f - tr['seen'] <= 12:
                used.add(best)
                d = dets[best]
                tr['quads'][f] = d['q']; tr['last'] = cents[best]; tr['seen'] = f
                tr['lum'].append(d['lum']); tr['h'].append(d['h']); tr['edge'] |= d['edge']
        for j, d in enumerate(dets):
            if j in used:
                continue
            q = d['q']
            tracks.append({'quads': {f: q}, 'last': cents[j], 'seen': f, 'lum': [d['lum']], 'h': [d['h']], 'edge': d['edge'],
                           'size': float(np.linalg.norm(q[2] - q[0]))})
    # keep tracks present in at least 60% of frames
    # windows that only show part of the time (swinging in and out of frame, briefly hidden)
    # are kept too: outside the frames they're seen, their quad is held, and the grey mask
    # means a held quad over non-grey pixels draws nothing
    keep = [t for t in tracks if len(t['quads']) >= max(6, 0.1 * len(frames))]
    step = max(1, int(round(fps / step_fps)))
    samples = list(range(0, len(frames), step))
    wins = []
    for tid, t in enumerate(sorted(keep, key=lambda t: (round(float(t['last'][1]) / (H * 0.12)), float(t['last'][0])))):
        known = sorted(t['quads'].keys())
        seq = []
        for f in samples:
            if f in t['quads']:
                q = t['quads'][f]
            else:
                lo = max([k for k in known if k < f], default=None)
                hi = min([k for k in known if k > f], default=None)
                if lo is None: q = t['quads'][hi]
                elif hi is None: q = t['quads'][lo]
                else:
                    a = (f - lo) / (hi - lo)
                    q = t['quads'][lo] * (1 - a) + t['quads'][hi] * a
            seq.extend(norm_quad(q, W, H))
        wins.append({'id': tid, 'lum': round(float(np.median(t['lum'])), 4), 'edge': bool(t['edge']),
                     'height': round(float(np.median(t['h'])), 4), 'quads': seq})
    return {'fps': fps / step, 'frames': len(samples), 'duration': len(frames) / fps, 'width': W, 'height': H, 'windows': wins}


def main():
    os.makedirs(OUT, exist_ok=True)
    files = glob.glob(os.path.join(SRC, '*'))
    manifest = {'version': 1, 'theme': 'backyard', 'assets': []}
    for key, aid, role, extra in ROLES:
        src = next((f for f in files if os.path.basename(f).startswith(key)), None)
        if not src:
            print('missing', key); continue
        ext = os.path.splitext(src)[1].lower()
        dst = os.path.join(OUT, aid + ext)
        shutil.copyfile(src, dst)
        entry = {'id': aid, 'role': role, 'src': f'/slideshow/backyard/{aid}{ext}', **extra}
        if ext == '.jpg':
            img = read(src)
            H, W = img.shape[:2]
            entry.update({'kind': 'image', 'width': W, 'height': H})
            if role == 'plate':
                dets, m = detect(img, allow_partial=True)  # the setting the leftover-grey audit verifies
                entry['windows'] = window_entries(dets, W, H)
                entry['coverage'] = round(coverage(m, dets), 3)
                print(f"{aid:10s} {len(dets):3d} windows  feature {sum(w['feature'] for w in entry['windows']):2d}  coverage {entry['coverage']:.3f}")
        else:
            cap = cv2.VideoCapture(src)
            fps = cap.get(cv2.CAP_PROP_FPS) or 24; n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            entry.update({'kind': 'video', 'width': int(cap.get(3)), 'height': int(cap.get(4)), 'duration': round(n / fps, 3)})
            cap.release()
            if role == 'plateLoop':
                tpath = os.path.join(OUT, aid + '.tracks.json')
                # tracking is the slow part: reuse tracks newer than this script and the clip
                if os.path.exists(tpath) and os.path.getmtime(tpath) > max(os.path.getmtime(__file__), os.path.getmtime(src)):
                    with open(tpath) as fh:
                        tr = json.load(fh)
                else:
                    tr = track_loop(src)
                    with open(tpath, 'w') as fh:
                        json.dump(tr, fh, separators=(',', ':'))
                entry['tracks'] = f'/slideshow/backyard/{aid}.tracks.json'
                entry['windowCount'] = len(tr['windows'])
                print(f"{aid:10s} loop {entry['duration']}s  {len(tr['windows'])} tracked windows")
        manifest['assets'].append(entry)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=1)
    # bundled copy for the planner (needs window counts synchronously)
    with open(os.path.join(ROOT, 'services', 'slideshow', 'themes', 'backyard.manifest.json'), 'w') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    print('wrote', os.path.join(OUT, 'manifest.json'), len(manifest['assets']), 'assets')


if __name__ == '__main__':
    main()
