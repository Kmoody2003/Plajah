"""Train the Plajah pose lifter: MediaPipe's per-frame output from one camera -> a corrected 3D body.

Data: rows written by the mocap lab's multi-view renderer (labs/mocap/multiview.ts `generate`), CMU motion on Plajah
characters, at D:/Plajah Models/mocap/lifter-data/<set>/<clip>.f32 + .json. Each row is one camera at one frame
(layout in the .json). Licence-clean: CMU data (may ship inside products, never resold), our own renders, our own
architecture trained from scratch; no third-party weights.

Model: a small residual MLP over a short window of frames (default 9, centred). Input per frame: MediaPipe's 33
picture points as camera rays relative to the hips and scaled by the torso, their visibility, and MediaPipe's 33
world points (metres, hip-centred). Output: 15 joints relative to the hips in the camera's frame (x right, y up,
z toward the camera), divided by the hip-to-neck length (proportion-free; the solver measures bone lengths itself).

Export: a JSON header + float16 weights, run by services/mocap/lifter.ts in the browser (no ONNX runtime needed).

    "D:/Plajah Runtime/tela-py/Scripts/python.exe" scripts/mocap/train_lifter.py --set v1 --out public/models/mocap/lifter-v1
"""
import argparse, glob, json, math, os, random, struct, time
import numpy as np
import torch
import torch.nn as nn

ap = argparse.ArgumentParser()
ap.add_argument('--data', default='D:/Plajah Models/mocap/lifter-data')
ap.add_argument('--set', default='v1')
ap.add_argument('--out', default='public/models/mocap/lifter-v1')
ap.add_argument('--window', type=int, default=9)
ap.add_argument('--causal', action='store_true', help='past frames only (live capture): the window ends on the frame being lifted')
ap.add_argument('--hidden', type=int, default=512)
ap.add_argument('--blocks', type=int, default=2)
ap.add_argument('--epochs', type=int, default=40)
ap.add_argument('--batch', type=int, default=1024)
ap.add_argument('--lr', type=float, default=1e-3)
ap.add_argument('--val', type=float, default=0.12, help='share of performers held out for validation')
ap.add_argument('--seed', type=int, default=7)
args = ap.parse_args()
torch.manual_seed(args.seed); random.seed(args.seed); np.random.seed(args.seed)
dev = 'cuda' if torch.cuda.is_available() else 'cpu'

# MediaPipe left/right landmark pairs and our joint order (must match labs/mocap/multiview.ts JOINT_ORDER).
MP_SWAP = list(range(33))
for a, b in [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16), (17, 18), (19, 20), (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]:
    MP_SWAP[a], MP_SWAP[b] = b, a
