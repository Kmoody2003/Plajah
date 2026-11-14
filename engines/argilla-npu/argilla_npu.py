#!/usr/bin/env python3
"""Argilla NPU lane: cut-out and depth on the PC's NPU, so the GPU stays free for the viewport.

Loopback only, numpy and OpenVINO only. The page resizes pictures itself and posts raw RGB, so no
image library or decoder is exposed to outside files. Models load on first use and stay resident.

  GET  /health   devices and models
  POST /cutout   320x320 RGB bytes -> 320x320 uint8 mask
  POST /depth    518x518 RGB bytes -> 518x518 float32 (nearer is larger)
  POST /recognize 224x224 RGB bytes -> JSON score per codex creature
"""

import argparse
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import openvino as ov

MODELS_ROOT = os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models")
RUNTIME_ROOT = os.environ.get("TELA_RUNTIME_ROOT", r"D:\Plajah Runtime")
MODELS = {
    "cutout": {"path": os.path.join(MODELS_ROOT, "u2net", "u2net.onnx"), "size": 320},
    "depth": {"path": os.path.join(MODELS_ROOT, "depth-anything-v2-small", "model.onnx"), "size": 518},
    "recognize": {"path": os.path.join(MODELS_ROOT, "clip-vit-base-patch32", "onnx", "vision_model.onnx"), "size": 224,
                  "output": "image_embeds", "mean": (0.48145466, 0.4578275, 0.40821073), "std": (0.26862954, 0.26130258, 0.27577711)},
}
HERE = os.path.dirname(os.path.abspath(__file__))
PHRASES = os.path.join(HERE, "codex_phrases.json")
OBJECTS = os.path.join(HERE, "object_phrases.json")
_tables = {}


def table(path):
    """Loads a phrase table once, as one matrix: the object list is too long to parse per request."""
    if path not in _tables:
        with open(path, encoding="utf-8") as handle:
            rows = json.load(handle)
        _tables[path] = ([r.get("id") or r["label"] for r in rows], np.array([r["embedding"] for r in rows], dtype=np.float32))
    return _tables[path]
# The Arc is left out on purpose: it is the viewport's GPU on these laptops.
DEVICE_ORDER = ("NPU", "CPU")
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)
ALLOWED_ORIGIN = re.compile(r"^(https://plajah\.com|https://app\.plajah|https?://(127\.0\.0\.1|localhost)(:\d+)?)$")

core = ov.Core()
cache = os.path.join(RUNTIME_ROOT, "cache", "openvino")
os.makedirs(cache, exist_ok=True)
core.set_property({"CACHE_DIR": cache})
loaded = {}
lock = threading.Lock()


def load(name):
    with lock:
        if name in loaded:
            return loaded[name]
        spec = MODELS[name]
        errors = []
        for device in DEVICE_ORDER:
            if device not in core.available_devices:
                continue
            try:
                model = core.read_model(spec["path"])
                model.reshape({model.inputs[0].any_name: [1, 3, spec["size"], spec["size"]]})
                started = time.perf_counter()
                compiled = core.compile_model(model, device, {"PERFORMANCE_HINT": "LATENCY"})
                loaded[name] = {
                    "request": compiled.create_infer_request(),
                    "output": compiled.output(spec["output"]) if "output" in spec else compiled.outputs[0],
                    "device": device,
                    "loadMs": round((time.perf_counter() - started) * 1000),
                }
                return loaded[name]
            except Exception as error:
                errors.append(f"{device}: {error}")
        raise RuntimeError("; ".join(errors) or "no device")


def tensor(body, spec):
    size = spec["size"]
    if len(body) != size * size * 3:
        raise ValueError(f"expected {size * size * 3} bytes of RGB")
    mean = np.array(spec["mean"], dtype=np.float32).reshape(3, 1, 1) if "mean" in spec else MEAN
    std = np.array(spec["std"], dtype=np.float32).reshape(3, 1, 1) if "std" in spec else STD
    pixels = np.frombuffer(body, dtype=np.uint8).reshape(size, size, 3).astype(np.float32) / 255.0
    return ((pixels.transpose(2, 0, 1) - mean) / std)[None]


