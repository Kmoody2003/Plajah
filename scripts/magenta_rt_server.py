#!/usr/bin/env python3
"""Chora Studio sidecar for Google Magenta RealTime 2 (MRT2).

Code: Apache 2.0 (magenta/magenta-realtime). Weights: CC-BY 4.0 (google/magenta-realtime-2).
Outputs carry the attribution line MAGENTA_ATTRIBUTION in services/melos/generation/magentaRt.ts.

Offline render server: Node's music-lab adapter (services/melos/generation/adapters.ts) POSTs a
JSON request, this process renders 48 kHz stereo audio with MagentaRT2Jax and answers with a WAV.

Setup on Windows (JAX has no native Windows CUDA build, so run it inside WSL2 Ubuntu):
    python3.12 -m venv ~/mrt && source ~/mrt/bin/activate
    pip install "magenta-rt[jax]" "jax[cuda13]"     # CPU only: pip install "magenta-rt[jax]"
    mrt models init && mrt checkpoints download       # ~450 MB small, ~2.5 GB base
    MRT_SIZE=mrt2_small MRT_TOKEN=<secret> python scripts/magenta_rt_server.py
Then in the Plajah server env: MELOS_MAGENTA_URL=http://127.0.0.1:8765  MELOS_MAGENTA_TOKEN=<secret>

On Apple Silicon use MRT_BACKEND=mlx (pip install "magenta-rt[mlx]").
mrt2_base (2.4B) needs far more memory than an 8 GB laptop GPU; mrt2_small (230M) is the default.

Env: MRT_SIZE (mrt2_small|mrt2_base), MRT_BACKEND (jax|mlx), MRT_HOST (127.0.0.1), MRT_PORT (8765),
     MRT_TOKEN (required when MRT_HOST is not loopback).
"""

import base64
import hmac
import io
import json
import logging
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

FRAME_RATE = 25
MAX_SECONDS = 120
MAX_BODY = 32 * 1024 * 1024
NOTES_KEY = "pianoroll_with_onsets_tokens"
DRUMS_KEY = "drum_pianoroll_tokens"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mrt-sidecar")

SIZE = os.environ.get("MRT_SIZE", "mrt2_small")
BACKEND = os.environ.get("MRT_BACKEND", "jax")
HOST = os.environ.get("MRT_HOST", "127.0.0.1")
PORT = int(os.environ.get("MRT_PORT", "8765"))
TOKEN = os.environ.get("MRT_TOKEN", "")

if HOST not in ("127.0.0.1", "localhost", "::1") and not TOKEN:
    sys.exit("MRT_TOKEN is required when MRT_HOST is not a loopback address")
if SIZE not in ("mrt2_small", "mrt2_base"):
    sys.exit("MRT_SIZE must be mrt2_small or mrt2_base")


def load_system():
    from magenta_rt.config import MUSICCOCA
    if BACKEND == "mlx":
        from magenta_rt import MagentaRT2Mlx as System
    else:
        from magenta_rt import MagentaRT2Jax as System
    log.info("Loading %s on %s (first load compiles; can take minutes)", SIZE, BACKEND)
    return System(size=SIZE), MUSICCOCA.key


MRT, STYLE_KEY = load_system()
LOCK = threading.Lock()  # one render at a time: the model holds the whole GPU


