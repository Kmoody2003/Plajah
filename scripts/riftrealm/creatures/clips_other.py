"""Clips for the mantis, wasp, bat and moth (clips.py has the quadrupeds and the shared helpers).

Sources (each clip's meta.source says which):
  mantis attack  video 5cac7ba7 frames 120-153: guard (120-129), wind-up with the scythes raised and opened
                 (132-138), the slash forward and down (141-147), the snap closed and follow-through (150-153).
                 Poses keyed off those frames, timing from them.
  bat fly        video 203f70c5 frames 31-54 (front view): wings raised and half folded (31-36), spread level and
                 swept down (37-48), rising again (50-54): one beat ≈ 23 frames. Elevations read off the frames.
  bat attack     video 203f70c5 frames 62-124: the screech (head thrust, jaws wide, wings spread, 62-90) and the
                 forward wing sweep (109-124). Keyed poses.
  moth fly       video ecc03df8 frames 93-115 (front view): wings up (93), level (98-99), up (105-108), level
                 (114-115): one beat ≈ 16 frames; forewing tip from ~34° above the shoulder down to level.
  wasp attack    video 2c45a3d5 frames 140-200: the abdomen curls forward under the body and fires (156-187).
  wasp fly       wing beat too fast for the 24 fps footage (a blur); stroke amplitude from the blur's extent in the
                 front views (frames 46-62), frequency authored.
  authored       mantis walk (diagonal pairs on its four walking legs), every hit / launch / knockdown / get_up /
                 parried / death, the crouch / tell layers.
"""
import numpy as np
from clips import Pose, bake, sample, catmull, ease, two_bone, ang, rot_x, FPS

HOVER_MESH = {'wasp': 1.7 * 2.0 / 1.8, 'bat': 2.4 * 0.891 / 1.6, 'moth': 0.0, 'mantis': 0.0}


class Leg3:
    """[a, b, c] + tip: the c joint (ankle) goes to a target by 2-bone IK on a, b; c keeps its heading + toe."""
    def __init__(self, pos, chain, tip):
        self.chain = chain
        P = [np.array([pos[b][2], pos[b][1]]) for b in chain] + [np.array([tip[2], tip[1]])]
        self.P = P
        self.l1 = np.linalg.norm(P[1] - P[0]); self.l2 = np.linalg.norm(P[2] - P[1])
        to = P[2] - P[0]; mid = P[1] - P[0]
        self.bend = 1 if (to[0] * mid[1] - to[1] * mid[0]) > 0 else -1
        self.rest = [ang(P[i + 1] - P[i]) for i in range(3)]

    def solve(self, off, toe=0.0, parent_pitch=0.0):
        A = self.P[0]; F = self.P[2] + np.asarray(off)
        M = two_bone(A, self.l1, self.l2, F, self.bend)
        wp = [self.rest[0] - ang(M - A), self.rest[1] - ang(F - M), np.radians(toe)]
        out = {}; prev = np.radians(parent_pitch)
        for i, b in enumerate(self.chain):
            out[b] = np.degrees(wp[i] - prev); prev = wp[i]
        return out


def mirror(p, bone, e):
    """Add e to L_bone and its mirror to R_bone (Y and Z flip)."""
    p.add('L_' + bone, e); p.add('R_' + bone, [e[0], -e[1], -e[2]])


