"""Clips for the Elderwood creature rigs.

Two sources, kept apart and named in each clip's `meta.source`:
  video  — joints marked on frames of the creature's motion study (tracks.py: pixel marks, frame numbers, video hash),
           turned into foot / wing-tip / head targets relative to the body, then solved onto this skeleton with
           planar IK. Timing (cycle length, phase offsets, duty factor) comes from the frames.
  authored — short reactions keyed by hand from the art where no footage exists (hit, launch, knockdown, parried,
           death, get_up, the crouch / tell pose layers). They are deliberately short and readable.

Every bone's rest rotation is the identity, so a local euler (degrees, XYZ, in the parent's rest frame) means the same
thing on every creature: +X pitches the bone's far end down / back (the creature faces +Z), +Y turns it toward +X
(its left), +Z rolls it.
"""
import numpy as np
from rig import quat_from_euler
import tracks as TR

FPS = 30


# ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────
def catmull(keys, t, period=None):
    """keys: [(t, value)], value scalar or array. Catmull-Rom through the keys; periodic when `period` is given."""
    ks = sorted(keys, key=lambda k: k[0])
    ts = np.array([k[0] for k in ks], float); vs = [np.asarray(k[1], float) for k in ks]
    if period:
        t = t % period
        ts = np.concatenate([ts - period, ts, ts + period]); vs = vs * 3
    if t <= ts[0]: return vs[0]
    if t >= ts[-1]: return vs[-1]
    i = int(np.searchsorted(ts, t) - 1)
    p0 = vs[max(i - 1, 0)]; p1 = vs[i]; p2 = vs[i + 1]; p3 = vs[min(i + 2, len(vs) - 1)]
    u = (t - ts[i]) / (ts[i + 1] - ts[i])
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


def ease(keys, t):
    """Piecewise smoothstep through [(t, value)] (holds at the ends) — for reactions that must not overshoot."""
    ks = sorted(keys, key=lambda k: k[0])
    if t <= ks[0][0]: return np.asarray(ks[0][1], float)
    for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
        if t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-9); u = u * u * (3 - 2 * u)
            return np.asarray(v0, float) * (1 - u) + np.asarray(v1, float) * u
    return np.asarray(ks[-1][1], float)


class Pose(dict):
    """{bone: [ex, ey, ez]} plus root offset."""
    def __init__(self):
        super().__init__(); self.root = np.zeros(3)

    def add(self, bone, e):
        self[bone] = np.asarray(self.get(bone, np.zeros(3)), float) + np.asarray(e, float)


def bake(J, pos, frames, duration, loop, meta):
    """frames: list of Pose at FPS → {'times', 'rot': {bone: quats}, 'pos': {'root': offsets}, 'meta'}."""
    names = [n for n, *_ in J]
    n = len(frames)
    rot = {}
    for b in names:
        if not any(b in f for f in frames):
            continue
        q = np.array([quat_from_euler(*f.get(b, np.zeros(3))) for f in frames])
        for i in range(1, n):  # keep the hemisphere continuous for LINEAR interpolation
            if np.dot(q[i], q[i - 1]) < 0: q[i] = -q[i]
        rot[b] = q
    times = np.linspace(0, duration, n)
    root_rest = pos['root']
    out = {'times': times, 'rot': rot, 'meta': dict(meta, loop=loop, duration=round(duration, 3))}
    if any(np.any(f.root != 0) for f in frames):
        out['pos'] = {'root': np.array([root_rest + f.root for f in frames])}
    return out


def sample(fn, duration, loop):
    n = max(2, int(round(duration * FPS)) + 1)
    if loop:  # a loop's last frame equals its first
        return [fn(i / (n - 1) * duration) for i in range(n)]
    return [fn(i / (n - 1) * duration) for i in range(n)]


# ── planar leg IK (legs swing in the creature's side plane: rotation about X) ───────────────────────────────
def ang(v):
    """Angle of a (z, y) vector; rotating by +X pitch θ maps angle φ → φ − θ."""
    return np.arctan2(v[1], v[0])


