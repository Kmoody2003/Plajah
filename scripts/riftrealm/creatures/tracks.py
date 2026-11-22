"""Joint marks from the creatures' motion-study videos (D:/plajah game assets deign from promtps/Shooter/Cyber Forest
Level Assets). Marks are pixels in the 1280×720 frames (frames dumped at 24 fps, numbered from 0), read off grid
overlays (D:/rr_work/creatures/strip.py). Each track says which video, which frames and what was marked; clips.py turns
them into foot / head / tail targets and solves them onto the skeleton.

Where a value is a judgement rather than a mark (the far legs hidden behind the near ones, a phase lead) it says so.
"""
import numpy as np


def rel(marks, origin, px_per_m, flip_y=True):
    """Pixel marks → metres from `origin` (z forward = +x in frame, y up)."""
    ox, oy = origin
    return [np.array([(x - ox) / px_per_m, (oy - y) / px_per_m]) for x, y in marks]


# ── Electric Wolf: "Wolf creature running motion study" be8ff43f ─────────────────────────────────────────────
# Frames 160–171 (the skeleton-overlay pass, side view, wolf facing right so the near legs are its RIGHT legs) are one
# gallop cycle: 160 and 172 match. Marks (frame, then pixel x, y of: shoulder joint, hip joint, near-front paw,
# near-hind paw, skull centre, tail tip). Scale: withers-to-ground 430 px for the mesh's 1.05 m → 410 px/m; the
# shoulder joint stands 300 px (0.73 m) above the ground, the hip 325 px (0.79 m).
WOLF_RUN_MARKS = {
    #       shoulder     hip         near front   near hind    skull       tail tip
    160: [(740, 360), (500, 345), (920, 670), (260, 550), (980, 320), (210, 375)],
    162: [(740, 360), (500, 350), (790, 660), (330, 540), (980, 310), (210, 390)],
    164: [(740, 345), (480, 330), (690, 650), (450, 580), (970, 290), (220, 400)],
    166: [(740, 345), (480, 325), (610, 650), (560, 595), (970, 280), (220, 410)],
    168: [(740, 330), (470, 315), (800, 585), (620, 620), (970, 235), (210, 345)],
    170: [(740, 345), (480, 320), (950, 610), (540, 640), (970, 260), (200, 345)],
}
PX = 410.0


def _wolf_run():
    fr = sorted(WOLF_RUN_MARKS)
    t = [f - fr[0] for f in fr]
    front, hind, lift, head, tail = [], [], [], [], []
    sh_mean = np.mean([WOLF_RUN_MARKS[f][0][1] for f in fr])
    for f, ti in zip(fr, t):
        sh, hp, nf, nh, sk, tt = WOLF_RUN_MARKS[f]
        front.append((ti, rel([nf], sh, PX)[0]))
        hind.append((ti, rel([nh], hp, PX)[0]))
        lift.append((ti, (sh_mean - sh[1]) / PX))
        # neck angle from the shoulder to the skull centre; + = nose down relative to the cycle's mean
        a = np.degrees(np.arctan2(sh[1] - sk[1], sk[0] - sh[0]))
        head.append((ti, a))
        # tail: the tip's drop below the hip; a higher tip = the tail raised (+X pitch raises a tail)
        tail.append((ti, (tt[1] - hp[1])))
    am = np.mean([h for _, h in head]); tm = np.mean([v for _, v in tail])
    head = [(ti, -(h - am)) for ti, h in head]
    tail = [(ti, -(v - tm) / 4.0) for ti, v in tail]
    return {
        'video': 'be8ff43f', 'frames': [160, 171], 'period': 12, 'duration': 0.5,
        'note': 'near-side paws, shoulder/hip, skull and tail tip marked on 6 frames of one gallop cycle; far-side legs '
                'follow the near ones 0.12 cycle later (transverse gallop: hidden behind the near legs in the frames)',
        'foot': {'F': front, 'H': hind}, 'height': {'F': 0.73, 'H': 0.79},
        'phase': {'RF': 0.0, 'RH': 0.0, 'LF': -0.12, 'LH': -0.12},
        'lift': lift, 'head': head, 'tail': tail,
        # the pastern curl in swing (front: the paw folds back at 166–168; hind: toes trail at 160–162), read off the frames
        'pastern': {'F': [(0, 0), (2, 0), (4, 5), (6, 25), (8, 55), (10, 15)], 'H': [(0, -30), (2, -40), (4, -20), (6, 0), (8, 0), (10, 0)]},
        'flex': 4.0,
    }