def reactions(kind, J, pos, out, body, head, wings=None, legs_fold=None, hover=0.0):
    """Shared hit / hit_heavy / parried / launch / knockdown / get_up / death for a body chain + head (+ wings).
    body: the bone that pitches the whole body; wings: fn(p, fold 0..1, spread) to fold the wings."""
    H = max(p[1] for p in pos.values())

    def mk(keys, dur):
        def fn(t):
            u = t / dur; p = Pose()
            drop = float(ease(keys.get('drop', [(0, 0)]), u))     # 0..1: down to the ground (flyers fall the hover)
            p.root = np.array([0, float(ease(keys.get('lift', [(0, 0)]), u)) - drop * hover, float(ease(keys.get('back', [(0, 0)]), u))])
            p.add('root', [float(ease(keys.get('pitch', [(0, 0)]), u)), 0, float(ease(keys.get('roll', [(0, 0)]), u))])
            fl = float(ease(keys.get('flinch', [(0, 0)]), u))
            p.add(body, [-fl * 0.6, 0, 0]); p.add(head, [-fl, float(ease(keys.get('turn', [(0, 0)]), u)), 0])
            if wings: wings(p, float(ease(keys.get('fold', [(0, 0)]), u)), float(ease(keys.get('flail', [(0, 0)]), u)), t)
            if legs_fold: legs_fold(p, float(ease(keys.get('legs', [(0, 0)]), u)), t)
            return p
        return bake(J, pos, sample(fn, dur, False), dur, False, {'source': 'authored'})

    out['hit'] = mk({'flinch': [(0, 0), (0.2, 16), (1, 0)], 'back': [(0, 0), (0.2, -0.06 * H), (1, 0)], 'turn': [(0, 0), (0.2, 14), (1, 0)], 'flail': [(0, 0), (0.25, 0.5), (1, 0)], 'legs': [(0, 0), (0.2, 0.3), (1, 0)]}, 0.45)
    out['hit_heavy'] = mk({'flinch': [(0, 0), (0.15, 28), (0.6, 10), (1, 0)], 'back': [(0, 0), (0.25, -0.16 * H), (1, -0.18 * H)], 'roll': [(0, 0), (0.2, 14), (1, 0)], 'turn': [(0, 0), (0.2, 22), (1, 0)], 'flail': [(0, 0), (0.2, 1), (1, 0)], 'legs': [(0, 0), (0.2, 0.6), (1, 0)]}, 0.8)
    out['parried'] = mk({'flinch': [(0, 0), (0.12, 24), (0.5, 18), (1, 0)], 'back': [(0, 0), (0.2, -0.14 * H), (1, -0.15 * H)], 'pitch': [(0, 0), (0.15, -14), (0.6, -8), (1, 0)], 'turn': [(0, 0), (0.25, -16), (0.7, 10), (1, 0)], 'flail': [(0, 0), (0.15, 0.8), (1, 0)], 'legs': [(0, 0), (0.15, 0.5), (1, 0)]}, 0.9)
    out['launch'] = mk({'lift': [(0, 0), (0.35, 0.5 * H), (0.7, 0.62 * H), (1, 0.55 * H)], 'pitch': [(0, 0), (0.4, -40), (1, -75)], 'flinch': [(0, 0), (0.2, 22), (1, 12)], 'flail': [(0, 0), (0.3, 1), (1, 0.7)], 'legs': [(0, 0), (0.25, 1), (1, 0.8)]}, 0.9)
    lie = 88 if kind != 'mantis' else 80
    out['knockdown'] = mk({'drop': [(0, 0), (0.6, 1), (1, 1)], 'lift': [(0, 0), (0.25, 0.12 * H), (0.6, 0.0), (1, 0.0)], 'roll': [(0, 0), (0.55, lie), (0.75, lie + 6), (1, lie)], 'back': [(0, 0), (0.5, -0.2 * H), (1, -0.22 * H)], 'flail': [(0, 0), (0.4, 1), (1, 0.2)], 'fold': [(0, 0), (0.6, 0.6), (1, 0.7)], 'legs': [(0, 0), (0.3, 1), (0.8, 0.5), (1, 0.4)], 'flinch': [(0, 0), (0.3, 18), (1, 6)]}, 1.0)
    out['get_up'] = mk({'drop': [(0, 1), (0.5, 0.6), (1, 0)], 'roll': [(0, lie), (0.55, 20), (1, 0)], 'back': [(0, -0.22 * H), (1, -0.22 * H)], 'fold': [(0, 0.7), (0.6, 0.2), (1, 0)], 'legs': [(0, 0.4), (0.5, 0.7), (1, 0)], 'flail': [(0, 0.2), (0.5, 0.8), (1, 0)]}, 1.0)
    out['death'] = mk({'drop': [(0, 0), (0.7, 1), (1, 1)], 'roll': [(0, 0), (0.35, 12), (0.75, lie + 4), (1, lie + 2)], 'flail': [(0, 0), (0.3, 1), (0.7, 0.3), (1, 0)], 'fold': [(0, 0), (0.7, 0.8), (1, 1)], 'legs': [(0, 0), (0.3, 1), (1, 1)], 'flinch': [(0, 0), (0.25, 22), (0.7, -18), (1, -24)]}, 1.4)
    # pose layers (the predators' stalk crouch and the attack tell)
    def layer(fl, legs, fold):
        p = Pose(); p.add(body, [-fl * 0.4, 0, 0]); p.add(head, [fl, 0, 0])
        if wings: wings(p, fold, 0, 0)
        if legs_fold: legs_fold(p, legs, 0)
        p.root = np.array([0, -0.08 * H * legs, 0])
        return p
    out['crouch'] = bake(J, pos, [layer(-8, 0.6, 0.3)] * 2, 1.0, True, {'source': 'authored', 'layer': True})
    out['tell'] = bake(J, pos, [layer(14, 0.3, -0.4)] * 2, 1.0, True, {'source': 'authored', 'layer': True})