def recognize(embedding):
    """Cosine against the codex phrases at CLIP's own temperature; a creature scores as its best phrase."""
    vector = embedding / max(float(np.linalg.norm(embedding)), 1e-6)
    names, matrix = table(PHRASES)
    similarity = matrix @ vector
    best = {}
    for name, score in zip(names, similarity):
        best[name] = max(best.get(name, -1.0), float(score))
    ids = list(best)
    logits = np.array([best[i] for i in ids]) * 100.0
    probs = np.exp(logits - logits.max())
    probs = probs / probs.sum()
    return {i: round(float(p), 4) for i, p in zip(ids, probs)}


def name_objects(embedding, top=6):
    vector = embedding / max(float(np.linalg.norm(embedding)), 1e-6)
    names, matrix = table(OBJECTS)
    logits = (matrix @ vector) * 100.0
    probs = np.exp(logits - logits.max())
    probs = probs / probs.sum()
    order = np.argsort(-probs)[:top]
    return [{"label": names[i], "score": round(float(probs[i]), 4)} for i in order]


def score_table(embedding, path):
    """A probability for every label in one table, at CLIP's own temperature."""
    vector = embedding / max(float(np.linalg.norm(embedding)), 1e-6)
    names, matrix = table(os.path.join(HERE, path))
    logits = (matrix @ vector) * 100.0
    probs = np.exp(logits - logits.max())
    probs = probs / probs.sum()
    return {n: round(float(p), 4) for n, p in zip(names, probs)}


def infer(name, body):
    model = load(name)
    x = tensor(body, MODELS[name])
    started = time.perf_counter()
    with lock:
        out = np.array(model["request"].infer({0: x})[model["output"]]).squeeze()
    return out, model, round((time.perf_counter() - started) * 1000, 1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def cors(self):
        origin = self.headers.get("Origin")
        if origin and ALLOWED_ORIGIN.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Expose-Headers", "X-Device, X-Infer-Ms, X-Load-Ms")

    def refused(self):
        origin = self.headers.get("Origin")
        return bool(origin) and not ALLOWED_ORIGIN.match(origin)

    def reply(self, status, data, kind="application/json", extra=None):
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        for key, value in (extra or {}).items():
            self.send_header(key, str(value))
        self.end_headers()
        self.wfile.write(data)

    def fail(self, status, message):
        self.reply(status, json.dumps({"error": message}).encode())

    def do_OPTIONS(self):
        self.reply(403 if self.refused() else 204, b"")

    def do_GET(self):
        if self.refused():
            return self.fail(403, "origin not allowed")
        if self.path != "/health":
            return self.fail(404, "not found")
        self.reply(200, json.dumps({
            "devices": core.available_devices,
            "models": {k: os.path.exists(v["path"]) for k, v in MODELS.items()},
            "loaded": {k: v["device"] for k, v in loaded.items()},
        }).encode())

    def do_POST(self):
        if self.refused():
            return self.fail(403, "origin not allowed")
        name = {"/cutout": "cutout", "/depth": "depth", "/recognize": "recognize", "/read-part": "recognize", "/read-kind": "recognize"}.get(self.path)
        if not name:
            return self.fail(404, "not found")
        size = MODELS[name]["size"]
        length = int(self.headers.get("Content-Length") or 0)
        if length != size * size * 3:
            return self.fail(400, f"expected {size * size * 3} bytes of RGB")
        try:
            out, model, ms = infer(name, self.rfile.read(length))
        except Exception as error:
            return self.fail(500, str(error))
        if name == "recognize":
            extra = {"X-Device": model["device"], "X-Infer-Ms": ms, "X-Load-Ms": model["loadMs"]}
            if self.path == "/read-part":
                return self.reply(200, json.dumps({"parts": score_table(out, "part_phrases.json"), "materials": score_table(out, "material_phrases.json"), "inKind": score_table(out, "kind_part_phrases.json")}).encode(), extra=extra)
            if self.path == "/read-kind":
                return self.reply(200, json.dumps({"kinds": score_table(out, "kind_phrases.json")}).encode(), extra=extra)
            return self.reply(200, json.dumps({"scores": recognize(out), "objects": name_objects(out)}).encode(), extra=extra)
        if name == "cutout":
            low, high = float(out.min()), float(out.max())
            data = (np.clip((out - low) / max(high - low, 1e-6), 0, 1) * 255).astype(np.uint8).tobytes()
        else:
            data = out.astype(np.float32).tobytes()
        self.reply(200, data, "application/octet-stream", {"X-Device": model["device"], "X-Infer-Ms": ms, "X-Load-Ms": model["loadMs"]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=51125)
    args = parser.parse_args()
    print(f"[Argilla NPU] 127.0.0.1:{args.port} devices: {core.available_devices}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
