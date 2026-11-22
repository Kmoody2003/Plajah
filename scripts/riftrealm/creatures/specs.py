"""Skeletons for the Elderwood creatures, laid onto each mesh (metres in the GLB's own space: feet on y = 0, facing +Z).

Each joint: (name, parent, (x, y, z), options). Joints whose name starts with "L_" are the creature's left side
(x > 0) and are mirrored to "R_" automatically. Options:
  tip=(x, y, z)  the end of the bone's segment when it has no child to point at (skinning uses the segment)
  fit='limb'     centre the joint in the mesh's cross-section at its height (legs), 'none' = keep as placed
  r=0.05         seed radius for the skin weights (metres)
  rigid=True     the bone holds its vertices rigidly (head, mandibles)
Positions come from orthographic guide renders of each mesh (front / side / top with a 0.1 m grid) checked against the
turnarounds; for the bat the wing-finger layout follows "Bat motion study and skeleton" (faa32975), whose overlay
shows the arm, the thumb, three long fingers and the legs.
"""

QUAD_NOTE = 'quadruped: pelvis → spine → chest → neck → head (+jaw), tail chain, scapula/shoulder/elbow/wrist/paw, hip/stifle/hock/paw'

SPECS = {
    'wolf': dict(kind='quadruped', joints=[
        ('root', None, (0, 0, 0), {}),
        ('pelvis', 'root', (0, 0.90, -0.42), {}),
        ('spine1', 'pelvis', (0, 0.95, -0.12), {}),
        ('chest', 'spine1', (0, 0.98, 0.20), {}),
        ('neck', 'chest', (0, 1.02, 0.45), {}),
        ('head', 'neck', (0, 1.02, 0.64), {'tip': (0, 0.95, 0.98)}),
        ('jaw', 'head', (0, 0.90, 0.70), {'tip': (0, 0.83, 0.93), 'r': 0.03}),
        ('tail1', 'pelvis', (0, 0.88, -0.68), {}),
        ('tail2', 'tail1', (0, 0.62, -0.82), {}),
        ('tail3', 'tail2', (0, 0.35, -0.92), {'tip': (0, 0.12, -1.0)}),
        ('L_scap', 'chest', (0.11, 0.95, 0.20), {}),
        ('L_arm', 'L_scap', (0.17, 0.68, 0.22), {'fit': 'limb'}),
        ('L_fore', 'L_arm', (0.18, 0.46, 0.20), {'fit': 'limb'}),
        ('L_wrist', 'L_fore', (0.20, 0.16, 0.30), {'fit': 'limb'}),
        ('L_paw', 'L_wrist', (0.21, 0.05, 0.42), {'tip': (0.21, 0.02, 0.52)}),
        ('L_thigh', 'pelvis', (0.14, 0.85, -0.42), {}),
        ('L_shin', 'L_thigh', (0.17, 0.55, -0.34), {'fit': 'limb'}),
        ('L_hock', 'L_shin', (0.17, 0.30, -0.53), {'fit': 'limb'}),
        ('L_foot', 'L_hock', (0.21, 0.05, -0.42), {'tip': (0.22, 0.02, -0.30)}),
    ]),
    'deer': dict(kind='quadruped', joints=[
        ('root', None, (0, 0, 0), {}),
        ('pelvis', 'root', (0, 1.00, -0.30), {}),
        ('spine1', 'pelvis', (0, 1.02, 0.02), {}),
        ('chest', 'spine1', (0, 1.00, 0.36), {}),
        ('neck', 'chest', (0, 1.16, 0.50), {}),
        ('neck2', 'neck', (0, 1.36, 0.58), {}),
        ('head', 'neck2', (0, 1.50, 0.66), {'tip': (0, 1.42, 0.98)}),
        ('L_ear', 'head', (0.07, 1.56, 0.58), {'tip': (0.13, 1.68, 0.28), 'r': 0.03}),
        ('tail1', 'pelvis', (0, 0.98, -0.42), {}),
        ('tail2', 'tail1', (0, 0.80, -0.60), {}),
        ('tail3', 'tail2', (0, 0.62, -0.82), {'tip': (0, 0.53, -1.0)}),
        ('L_scap', 'chest', (0.09, 1.05, 0.40), {}),
        ('L_arm', 'L_scap', (0.11, 0.86, 0.45), {'fit': 'limb'}),
        ('L_fore', 'L_arm', (0.11, 0.64, 0.43), {'fit': 'limb'}),
        ('L_wrist', 'L_fore', (0.115, 0.30, 0.48), {'fit': 'limb'}),
        ('L_paw', 'L_wrist', (0.117, 0.07, 0.53), {'tip': (0.117, 0.01, 0.60)}),
        ('L_thigh', 'pelvis', (0.11, 0.95, -0.32), {}),
        ('L_shin', 'L_thigh', (0.125, 0.64, -0.20), {'fit': 'limb'}),
        ('L_hock', 'L_shin', (0.125, 0.45, -0.38), {'fit': 'limb'}),
        ('L_foot', 'L_hock', (0.127, 0.07, -0.28), {'tip': (0.127, 0.01, -0.20)}),
    ]),
    'mantis': dict(kind='insect', joints=[
        ('root', None, (0, 0, 0), {}),
        ('thorax', 'root', (0, 0.70, 0.04), {}),
        ('abd1', 'thorax', (0, 0.72, -0.22), {}),
        ('abd2', 'abd1', (0, 0.72, -0.48), {'tip': (0, 0.65, -0.72)}),
        ('prothorax', 'thorax', (0, 0.95, 0.15), {}),
        ('neck', 'prothorax', (0, 1.52, 0.27), {}),
        ('head', 'neck', (0, 1.68, 0.33), {'tip': (0, 1.80, 0.42)}),
        ('L_ant', 'head', (0.04, 1.82, 0.36), {'tip': (0.13, 2.0, 0.42), 'r': 0.02}),
        ('L_coxa', 'prothorax', (0.08, 1.42, 0.30), {}),
        ('L_femur', 'L_coxa', (0.26, 1.58, 0.46), {}),
        ('L_tibia', 'L_femur', (0.33, 1.20, 0.62), {'tip': (0.42, 0.82, 0.67)}),
        ('L_f1', 'thorax', (0.08, 0.70, 0.14), {}),
        ('L_f2', 'L_f1', (0.28, 0.72, 0.48), {'fit': 'limb'}),
        ('L_f3', 'L_f2', (0.31, 0.14, 0.55), {'fit': 'limb', 'tip': (0.33, 0.0, 0.62)}),
        ('L_h1', 'thorax', (0.10, 0.65, -0.02), {}),
        ('L_h2', 'L_h1', (0.31, 0.68, -0.28), {'fit': 'limb'}),
        ('L_h3', 'L_h2', (0.34, 0.14, -0.47), {'fit': 'limb', 'tip': (0.36, 0.0, -0.55)}),
    ]),
    'wasp': dict(kind='insect', joints=[
        ('root', None, (0, 0, 0), {}),
        ('thorax', 'root', (0, 0.95, 0.15), {}),
        ('head', 'thorax', (0, 1.00, 0.42), {'tip': (0, 0.90, 0.60)}),
        ('L_ant', 'head', (0.06, 1.08, 0.52), {'tip': (0.10, 0.85, 0.76), 'r': 0.02}),
        ('abd1', 'thorax', (0, 0.85, -0.12), {}),
        ('abd2', 'abd1', (0, 0.75, -0.48), {}),
        ('abd3', 'abd2', (0, 0.45, -0.62), {}),
        ('sting', 'abd3', (0, 0.28, -0.35), {'tip': (0, 0.25, -0.06), 'r': 0.03}),
        ('L_fwing', 'thorax', (0.10, 1.22, 0.12), {}),
        ('L_fwing2', 'L_fwing', (0.22, 1.60, -0.25), {'tip': (0.35, 2.0, -0.58)}),
        ('L_hwing', 'thorax', (0.10, 1.15, 0.0), {'tip': (0.30, 1.45, -0.55)}),
        ('L_l1', 'thorax', (0.08, 0.80, 0.30), {}),
        ('L_l1b', 'L_l1', (0.25, 0.70, 0.42), {'fit': 'limb'}),
        ('L_l1c', 'L_l1b', (0.28, 0.28, 0.42), {'fit': 'limb', 'tip': (0.28, 0.15, 0.45)}),
        ('L_l2', 'thorax', (0.08, 0.78, 0.12), {}),
        ('L_l2b', 'L_l2', (0.22, 0.74, 0.05), {}),
        ('L_l2c', 'L_l2b', (0.36, 0.25, 0.07), {'fit': 'limb', 'tip': (0.43, 0.0, 0.10)}),
        ('L_l3', 'thorax', (0.07, 0.72, -0.02), {}),
        ('L_l3b', 'L_l3', (0.32, 0.66, -0.30), {}),
        ('L_l3c', 'L_l3b', (0.39, 0.20, -0.43), {'fit': 'limb', 'tip': (0.42, 0.0, -0.49)}),
    ]),
    'bat': dict(kind='bat', joints=[
        ('root', None, (0, 0, 0), {}),
        ('pelvis', 'root', (0, 0.30, -0.02), {}),
        ('spine', 'pelvis', (0, 0.45, 0.0), {}),
        ('chest', 'spine', (0, 0.58, 0.02), {}),
        ('head', 'chest', (0, 0.68, 0.08), {'tip': (0, 0.72, 0.22)}),
        ('L_ear', 'head', (0.07, 0.80, 0.03), {'tip': (0.15, 0.89, 0.0), 'r': 0.03}),
        ('L_arm', 'chest', (0.12, 0.60, 0.0), {}),
        ('L_fore', 'L_arm', (0.30, 0.68, 0.02), {}),
        ('L_hand', 'L_fore', (0.56, 0.78, 0.03), {'tip': (0.60, 0.80, 0.03)}),
        ('L_d2', 'L_hand', (0.58, 0.78, 0.03), {}),
        ('L_d2b', 'L_d2', (0.80, 0.62, 0.0), {'tip': (1.0, 0.42, -0.02)}),
        ('L_d3', 'L_hand', (0.58, 0.76, 0.03), {}),
        ('L_d3b', 'L_d3', (0.68, 0.48, 0.0), {'tip': (0.78, 0.20, -0.02)}),
        ('L_d4', 'L_hand', (0.56, 0.75, 0.03), {'tip': (0.55, 0.20, -0.02)}),
        ('L_thigh', 'pelvis', (0.10, 0.30, -0.02), {}),
        ('L_shin', 'L_thigh', (0.14, 0.17, 0.0), {'fit': 'limb'}),
        ('L_foot', 'L_shin', (0.135, 0.05, -0.06), {'tip': (0.13, 0.0, 0.0)}),
    ]),
    'moth': dict(kind='insect', joints=[
        ('root', None, (0, 0, 0), {}),
        ('thorax', 'root', (0, 0.72, 0.05), {}),
        ('head', 'thorax', (0, 0.92, 0.15), {'tip': (0, 0.98, 0.30)}),
        ('abd1', 'thorax', (0, 0.50, -0.02), {}),
        ('abd2', 'abd1', (0, 0.25, -0.05), {'tip': (0, 0.0, 0.0)}),
        ('L_ant', 'head', (0.08, 1.00, 0.12), {'tip': (0.45, 1.75, -0.05)}),
        ('L_fwing', 'thorax', (0.15, 0.85, 0.05), {}),
        ('L_fwing2', 'L_fwing', (0.50, 1.20, -0.05), {'tip': (0.95, 1.45, -0.15)}),
        ('L_hwing', 'thorax', (0.15, 0.65, 0.0), {'tip': (0.70, 0.60, -0.10)}),
        ('L_l1', 'thorax', (0.08, 0.60, 0.15), {}),
        ('L_l1b', 'L_l1', (0.12, 0.40, 0.40), {'tip': (0.10, 0.25, 0.47)}),
        ('L_l2', 'thorax', (0.10, 0.55, 0.10), {}),
        ('L_l2b', 'L_l2', (0.25, 0.45, 0.20), {'tip': (0.38, 0.27, 0.30)}),
        ('L_l3', 'thorax', (0.08, 0.50, 0.05), {}),
        ('L_l3b', 'L_l3', (0.18, 0.30, 0.15), {'tip': (0.20, 0.0, 0.15)}),
    ]),
}


def expand(kind):
    """The full joint list with the right side mirrored in: [(name, parent, pos, opts)], parents before children."""
    out = []
    for n, p, pos, o in SPECS[kind]['joints']:
        out.append((n, p, tuple(pos), dict(o)))
        if n.startswith('L_'):
            m = dict(o)
            if 'tip' in m:
                t = m['tip']; m['tip'] = (-t[0], t[1], t[2])
            out.append(('R_' + n[2:], ('R_' + p[2:]) if p and p.startswith('L_') else p, (-pos[0], pos[1], pos[2]), m))
    return out