# ── mantis ──────────────────────────────────────────────────────────────────────────────────────────────────
def mantis(J, pos):
    tips = {n: o.get('tip') for n, _, _, o in J}
    legs = {f'{s}{k}': Leg3(pos, [f'{s}_{k}1', f'{s}_{k}2', f'{s}_{k}3'], np.array(tips[f'{s}_{k}3'])) for s in 'LR' for k in 'fh'}
    out = {}

    def arms(p, coxa, femur, tibia, fy=0.0, fz=0.0):
        mirror(p, 'coxa', [coxa, 0, 0]); mirror(p, 'femur', [femur, fy, fz]); mirror(p, 'tibia', [tibia, 0, 0])

    def walk(t):
        # diagonal pairs (LF + RH, RF + LH), half a cycle apart; feet stride 0.16 m, lift 0.07 m; duty 0.6
        p = Pose(); per = 0.9; u = (t / per) % 1
        for k, leg in legs.items():
            ph = (u + (0.5 if k in ('Rf', 'Lh') else 0.0)) % 1
            if ph < 0.6:  # stance: the foot slides back under the body
                s = ph / 0.6; dz = 0.08 - 0.16 * s; dy = 0
            else:         # swing: up and forward
                s = (ph - 0.6) / 0.4; dz = -0.08 + 0.16 * (s * s * (3 - 2 * s)); dy = np.sin(np.pi * s) * 0.07
            for b, v in leg.solve((dz, dy)).items(): p.add(b, [v, 0, 0])
        b = np.sin(u * 4 * np.pi)
        p.root = np.array([0, b * 0.012, 0]); p.add('prothorax', [b * 1.5, np.sin(u * 2 * np.pi) * 3, 0])
        p.add('head', [0, np.sin(u * 2 * np.pi + 1) * 6, 0]); p.add('abd1', [b * 2, -np.sin(u * 2 * np.pi) * 3, 0])
        arms(p, 0, b * 3, 0)
        mirror(p, 'ant', [np.sin(t * 5) * 6, 0, np.sin(t * 3.3) * 5])
        return p
    out['walk'] = bake(J, pos, sample(walk, 0.9, True), 0.9, True, {'source': 'authored', 'note': 'diagonal-pair gait on the four walking legs'})

    def idle(t):
        p = Pose(); b = np.sin(t / 2.5 * 2 * np.pi)
        p.add('prothorax', [b * 2, np.sin(t / 2.5 * 2 * np.pi * 0.5) * 6, 0]); p.add('head', [0, np.sin(t / 2.5 * 2 * np.pi * 0.5 + 0.6) * 14, b * 4])
        arms(p, b * 4, -b * 4, b * 3); p.add('abd1', [-b * 2, 0, 0])
        mirror(p, 'ant', [np.sin(t * 4.2) * 8, 0, np.sin(t * 2.8) * 6])
        return p
    out['idle'] = bake(J, pos, sample(idle, 2.5, True), 2.5, True, {'source': 'authored'})

    # the strike (video 5cac7ba7 120-153, 33 frames = 1.4 s, played at 0.8 s): guard → wind-up → slash → snap → follow
    K = {'coxa': [(0, 0), (0.12, 0), (0.42, -28), (0.6, -12), (0.72, -4), (1, 0)],
         'femur': [(0, 0), (0.12, 0), (0.42, -105), (0.6, 18), (0.72, 6), (1, 0)],
         'tibia': [(0, 0), (0.12, 0), (0.42, -55), (0.6, -115), (0.72, -8), (1, 0)],
         'fy': [(0, 0), (0.42, 12), (0.6, -24), (0.72, -20), (1, 0)],
         'fz': [(0, 0), (0.42, 18), (0.6, -6), (1, 0)],
         'lean': [(0, 0), (0.42, -10), (0.6, 16), (0.8, 8), (1, 0)],
         'head': [(0, 0), (0.42, -8), (0.6, 10), (1, 0)]}

    def strike(t, K=K, dur=0.8):
        u = t / dur; p = Pose()
        arms(p, float(ease(K['coxa'], u)), float(ease(K['femur'], u)), float(ease(K['tibia'], u)), float(ease(K['fy'], u)), float(ease(K['fz'], u)))
        p.add('prothorax', [float(ease(K['lean'], u)), 0, 0]); p.add('head', [float(ease(K['head'], u)), 0, 0])
        p.root = np.array([0, 0, float(ease([(0, 0), (0.6, 0.12), (1, 0)], u))])
        return p
    meta = {'source': 'video', 'video': '5cac7ba7', 'frames': [120, 153], 'note': 'scythe poses keyed off guard 120-129, wind-up 132-138, slash 141-147, snap/follow 150-153', 'hit_at': 0.6}
    out['attack'] = bake(J, pos, sample(strike, 0.8, False), 0.8, False, meta)
    # second strike: the diagonal back-swipe at 150-153 (one arm leads)
    def strike2(t, dur=0.65):
        u = t / dur; p = Pose()
        p.add('L_femur', [float(ease([(0, 0), (0.35, -95), (0.65, 20), (1, 0)], u)), float(ease([(0, 0), (0.35, 20), (0.65, -30), (1, 0)], u)), 0])
        p.add('L_tibia', [float(ease([(0, 0), (0.35, -40), (0.6, -110), (0.75, -10), (1, 0)], u)), 0, 0])
        p.add('R_femur', [float(ease([(0, 0), (0.3, -30), (0.7, -10), (1, 0)], u)), 0, 0])
        p.add('prothorax', [float(ease([(0, 0), (0.35, -8), (0.65, 14), (1, 0)], u)), float(ease([(0, 0), (0.35, 12), (0.65, -16), (1, 0)], u)), 0])
        return p
    out['attack_2'] = bake(J, pos, sample(strike2, 0.65, False), 0.65, False, dict(meta, frames=[147, 153], note='one-arm diagonal swipe, frames 147-153', hit_at=0.62))

    def wings(p, fold, flail, t):
        mirror(p, 'femur', [-40 * flail * abs(np.sin(t * 22)), 0, 20 * flail])
        mirror(p, 'tibia', [-50 * flail * abs(np.sin(t * 19)) + 30 * fold, 0, 0])

    def legfold(p, k, t):
        for kk, leg in legs.items():
            for b, v in leg.solve((0.0, 0.18 * k), 20 * k).items(): p.add(b, [v, 0, 0])
    reactions('mantis', J, pos, out, 'prothorax', 'head', wings, legfold, 0.0)
    # the turnaround's stance (5cac7ba7 frame 0 / d6af1be2): scythes held out from the body, blades flared
    def art(t):
        p = Pose(); mirror(p, 'coxa', [0, 0, 16]); mirror(p, 'femur', [-6, 0, 6]); mirror(p, 'tibia', [0, 0, 12]); return p
    out['art'] = bake(J, pos, [art(0)] * 2, 1.0, True, {'source': 'authored', 'note': 'turnaround pose, for scoring and the Studio'})
    return out