def blend_styles(req):
    """Weighted average of MusicCoCa embeddings from the prompt, extra styles and reference audio."""
    from magenta_rt.audio import Waveform
    seed = int(req.get("seed", 0))
    parts = []
    prompt = (req.get("prompt") or "").strip()
    if prompt:
        parts.append((MRT.embed_style(prompt, use_mapper=True, seed=seed), float(req.get("promptWeight", 1.0))))
    for i, style in enumerate(req.get("styles") or []):
        parts.append((MRT.embed_style(style["text"], use_mapper=True, seed=seed + i + 1), float(style["weight"])))
    if req.get("styleAudio"):
        raw = base64.b64decode(req["styleAudio"], validate=True)
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as handle:
            handle.write(raw)
            path = handle.name
        try:
            parts.append((MRT.embed_style(Waveform.from_file(path)), float(req.get("audioStyleWeight", 1.0))))
        finally:
            os.unlink(path)
    parts = [(np.asarray(e, dtype=np.float32), w) for e, w in parts if w > 0]
    if not parts:
        raise ValueError("Give a prompt, a style or reference audio with weight above 0")
    total = sum(w for _, w in parts)
    return sum(e * w for e, w in parts) / total


def pianoroll(run, auto_strum):
    roll = [0] * 128
    for key in run["held"]:
        roll[int(key)] = 3 if auto_strum else 1
    for key in run["onset"]:
        roll[int(key)] = 2
    return roll


def render(req):
    from magenta_rt.audio import concatenate
    seconds = float(req["seconds"])
    if not (0 < seconds <= MAX_SECONDS):
        raise ValueError(f"seconds must be in (0, {MAX_SECONDS}]")
    total = int(round(seconds * FRAME_RATE))
    style = blend_styles(req)
    base = {STYLE_KEY: style}
    drums = req.get("drums", "auto")
    if drums == "on":
        base[DRUMS_KEY] = [1]
    elif drums == "off":
        base[DRUMS_KEY] = [0]
    cfg = {k: float(v) for k, v in (req.get("cfg") or {}).items() if k in ("musiccoca", "notes", "drums")}
    kwargs = {"cfg_scales": cfg or None, "temperature": req.get("temperature"), "top_k": req.get("topK")}
    auto_strum = bool(req.get("autoStrum", True))
    runs = req.get("runs") or [{"frames": total, "held": None, "onset": []}]
    if sum(int(r["frames"]) for r in runs) != total:
        raise ValueError("runs must cover exactly seconds * 25 frames")
    state, pieces = None, []
    for run in runs:
        cond = dict(base)
        if run.get("held") is not None:
            cond[NOTES_KEY] = pianoroll(run, auto_strum)
        wav, state = MRT.generate(conditioning=cond, frames=int(run["frames"]), state=state, **kwargs)
        pieces.append(wav)
    out = pieces[0] if len(pieces) == 1 else concatenate(pieces)
    buf = io.BytesIO()
    out.write(buf, format="WAV", subtype="PCM_16")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    server_version = "ChoraMRT2/1"

    def _authorized(self):
        if not TOKEN:
            return True
        got = self.headers.get("Authorization", "")
        return hmac.compare_digest(got.encode(), f"Bearer {TOKEN}".encode())

    def _json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._authorized():
            return self._json(401, {"error": "unauthorized"})
        if self.path == "/health":
            return self._json(200, {"ok": True, "model": SIZE, "backend": BACKEND, "sampleRate": 48000, "busy": LOCK.locked()})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._authorized():
            return self._json(401, {"error": "unauthorized"})
        if self.path != "/generate":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"error": "request too large"})
        try:
            req = json.loads(self.rfile.read(length))
        except ValueError:
            return self._json(400, {"error": "invalid JSON"})
        if not LOCK.acquire(blocking=False):
            return self._json(409, {"error": "Magenta is busy with another render"})
        try:
            wav = render(req)
        except (ValueError, KeyError, TypeError) as err:
            return self._json(400, {"error": str(err)[:300]})
        except Exception:  # model/runtime failure: log locally, keep paths out of the reply
            log.exception("render failed")
            return self._json(500, {"error": "Magenta render failed; see the sidecar log"})
        finally:
            LOCK.release()
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, fmt, *args):
        log.info("%s %s", self.address_string(), fmt % args)


if __name__ == "__main__":
    log.info("Magenta RT 2 sidecar on http://%s:%d (%s, %s)", HOST, PORT, SIZE, BACKEND)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