def two_bone(A, l1, l2, T, bend):
    """2D (z, y): root A, lengths, target T, bend sign (+1 = the middle joint lies counter-clockwise of A→T).
    Returns the middle joint position (target clamped into reach)."""
    d = T - A; L = np.linalg.norm(d)
    L = np.clip(L, abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4)
    d = d / (np.linalg.norm(d) + 1e-12)
    a = np.arccos(np.clip((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1))
    c, s = np.cos(a * bend), np.sin(a * bend)
    dirm = np.array([d[0] * c - d[1] * s, d[0] * s + d[1] * c])
    return A + dirm * l1


class Leg:
    """A leg chain [upper, mid, lower, foot] (+ tip): the foot joint goes to a target, the lower bone keeps a pastern
    angle, the upper two solve by IK with the rest pose's bend direction."""
    def __init__(self, pos, chain, tip):
        self.chain = chain
        P = [np.array([pos[b][2], pos[b][1]]) for b in chain] + [np.array([tip[2], tip[1]])]
        self.P = P
        self.l1 = np.linalg.norm(P[1] - P[0]); self.l2 = np.linalg.norm(P[2] - P[1])
        self.low = P[3] - P[2]; self.foot = P[4] - P[3]
        cr = (P[1] - P[0])[0] * (P[2] - P[1])[1] - (P[1] - P[0])[1] * (P[2] - P[1])[0]
        to = P[2] - P[0]; mid = P[1] - P[0]
        self.bend = 1 if (to[0] * mid[1] - to[1] * mid[0]) > 0 else -1
        self.rest = [ang(P[i + 1] - P[i]) for i in range(4)]

    def solve(self, foot_off, pastern=0.0, toe=0.0, parent_pitch=0.0, root_shift=(0.0, 0.0)):
        """foot_off: (dz, dy) of the foot joint from its rest place; pastern / toe in degrees (+ curls the lower leg /
        toe under); parent_pitch = the parent bone's world pitch (deg). Returns {bone: local pitch deg}."""
        return self.solve_world(self.P[0] - np.asarray(root_shift), self.P[3] + np.asarray(foot_off), pastern, toe, parent_pitch)

    def solve_world(self, A, F, pastern=0.0, toe=0.0, parent_pitch=0.0):
        """A = where the leg's root joint is now (after the body moved), F = where the foot joint should go (z, y)."""
        th = np.radians(pastern)
        c, s = np.cos(th), np.sin(th)
        lowr = np.array([self.low[0] * c + self.low[1] * s, -self.low[0] * s + self.low[1] * c])
        W = F - lowr
        M = two_bone(A, self.l1, self.l2, W, self.bend)
        world = [ang(M - A), ang(W - M), ang(F - W)]
        wp = [self.rest[i] - world[i] for i in range(3)] + [np.radians(toe)]
        out = {}; prev = np.radians(parent_pitch)
        for i, b in enumerate(self.chain):
            out[b] = np.degrees(wp[i] - prev); prev = wp[i]
        return out


def rot_x(Q, C, deg):
    """Rotate a (z, y) point Q about C by an X pitch of `deg` (+ = far end down)."""
    t = np.radians(deg); d = np.asarray(Q) - np.asarray(C)
    return np.asarray(C) + np.array([d[0] * np.cos(t) + d[1] * np.sin(t), -d[0] * np.sin(t) + d[1] * np.cos(t)])


# ── quadrupeds (wolf, deer) ─────────────────────────────────────────────────────────────────────────────────
def quad_legs(pos, J):
    tips = {n: o.get('tip') for n, _, _, o in J}
    legs = {}
    for s in 'LR':
        legs[s + 'F'] = Leg(pos, [f'{s}_arm', f'{s}_fore', f'{s}_wrist', f'{s}_paw'], np.array(tips[f'{s}_paw']))
        legs[s + 'H'] = Leg(pos, [f'{s}_thigh', f'{s}_shin', f'{s}_hock', f'{s}_foot'], np.array(tips[f'{s}_foot']))
    return legs


def gait_from_track(trk, pos, legs, body_pitch_amp=4.0):
    """trk (tracks.py): per-frame foot targets relative to the shoulder / hip, per-frame body lift, head, tail."""
    per = trk['period']
    rest_foot = {k: legs[k].P[3] for k in legs}
    shoulder = {k: legs[k].P[0] for k in legs}

    def at(t):
        u = (t / trk['duration']) * per  # in video frames
        p = Pose()
        lift = float(catmull(trk['lift'], u, per))
        p.root = np.array([0, lift, 0])
        flex = np.sin(2 * np.pi * (u / per) + trk.get('flex_phase', 0)) * body_pitch_amp
        p.add('pelvis', [-flex * 0.5, 0, 0]); p.add('spine1', [flex * 0.5, 0, 0]); p.add('chest', [flex * 0.5, 0, 0])
        pp = {'F': -flex * 0.5 + flex * 0.5 + flex * 0.5, 'H': -flex * 0.5}
        for k, leg in legs.items():
            side, end = k[0], k[1]
            ph = trk['phase'][k]
            # the mark is the paw's ground point, in metres from the shoulder / hip (z fwd, y up), measured on the
            # video's animal; scaled by shoulder (hip) height so a planted paw lands on this mesh's ground
            rel = catmull(trk['foot'][end], u + ph * per, per)
            k_s = shoulder[k][1] / trk['height'][end]
            if trk.get('norm'):  # fractions of the shoulder / hip height above the paw's rest height
                k_s = shoulder[k][1] - rest_foot[k][1]
            tgt = shoulder[k] + rel * k_s + np.array([0, rest_foot[k][1]])
            # the body is lifted by `lift`; a foot below the ground stays on it
            tgt[1] = max(tgt[1], rest_foot[k][1] - lift)
            off = tgt - rest_foot[k]
            past = float(catmull(trk['pastern'][end], u + ph * per, per))
            res = leg.solve(off, past, -past * 0.6, pp[end], (0.0, 0.0))
            for b, v in res.items(): p.add(b, [v, 0, 0])
            # the scapula follows the upper arm a little
            if end == 'F': p.add(f'{side}_scap', [res[f'{side}_arm'] * 0.25, 0, 0]); p[f'{side}_arm'][0] -= res[f'{side}_arm'] * 0.25
        hd = float(catmull(trk['head'], u, per))
        p.add('neck', [hd * 0.6, 0, 0]); p.add('head', [hd * 0.4, 0, 0])
        tl = float(catmull(trk['tail'], u, per))
        for i, b in enumerate(['tail1', 'tail2', 'tail3']): p.add(b, [tl * (0.5 + 0.25 * i), 0, 0])
        return p
    return at


def quad_clips(kind, J, pos):
    legs = quad_legs(pos, J)
    out = {}
    names = {n for n, *_ in J}
    has_jaw = 'jaw' in names
    loco = TR.TRACKS[kind]
    for cname, trk in loco.items():
        fn = gait_from_track(trk, pos, legs, trk.get('flex', 4.0))
        out[cname] = bake(J, pos, sample(fn, trk['duration'], True), trk['duration'], True,
                          {'source': 'video', 'video': trk['video'], 'frames': trk['frames'], 'note': trk['note']})

    def neutral():
        return Pose()

    # idle: breathing, head looks about, tail sways (authored)
    def idle(t):
        p = Pose(); b = np.sin(t / 3.0 * 2 * np.pi)
        p.root = np.array([0, b * 0.006, 0])
        p.add('chest', [b * 1.0, 0, 0]); p.add('neck', [-b * 1.5, np.sin(t / 3.0 * 2 * np.pi * 0.5) * 8, 0]); p.add('head', [b * 2, np.sin(t / 3.0 * 2 * np.pi * 0.5) * 6, 0])
        for i, tb in enumerate(['tail1', 'tail2', 'tail3']): p.add(tb, [6, np.sin(t / 3 * 2 * np.pi + i * 0.6) * (6 + 4 * i), 0])
        if 'L_ear' in names:
            p.add('L_ear', [0, 0, np.sin(t * 2.1) * 5]); p.add('R_ear', [0, 0, -np.sin(t * 2.1 + 1) * 5])
        return p
    out['idle'] = bake(J, pos, sample(idle, 3.0, True), 3.0, True, {'source': 'authored'})

    # crouch / tell pose layers (used weighted, 1 frame held): body sinks, legs fold, head drops, tail low
    def crouch_pose(depth, head, tail):
        p = Pose(); p.root = np.array([0, -depth, 0])
        for k, leg in legs.items():
            res = leg.solve((0.0, depth), 8 if k[1] == 'F' else -4, 0, 0)
            for b, v in res.items(): p.add(b, [v, 0, 0])
        p.add('neck', [head, 0, 0]); p.add('head', [head * 0.5, 0, 0])
        for i, tb in enumerate(['tail1', 'tail2', 'tail3']): p.add(tb, [tail, 0, 0])
        return p
    H = pos['chest'][1]
    out['crouch'] = bake(J, pos, [crouch_pose(H * 0.24, 14, 14)] * 2, 1.0, True, {'source': 'authored', 'layer': True})
    out['tell'] = bake(J, pos, [crouch_pose(H * 0.12, 22, -10)] * 2, 1.0, True, {'source': 'authored', 'layer': True})

    # attack: from tracks (video) when present, else authored lunge-bite
    atk = TR.ATTACKS.get(kind)
    for aname, a in (atk or {}).items():
        def fn(t, a=a):
            u = t / a['duration']
            p = Pose()
            p.root = np.array([0, float(ease(a['lift'], u)), float(ease(a['fwd'], u))])
            rear = float(ease(a['rear'], u))  # body pitch up (rearing, degrees)
            p.add('pelvis', [-rear, 0, 0])
            hd = float(ease(a['head'], u)); p.add('neck', [hd * 0.6, 0, 0]); p.add('head', [hd * 0.4, 0, 0])
            if has_jaw: p.add('jaw', [float(ease(a['jaw'], u)), 0, 0])
            pv = np.array([pos['pelvis'][2], pos['pelvis'][1]])
            sh = np.array([p.root[2], p.root[1]])
            for k, leg in legs.items():
                fo = ease(a['feet'][k[1]], u)
                A = rot_x(leg.P[0], pv, -rear) + sh          # where the shoulder / hip went (body reared + moved)
                F = leg.P[3] + fo + (sh if k[1] == 'F' else 0)  # front paws move with the body, hind ones stay planted
                res = leg.solve_world(A, F, float(ease(a['pastern'][k[1]], u)), 0, -rear)
                for b, v in res.items(): p.add(b, [v, 0, 0])
                if k[1] == 'F': p[f'{k[0]}_arm'][0] += 0  # (scapula stays with the chest)
            for i, tb in enumerate(['tail1', 'tail2', 'tail3']): p.add(tb, [float(ease(a['tail'], u)), 0, 0])
            return p
        out[aname] = bake(J, pos, sample(fn, a['duration'], False), a['duration'], False,
                          {'source': a['source'], 'video': a.get('video'), 'frames': a.get('frames'), 'note': a.get('note', ''), 'hit_at': a.get('hit_at', 0.6)})

    # ── reactions (authored) ──
    HALF_W = 0.2 if kind == 'wolf' else 0.16

    def react(keys, dur, src='authored'):
        def fn(t):
            u = t / dur; p = Pose()
            roll = float(ease(keys.get('roll', [(0, 0)]), u)); pitch = float(ease(keys.get('pitch', [(0, 0)]), u))
            lift = float(ease(keys.get('lift', [(0, 0)]), u))
            # the root turns about the feet: put the body's middle back over the spot, `lift` above where it was,
            # and when it lies on its side, rest its flank (half its width) on the ground
            h = pos['pelvis'][1]; r = np.radians(roll); q = np.radians(pitch)
            target = h + (HALF_W - h) * abs(np.sin(r)) + lift
            p.root = np.array([h * np.sin(r), target - h * np.cos(r) * np.cos(q), float(ease(keys.get('back', [(0, 0)]), u))])
            p.add('root', [pitch, 0, roll])
            fl = float(ease(keys.get('flinch', [(0, 0)]), u))
            p.add('chest', [-fl * 0.5, 0, 0]); p.add('neck', [-fl, float(ease(keys.get('turn', [(0, 0)]), u)), 0]); p.add('head', [-fl * 0.6, 0, 0])
            if has_jaw: p.add('jaw', [float(ease(keys.get('jaw', [(0, 0)]), u)), 0, 0])
            fold = float(ease(keys.get('fold', [(0, 0)]), u)); kick = float(ease(keys.get('kick', [(0, 0)]), u))
            for k, leg in legs.items():
                # fold: legs tuck toward the body (airborne / down); kick: legs flail
                off = np.array([np.sin(k == 'LF' and 1 or 0.6) * 0 + (0.08 if k[1] == 'H' else -0.08) * fold, fold * 0.3])
                off = off + np.array([np.sin(u * 18 + hash(k) % 5) * 0.06 * kick, abs(np.sin(u * 14 + hash(k) % 3)) * 0.08 * kick])
                res = leg.solve(off, 30 * fold if k[1] == 'F' else -20 * fold, 0, 0)
                for b, v in res.items(): p.add(b, [v, 0, 0])
            for i, tb in enumerate(['tail1', 'tail2', 'tail3']): p.add(tb, [float(ease(keys.get('tail', [(0, 0)]), u)), 0, 0])
            return p
        return bake(J, pos, sample(fn, dur, False), dur, False, {'source': src})

    H0 = pos['pelvis'][1]
    out['hit'] = react({'flinch': [(0, 0), (0.18, 18), (1, 0)], 'back': [(0, 0), (0.2, -0.08), (1, 0)], 'turn': [(0, 0), (0.2, 14), (1, 0)], 'jaw': [(0, 0), (0.2, 18), (1, 0)], 'tail': [(0, 0), (0.2, 20), (1, 0)]}, 0.45)
    out['hit_heavy'] = react({'flinch': [(0, 0), (0.15, 30), (0.6, 12), (1, 0)], 'back': [(0, 0), (0.25, -0.22), (1, -0.25)], 'roll': [(0, 0), (0.2, 10), (1, 0)], 'turn': [(0, 0), (0.2, 22), (1, 0)], 'jaw': [(0, 0), (0.2, 25), (1, 0)], 'fold': [(0, 0), (0.2, 0.25), (1, 0)], 'tail': [(0, 0), (0.2, 25), (1, 0)]}, 0.8)
    out['parried'] = react({'flinch': [(0, 0), (0.12, 26), (0.5, 20), (1, 0)], 'back': [(0, 0), (0.2, -0.18), (1, -0.2)], 'pitch': [(0, 0), (0.15, -10), (0.6, -6), (1, 0)], 'turn': [(0, 0), (0.25, -18), (0.7, 12), (1, 0)], 'jaw': [(0, 0), (0.15, 30), (0.6, 10), (1, 0)], 'tail': [(0, 0), (0.2, -15), (1, 0)]}, 0.9)
    out['launch'] = react({'lift': [(0, 0), (0.35, H0 * 0.9), (0.7, H0 * 1.1), (1, H0 * 0.9)], 'pitch': [(0, 0), (0.4, -35), (1, -60)], 'fold': [(0, 0), (0.25, 0.6), (1, 0.8)], 'kick': [(0, 0), (0.3, 1), (1, 0.6)], 'flinch': [(0, 0), (0.2, 20), (1, 10)], 'jaw': [(0, 0), (0.2, 25), (1, 20)], 'tail': [(0, 0), (1, 30)]}, 0.9)
    out['knockdown'] = react({'lift': [(0, 0), (0.25, H0 * 0.25), (0.55, 0), (1, 0)], 'back': [(0, 0), (0.5, -0.4), (1, -0.45)], 'roll': [(0, 0), (0.5, 80), (0.7, 92), (1, 88)], 'fold': [(0, 0), (0.3, 0.5), (1, 0.35)], 'kick': [(0, 0), (0.4, 0.8), (0.8, 0.3), (1, 0)], 'flinch': [(0, 0), (0.3, 20), (1, 6)], 'jaw': [(0, 0), (0.3, 20), (1, 8)], 'tail': [(0, 0), (1, 10)]}, 1.0)
    out['get_up'] = react({'lift': [(0, 0), (1, 0)], 'back': [(0, -0.45), (1, -0.45)], 'roll': [(0, 88), (0.5, 30), (1, 0)], 'fold': [(0, 0.35), (0.5, 0.5), (1, 0)], 'flinch': [(0, 6), (0.6, -10), (1, 0)], 'tail': [(0, 10), (1, 0)]}, 1.0)
    out['death'] = react({'lift': [(0, 0), (0.3, -H0 * 0.12), (0.7, 0), (1, 0)], 'roll': [(0, 0), (0.35, 10), (0.75, 86), (1, 90)], 'fold': [(0, 0), (0.4, 0.6), (1, 0.4)], 'kick': [(0, 0), (0.6, 0.4), (1, 0)], 'flinch': [(0, 0), (0.25, 25), (0.7, -20), (1, -28)], 'jaw': [(0, 0), (0.3, 30), (1, 22)], 'tail': [(0, 0), (1, 20)]}, 1.4)
    # eat: head down to the ground, jaw works (authored, both quadrupeds forage / feed on a kill)
    def eat(t):
        p = Pose(); u = t / 2.4
        dn = float(ease([(0, 0), (0.2, 1), (0.85, 1), (1, 0)], u))
        p.add('chest', [12 * dn, 0, 0]); p.add('neck', [48 * dn, 0, 0]); p.add('head', [22 * dn + np.sin(t * 9) * 5 * dn, 0, 0])
        if has_jaw: p.add('jaw', [max(0, np.sin(t * 9)) * 18 * dn, 0, 0])
        for k, leg in legs.items():
            if k[1] == 'F':
                res = leg.solve((0.0, 0.05 * dn), 10 * dn, 0, 12 * dn)
                for b, v in res.items(): p.add(b, [v, 0, 0])
        return p
    out['eat'] = bake(J, pos, sample(eat, 2.4, False), 2.4, False, {'source': 'authored' if kind == 'wolf' else 'video', 'note': 'deer: head-down graze timing from 118ce3df frames 78-140' if kind == 'deer' else ''})
    return out


def make(kind, J, pos):
    if kind in ('wolf', 'deer'):
        return quad_clips(kind, J, pos)
    import clips_other
    return clips_other.make(kind, J, pos)