# ── wasp ────────────────────────────────────────────────────────────────────────────────────────────────────
def wasp(J, pos):
    out = {}
    hov = HOVER_MESH['wasp']

    def beat(p, t, amp=1.0, f=26.0):
        # stroke: forewing ±38° about the body's long axis, hindwing following; a slight figure-8 (Y)
        a = np.sin(t * f * 2 * np.pi)
        mirror(p, 'fwing', [0, np.cos(t * f * 2 * np.pi) * 10 * amp, (14 + 38 * a) * amp - 14])
        mirror(p, 'hwing', [0, np.cos(t * f * 2 * np.pi - 0.5) * 8 * amp, (10 + 30 * np.sin(t * f * 2 * np.pi - 0.4)) * amp - 10])
        mirror(p, 'fwing2', [0, 0, 6 * np.sin(t * f * 2 * np.pi - 0.8) * amp])

    def dangle(p, t, k=1.0):
        for i, leg in enumerate(['l1', 'l2', 'l3']):
            mirror(p, leg, [np.sin(t * 3 + i) * 6 * k, 0, np.sin(t * 2.3 + i) * 4 * k])
            mirror(p, leg + 'b', [np.sin(t * 3.4 + i + 1) * 8 * k, 0, 0])

    def fly(t):
        p = Pose(); beat(p, t); dangle(p, t)
        p.add('abd1', [np.sin(t * 2 * np.pi / 1.0) * 4, 0, 0]); p.add('abd2', [np.sin(t * 2 * np.pi / 1.0 - 0.6) * 4, 0, 0])
        p.add('head', [0, np.sin(t * 2 * np.pi * 0.5) * 8, 0])
        mirror(p, 'ant', [np.sin(t * 6) * 8, 0, np.sin(t * 4) * 6])
        return p
    # 1.0 s loop; the beat is 26 Hz (26 cycles per loop, so it loops cleanly)
    out['fly'] = bake(J, pos, [fly(i / 240) for i in range(241)], 1.0, True, {'source': 'authored', 'note': 'stroke amplitude from the blur extent in 2c45a3d5 front views (46-62); frequency authored'})
    out['idle'] = out['fly']

    def attack(t, dur=0.8):
        # 2c45a3d5 156-187: the abdomen swings forward under the body until the stinger points ahead, holds and fires,
        # the body pitches nose-up to aim it, then the abdomen swings back
        u = t / dur; p = Pose(); beat(p, t, 1.15, 30); dangle(p, t, 0.5)
        c = float(ease([(0, 0), (0.35, 1), (0.7, 1), (1, 0)], u))
        p.add('abd1', [-30 * c, 0, 0]); p.add('abd2', [-28 * c, 0, 0]); p.add('abd3', [-22 * c, 0, 0]); p.add('sting', [-12 * c, 0, 0])
        p.add('root', [-14 * c, 0, 0])
        p.root = np.array([0, 0, float(ease([(0, 0), (0.45, 0.1), (0.6, 0.18), (1, 0)], u))])
        kick = float(ease([(0.5, 0), (0.55, 1), (0.65, 0)], u)); p.add('sting', [8 * kick, 0, 0])  # the shot's recoil
        mirror(p, 'l1', [-30 * c, 0, 0])
        return p
    out['attack'] = bake(J, pos, [attack(i / 240 * 0.8) for i in range(193)], 0.8, False, {'source': 'video', 'video': '2c45a3d5', 'frames': [140, 187], 'note': 'abdomen curl angle and timing keyed off frames 140-187', 'hit_at': 0.55})

    def wings(p, fold, flail, t):
        beat(p, t, max(0.0, 1 - fold) * (1 + flail * 0.3))
        mirror(p, 'fwing', [0, -30 * fold, -25 * fold]); mirror(p, 'hwing', [0, -30 * fold, -20 * fold])

    def legfold(p, k, t):
        for i, leg in enumerate(['l1', 'l2', 'l3']):
            mirror(p, leg, [-20 * k + np.sin(t * 20 + i) * 10 * k, 0, 15 * k]); mirror(p, leg + 'b', [30 * k, 0, 0])
        p.add('abd1', [-15 * k, 0, 0])
    reactions('wasp', J, pos, out, 'thorax', 'head', wings, legfold, hov)
    # the turnaround's wings (9e711c8c): raised and spread out from the body, between the front view's spread and the
    # side view's swept-back line
    def art(t):
        p = Pose(); mirror(p, 'fwing', [0, -45, -6]); mirror(p, 'hwing', [0, -40, -4]); return p
    out['art'] = bake(J, pos, [art(0)] * 2, 1.0, True, {'source': 'authored', 'note': 'turnaround pose, for scoring and the Studio'})
    return out