# ── Lumen Deer: "Alien deer mammal motion study" 118ce3df, frames 171-207 (skeleton pass, side view, walking right) ──
# The overlay is too busy to mark every joint on every frame, so the walk is built from what was measured on it:
#   cycle 32 frames (1.33 s): the front pair's spread pose recurs every 16 frames (171, 187, 203), alternating sides;
#   front hooves spread 190 px at full stride (±95 px about the shoulder; shoulder joint ≈ 310 px above the ground)
#   → reach ±0.31 shoulder heights; hind ±0.28; hoof lift in swing 34 px (175, 191) → 0.11; duty ≈ 0.65;
#   lateral-sequence footfalls (each hind lands ~¼ cycle before the front on its side: 175 / 179, 191 / 195).
# Foot paths below are generated from those numbers (fractions of shoulder / hip height).
def _deer_walk():
    def path(reach, lift, n=16, duty=0.65):
        out = []
        for i in range(n):
            u = i / n
            if u < duty:
                s = u / duty; z = reach - 2 * reach * s; y = -1.0
            else:
                s = (u - duty) / (1 - duty); e = s * s * (3 - 2 * s); z = -reach + 2 * reach * e; y = -1.0 + np.sin(np.pi * s) * lift
            out.append((u * 32, np.array([z, y])))
        return out
    return {
        'video': '118ce3df', 'frames': [171, 207], 'period': 32, 'duration': 32 / 24.0, 'norm': True,
        'note': 'cycle length, stride reach, hoof lift, duty and footfall order measured on frames 171-207; foot paths generated from them',
        'foot': {'F': path(0.31, 0.11), 'H': path(0.28, 0.10)}, 'height': {'F': 1.0, 'H': 1.0},
        'phase': {'LH': 0.0, 'LF': -0.25, 'RH': -0.5, 'RF': -0.75},
        'lift': [(i * 4, 0.012 * np.cos(i * 4 / 16 * 2 * np.pi)) for i in range(8)],
        'head': [(i * 4, 4 * np.sin(i * 4 / 16 * 2 * np.pi)) for i in range(8)],
        'tail': [(i * 4, 3 * np.sin(i * 4 / 32 * 2 * np.pi)) for i in range(8)],
        'pastern': {'F': [(0, 0), (16, 0), (20.8, 0), (24, 45), (28, 30), (31, 0)], 'H': [(0, 0), (20.8, 0), (24, 30), (28, 15), (31, 0)]},
        'flex': 1.5,
    }


TRACKS = {'wolf': {'run': _wolf_run()}, 'deer': {'walk': _deer_walk()}}

# ── Wolf attack: the rearing lunge-bite at the end of be8ff43f (frames 312–332) ──────────────────────────────────
# 312 running; 316–320 rears ~30° (hip→shoulder line 10° → 38°), front paws come up to the chest, jaws open wide
# (318–330); 322–328 the front legs strike out forward (paw ~0.8 m ahead of the shoulder, 0.2 m below it); 332 drops
# toward the camera. Hind paws stay planted. Timing scaled from 20 frames (0.83 s) to 0.75 s.
ATTACKS = {
    'wolf': {
        'attack': {
            'source': 'video', 'video': 'be8ff43f', 'frames': [312, 332], 'duration': 0.75, 'hit_at': 0.72,
            'note': 'rear angle, paw reach and jaw timing marked on frames 312-332 (every 2nd); hind feet planted',
            'rear': [(0, 0), (0.3, 28), (0.7, 20), (1, 0)],
            'fwd': [(0, 0), (0.35, 0.08), (0.7, 0.32), (1, 0)],
            'lift': [(0, 0), (0.3, 0.05), (0.7, 0.08), (1, 0)],
            'head': [(0, 0), (0.3, -12), (0.7, 10), (1, 0)],
            'jaw': [(0, 0), (0.25, 30), (0.65, 34), (0.8, 4), (1, 0)],
            'feet': {'F': [(0, (0, 0)), (0.3, (0.22, 0.5)), (0.65, (0.62, 0.42)), (0.85, (0.3, 0.1)), (1, (0, 0))],
                     'H': [(0, (0, 0)), (1, (0, 0))]},
            'pastern': {'F': [(0, 0), (0.3, 45), (0.65, 8), (1, 0)], 'H': [(0, 0), (1, 0)]},
            'tail': [(0, 0), (0.5, -12), (1, 0)],
        },
    },
    # The deer's footage has no attack: an authored antler butt (head drops and charges, then tosses up), for prey that
    # kicks back when cornered
    'deer': {
        'attack': {
            'source': 'authored', 'duration': 0.8, 'hit_at': 0.62,
            'rear': [(0, 0), (0.3, -6), (0.6, 4), (1, 0)],
            'fwd': [(0, 0), (0.3, -0.05), (0.6, 0.35), (1, 0)],
            'lift': [(0, 0), (0.3, -0.06), (0.6, 0.03), (1, 0)],
            'head': [(0, 0), (0.3, 40), (0.55, 30), (0.7, -22), (1, 0)],
            'jaw': [(0, 0), (1, 0)],
            'feet': {'F': [(0, (0, 0)), (0.3, (0.0, 0.0)), (0.6, (0.2, 0.12)), (0.8, (0.3, 0.0)), (1, (0, 0))],
                     'H': [(0, (0, 0)), (1, (0, 0))]},
            'pastern': {'F': [(0, 0), (0.6, 30), (0.8, 0), (1, 0)], 'H': [(0, 0), (1, 0)]},
            'tail': [(0, 0), (0.5, 12), (1, 0)],
        },
    },
}