JOINTS = ['hip', 'neck', 'head', 'lShldr', 'lForeArm', 'lHand', 'rShldr', 'rForeArm', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot']
J_SWAP = [JOINTS.index({'l': 'r', 'r': 'l'}[j[0]] + j[1:] if j[0] in 'lr' and j[1].isupper() else j) for j in JOINTS]
assert J_SWAP[JOINTS.index('lHand')] == JOINTS.index('rHand') and J_SWAP[0] == 0
BONES = [('lShldr', 'lForeArm'), ('lForeArm', 'lHand'), ('rShldr', 'rForeArm'), ('rForeArm', 'rHand'),
         ('lThigh', 'lShin'), ('lShin', 'lFoot'), ('rThigh', 'rShin'), ('rShin', 'rFoot'), ('hip', 'neck')]
BI = [(JOINTS.index(a), JOINTS.index(b)) for a, b in BONES]
FEAT = 33 * 2 + 33 + 33 * 3  # rays, visibility, world


def features(rows, W, H):
    """rows: (n, 261) one camera's frames in order -> (n, FEAT) features, found mask, torso scale (rays)."""
    pts = rows[:, 0:99].reshape(-1, 33, 3)
    fN, cxN, cyN = rows[:, 255:256], rows[:, 256:257], rows[:, 257:258]
    rx = (pts[:, :, 0] - cxN) / fN
    ry = -(pts[:, :, 1] - cyN) * (H / W) / fN  # y up
    hip = np.stack([(rx[:, 23] + rx[:, 24]) / 2, (ry[:, 23] + ry[:, 24]) / 2], 1)
    sh = np.stack([(rx[:, 11] + rx[:, 12]) / 2, (ry[:, 11] + ry[:, 12]) / 2], 1)
    torso = np.maximum(np.linalg.norm(sh - hip, axis=1, keepdims=True), 1e-3)
    r2 = np.stack([(rx - hip[:, :1]) / torso, (ry - hip[:, 1:]) / torso], 2)  # (n,33,2)
    vis = pts[:, :, 2]
    w = rows[:, 99:198].reshape(-1, 33, 3) * np.array([1, -1, -1], np.float32)  # MediaPipe axes -> y up, z toward camera
    found = rows[:, 260] > 0.5
    f = np.concatenate([r2.reshape(-1, 66), vis, w.reshape(-1, 99)], 1).astype(np.float32)
    f[~found] = 0
    return f, found


def target(rows):
    t = rows[:, 198:243].reshape(-1, 15, 3)
    rel = t - t[:, :1]
    scale = np.linalg.norm(rel[:, 1], axis=1).reshape(-1, 1, 1)  # hip -> neck
    return (rel / np.maximum(scale, 1e-3)).astype(np.float32)


def fill(f, found):
    """Missing frames take the nearest found frame (so a window never sees zeros mid-take)."""
    idx = np.where(found)[0]
    if len(idx) == 0:
        return f
    near = idx[np.clip(np.searchsorted(idx, np.arange(len(f))), 0, len(idx) - 1)]
    prev = idx[np.clip(np.searchsorted(idx, np.arange(len(f))) - 1, 0, len(idx) - 1)]
    pick = np.where(np.abs(prev - np.arange(len(f))) <= np.abs(near - np.arange(len(f))), prev, near)
    return f[pick]


def flip_feat(f):
    f = f.reshape(-1, FEAT).copy()
    r2 = f[:, :66].reshape(-1, 33, 2)[:, MP_SWAP]; r2[:, :, 0] *= -1
    vis = f[:, 66:99][:, MP_SWAP]
    w = f[:, 99:].reshape(-1, 33, 3)[:, MP_SWAP]; w[:, :, 0] *= -1
    return np.concatenate([r2.reshape(-1, 66), vis, w.reshape(-1, 99)], 1)


def flip_tgt(t):
    t = t[:, J_SWAP].copy(); t[:, :, 0] *= -1
    return t


# ── Load ───────────────────────────────────────────────────────────────────────────────────────────────────
files = sorted(glob.glob(os.path.join(args.data, args.set, '*.json')))
subjects = sorted({os.path.basename(f).split('_')[0] for f in files})
rng = random.Random(args.seed)
val_subj = set(rng.sample(subjects, max(1, round(len(subjects) * args.val))))
half = args.window // 2
sets = {'train': ([], [], []), 'val': ([], [], [])}
raw_val = []  # MediaPipe's own 3D for the val centres, for the baseline
for jf in files:
    meta = json.load(open(jf))
    S = meta['layout']['size']; C = meta['cams']; n = meta['frames']
    a = np.fromfile(jf[:-5] + '.f32', dtype=np.float32).reshape(n, C, S)
    split = 'val' if meta['id'].split('_')[0] in val_subj else 'train'
    for c in range(C):
        rows = a[:, c]
        f, found = features(rows, meta['width'], meta['height'])
        if found.sum() < args.window:
            continue
        f = fill(f, found)
        t = target(rows)
        pad = np.concatenate([np.repeat(f[:1], args.window - 1, 0), f]) if args.causal else np.concatenate([np.repeat(f[:1], half, 0), f, np.repeat(f[-1:], half, 0)])
        win = np.lib.stride_tricks.sliding_window_view(pad, (args.window, FEAT)).reshape(n, args.window * FEAT)
        keep = np.where(found)[0]
        X, Y, K = sets[split]
        X.append(win[keep]); Y.append(t[keep]); K.append(np.full(len(keep), len(K)))
        if split == 'val':
            raw_val.append(f[keep, 99:].reshape(-1, 33, 3))

def cat(s):
    X, Y, _ = sets[s]
    return np.concatenate(X), np.concatenate(Y)

Xtr, Ytr = cat('train'); Xva, Yva = cat('val')
# Mirror every training window (people move both ways round).
Xtr = np.concatenate([Xtr, flip_feat(Xtr.reshape(-1, FEAT)).reshape(Xtr.shape)]); Ytr = np.concatenate([Ytr, flip_tgt(Ytr)])
print(f'clips {len(files)}, performers {len(subjects)} (val {sorted(val_subj)}), train windows {len(Xtr)}, val {len(Xva)}', flush=True)

mu = Xtr.mean(0); sd = Xtr.std(0) + 1e-4
Xtr_t = torch.tensor((Xtr - mu) / sd, device=dev); Ytr_t = torch.tensor(Ytr, device=dev)
Xva_t = torch.tensor((Xva - mu) / sd, device=dev); Yva_t = torch.tensor(Yva, device=dev)


# ── Model ──────────────────────────────────────────────────────────────────────────────────────────────────
class Block(nn.Module):
    def __init__(s, h, p=0.1):
        super().__init__(); s.n = nn.LayerNorm(h); s.a = nn.Linear(h, h); s.b = nn.Linear(h, h); s.d = nn.Dropout(p)
    def forward(s, x):
        return x + s.b(s.d(nn.functional.gelu(s.a(s.n(x)), approximate='tanh')))

class Lifter(nn.Module):
    def __init__(s, i, h, nb):
        super().__init__(); s.inp = nn.Linear(i, h); s.blocks = nn.ModuleList([Block(h) for _ in range(nb)]); s.n = nn.LayerNorm(h); s.out = nn.Linear(h, 45)
    def forward(s, x):
        x = nn.functional.gelu(s.inp(x), approximate='tanh')
        for b in s.blocks: x = b(x)
        return s.out(s.n(x)).view(-1, 15, 3)

model = Lifter(args.window * FEAT, args.hidden, args.blocks).to(dev)
opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
steps = args.epochs * math.ceil(len(Xtr_t) / args.batch)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.1)
BA = torch.tensor([b[0] for b in BI], device=dev); BB = torch.tensor([b[1] for b in BI], device=dev)