# ── bat ─────────────────────────────────────────────────────────────────────────────────────────────────────
def bat(J, pos):
    out = {}
    hov = HOVER_MESH['bat']
    # 203f70c5 31-54: elevation of the arm at the shoulder over one beat (deg, + = up), and the hand's fold
    # (31-36 raised and half folded, 37-48 level then swept down, 50-54 rising)
    BEAT = 23 / 24.0  # seconds
    ELEV = [(0, 32), (3, 30), (6, 12), (9, -4), (12, -14), (15, -18), (17, -12), (19, 4), (21, 22), (23, 32)]
    FOLD = [(0, 0.55), (4, 0.4), (7, 0.05), (12, 0.0), (16, 0.1), (19, 0.45), (23, 0.55)]

    def wing(p, el, fold, sweep=0.0):
        # shoulder raises the arm (Z), the elbow / wrist fold the hand in (Y about the forearm, forward sweep)
        mirror(p, 'arm', [0, -sweep * 0.5, el])
        mirror(p, 'fore', [0, 30 * fold - sweep * 0.3, 10 * fold])
        mirror(p, 'hand', [0, 40 * fold, 25 * fold])
        for d, k in (('d2', 1.0), ('d3', 1.3), ('d4', 1.6)):
            mirror(p, d, [0, 20 * fold * k, 30 * fold * k])

    def body(p, t, el):
        p.add('chest', [-el * 0.08, 0, 0]); p.add('head', [el * 0.1, np.sin(t * 1.7) * 8, 0])
        for s in 'LR':
            p.add(f'{s}_thigh', [20 + np.sin(t * 2.5) * 5, 0, 0]); p.add(f'{s}_shin', [-25, 0, 0])
        mirror(p, 'ear', [np.sin(t * 3) * 5, 0, np.sin(t * 2.2) * 6])
        p.root = np.array([0, -el / 32 * 0.03, 0])

    def fly(t):
        p = Pose(); fr = (t / BEAT) * 23
        el = float(catmull(ELEV, fr, 23)); fo = float(catmull(FOLD, fr, 23))
        wing(p, el, fo); body(p, t, el)
        return p
    out['fly'] = bake(J, pos, sample(fly, BEAT, True), BEAT, True, {'source': 'video', 'video': '203f70c5', 'frames': [31, 54], 'note': 'shoulder elevation and hand fold read off one beat, front view'})
    out['idle'] = out['fly']

    def attack(t, dur=0.85):
        # screech + wing sweep: wings flare up and back (62-70), the head thrusts with jaws wide (70-90), then both wings
        # sweep forward round the target (109-124) and recover
        u = t / dur; p = Pose()
        el = float(ease([(0, 10), (0.25, 40), (0.55, 5), (0.75, -10), (1, 10)], u))
        sw = float(ease([(0, 0), (0.25, -25), (0.55, 70), (0.75, 60), (1, 0)], u))
        fo = float(ease([(0, 0.2), (0.25, 0.0), (0.55, 0.15), (1, 0.2)], u))
        wing(p, el, fo, sw)
        p.add('head', [float(ease([(0, 0), (0.25, -18), (0.5, 14), (1, 0)], u)), 0, 0]); p.add('chest', [float(ease([(0, 0), (0.25, -12), (0.55, 22), (1, 0)], u)), 0, 0])
        p.add('root', [float(ease([(0, 0), (0.25, -10), (0.55, 20), (1, 0)], u)), 0, 0])
        p.root = np.array([0, float(ease([(0, 0), (0.25, 0.05), (0.55, -0.12), (1, 0)], u)), float(ease([(0, 0), (0.55, 0.22), (1, 0)], u))])
        for s in 'LR': p.add(f'{s}_thigh', [float(ease([(0, 20), (0.55, -30), (1, 20)], u)), 0, 0])
        return p
    out['attack'] = bake(J, pos, sample(attack, 0.85, False), 0.85, False, {'source': 'video', 'video': '203f70c5', 'frames': [62, 124], 'note': 'screech (62-90) and forward wing sweep (109-124) keyed as poses', 'hit_at': 0.55})

    def wings(p, fold, flail, t):
        el = 25 * np.sin(t * 14) * flail - 10 * fold
        wing(p, el, max(fold, 0) , 0)
        if fold > 0.01: mirror(p, 'arm', [0, 40 * fold, -50 * fold])

    def legfold(p, k, t):
        for s in 'LR': p.add(f'{s}_thigh', [-30 * k + np.sin(t * 18) * 10 * k, 0, 0])
    reactions('bat', J, pos, out, 'chest', 'head', wings, legfold, hov)
    return out


# ── moth ────────────────────────────────────────────────────────────────────────────────────────────────────
def moth(J, pos):
    out = {}
    BEAT = 16 / 24.0
    # ecc03df8 93-115: forewing elevation relative to the mesh's rest (wings modelled raised, ~37° up): 0 = up, -34 = level
    ELEV = [(0, 0), (3, -14), (6, -34), (8, -36), (10, -24), (13, -4), (16, 0)]

    def flap(p, el, t):
        mirror(p, 'fwing', [0, 0, el]); mirror(p, 'fwing2', [0, 0, el * 0.25])
        mirror(p, 'hwing', [0, 0, el * 0.7])
        mirror(p, 'ant', [np.sin(t * 4) * 5, 0, np.sin(t * 3) * 4])
        for i, l in enumerate(['l1', 'l2', 'l3']): mirror(p, l, [np.sin(t * 2 + i) * 6, 0, 0])
        p.root = np.array([0, -el / 36 * 0.04, 0])

    def fly(t):
        p = Pose(); fr = (t / BEAT) * 16
        flap(p, float(catmull(ELEV, fr, 16)), t); return p
    out['fly'] = bake(J, pos, sample(fly, BEAT, True), BEAT, True, {'source': 'video', 'video': 'ecc03df8', 'frames': [93, 115], 'note': 'forewing elevation over one beat, front view'})
    out['idle'] = out['fly']

    def attack(t, dur=0.6):
        # a zap: the moth rears back, wings snap up, then darts forward with the antennae pointed (authored)
        u = t / dur; p = Pose()
        el = float(ease([(0, 0), (0.3, 8), (0.5, -40), (1, 0)], u)); flap(p, el, t)
        p.add('root', [float(ease([(0, 0), (0.3, -20), (0.55, 25), (1, 0)], u)), 0, 0])
        mirror(p, 'ant', [float(ease([(0, 0), (0.45, 30), (1, 0)], u)), 0, 0])
        p.root = p.root + np.array([0, 0, float(ease([(0, 0), (0.55, 0.25), (1, 0)], u))])
        return p
    out['attack'] = bake(J, pos, sample(attack, 0.6, False), 0.6, False, {'source': 'authored', 'hit_at': 0.55})

    def wings(p, fold, flail, t):
        flap(p, -30 * abs(np.sin(t * 16)) * flail + 20 * fold, t)

    def legfold(p, k, t):
        for l in ['l1', 'l2', 'l3']: mirror(p, l, [-25 * k, 0, 0])
    reactions('moth', J, pos, out, 'thorax', 'head', wings, legfold, 0.0)
    return out


def make(kind, J, pos):
    return {'mantis': mantis, 'wasp': wasp, 'bat': bat, 'moth': moth}[kind](J, pos)