def bone_deg(p, t):
    dp = nn.functional.normalize(p[:, BB] - p[:, BA], dim=-1); dt = nn.functional.normalize(t[:, BB] - t[:, BA], dim=-1)
    return torch.rad2deg(torch.acos((dp * dt).sum(-1).clamp(-1, 1)))  # (n, bones)

def loss_fn(p, t):
    dp = nn.functional.normalize(p[:, BB] - p[:, BA], dim=-1); dt = nn.functional.normalize(t[:, BB] - t[:, BA], dim=-1)
    return (p - t).norm(dim=-1).mean() + 0.5 * (1 - (dp * dt).sum(-1)).mean()

# Baseline: MediaPipe's own world points as bones (same joints, same metric).
MPJ = {'lShldr': 11, 'lForeArm': 13, 'lHand': 15, 'rShldr': 12, 'rForeArm': 14, 'rHand': 16, 'lThigh': 23, 'lShin': 25, 'lFoot': 27, 'rThigh': 24, 'rShin': 26, 'rFoot': 28}
rv = torch.tensor(np.concatenate(raw_val), device=dev)
mp = torch.zeros(len(rv), 15, 3, device=dev)
for j, i in MPJ.items(): mp[:, JOINTS.index(j)] = rv[:, i]
mp[:, 0] = (rv[:, 23] + rv[:, 24]) / 2; mp[:, 1] = (rv[:, 11] + rv[:, 12]) / 2; mp[:, 2] = rv[:, 0]
base = bone_deg(mp, Yva_t)
print(f'MediaPipe alone on val: {base.mean():.1f} deg  per bone ' + ' '.join(f'{a}-{b} {v:.1f}' for (a, b), v in zip(BONES, base.mean(0).tolist())), flush=True)

t0 = time.time(); best = (1e9, None)
for ep in range(args.epochs):
    model.train(); perm = torch.randperm(len(Xtr_t), device=dev); tot = 0
    for k in range(0, len(perm), args.batch):
        idx = perm[k:k + args.batch]
        x = Xtr_t[idx] + 0.02 * torch.randn_like(Xtr_t[idx])  # light input noise
        l = loss_fn(model(x), Ytr_t[idx]); opt.zero_grad(); l.backward(); opt.step(); sched.step(); tot += l.item() * len(idx)
    model.eval()
    with torch.no_grad():
        pv = torch.cat([model(Xva_t[k:k + 8192]) for k in range(0, len(Xva_t), 8192)])
        d = bone_deg(pv, Yva_t); mean = d.mean().item()
    if mean < best[0]: best = (mean, {k: v.detach().clone() for k, v in model.state_dict().items()}, d.mean(0).tolist())
    if ep % 5 == 4 or ep == args.epochs - 1:
        print(f'epoch {ep + 1}: train loss {tot / len(perm):.4f}  val bones {mean:.1f} deg  ({time.time() - t0:.0f}s)', flush=True)

model.load_state_dict(best[1])
print(f'best val: {best[0]:.1f} deg (MediaPipe alone {base.mean():.1f})  per bone ' + ' '.join(f'{a}-{b} {v:.1f}' for (a, b), v in zip(BONES, best[2])), flush=True)

# ── Export: JSON header + float16 weights ──────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
tensors, blobs, off = [], [], 0
def put(name, arr):
    global off
    a = np.ascontiguousarray(arr, dtype=np.float16); tensors.append({'name': name, 'shape': list(arr.shape), 'offset': off}); blobs.append(a.tobytes()); off += a.size
put('mu', mu); put('sd', sd)
for k, v in model.state_dict().items(): put(k, v.cpu().numpy())
header = {
    'format': 'plajah-lifter/1', 'window': args.window, 'causal': bool(args.causal), 'feat': FEAT, 'hidden': args.hidden, 'blocks': args.blocks,
    'joints': JOINTS, 'tensors': tensors, 'valBoneDeg': round(best[0], 2), 'mediapipeValBoneDeg': round(base.mean().item(), 2),
    'trainedOn': {'set': args.set, 'clips': len(files), 'performers': len(subjects), 'valPerformers': sorted(val_subj), 'windows': int(len(Xtr))},
    'data': 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu, NSF EIA-0196217) rendered on Plajah characters; model trained from scratch by Plajah.',
}
json.dump(header, open(args.out + '.json', 'w'), indent=1)
open(args.out + '.bin', 'wb').write(b''.join(blobs))
print(f'wrote {args.out}.json + .bin ({off * 2 / 1e6:.1f} MB)', flush=True)
