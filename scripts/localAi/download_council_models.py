"""
download_council_models.py — fetch the GGUF models the Art Council's local lane can run, resumably.

  python scripts/localAi/download_council_models.py            # lists what is on disk, complete or truncated
  python scripts/localAi/download_council_models.py qwen-7b pokee-7b

Each download goes to D:\\Plajah Models\\llm\\<file>.part with HTTP Range resume, then is renamed when its size matches
the published size. The two 7B files are 4.68 GB each. A file already present at the right size is skipped; a file
present at the WRONG size (a truncated earlier download) is moved aside and fetched again.
"""
import os
import sys
import time
import urllib.request

DEST_DIR = r"D:\Plajah Models\llm"
MODELS = {
    "qwen-7b": {
        "file": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "url": "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "size": 4683074240,
        "note": "Qwen2.5-7B-Instruct Q4_K_M (Apache-2.0) — the strongest general council brain that fits the 8 GB 4070",
    },
    "pokee-7b": {
        "file": "PokeeAI.pokee_research_7b.Q4_K_M.gguf",
        "url": "https://huggingface.co/DevQuasar/PokeeAI.pokee_research_7b-GGUF/resolve/main/PokeeAI.pokee_research_7b.Q4_K_M.gguf",
        "size": 4683074048,
        "note": "PokeeResearch-7B Q4_K_M — Pokee AI's deep-research agent (Qwen2.5-7B based) for the council's research lane",
    },
    "gemma-2-2b": {
        "file": "gemma-2-2b-it-Q4_K_M.gguf",
        "url": "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf",
        "size": 1708582752,
        "note": "Gemma 2 2B it Q4_K_M — the fast lane (disputes, reflections)",
    },
    "nemotron-4b": {
        "file": "Nemotron-Mini-4B-Instruct-Q4_K_M.gguf",
        "url": "https://huggingface.co/bartowski/Nemotron-Mini-4B-Instruct-GGUF/resolve/main/Nemotron-Mini-4B-Instruct-Q4_K_M.gguf",
        "size": 2697387072,
        "note": "NVIDIA Nemotron-Mini 4B Instruct Q4_K_M — proposals when the 7B is not on disk",
    },
}
HEADERS = {"User-Agent": "PlajahNativeEngine/1.0"}


def status(key):
    m = MODELS[key]
    path = os.path.join(DEST_DIR, m["file"])
    if not os.path.exists(path):
        return "missing", 0
    size = os.path.getsize(path)
    return ("complete" if size == m["size"] else "truncated"), size


def download(key):
    m = MODELS[key]
    os.makedirs(DEST_DIR, exist_ok=True)
    dest = os.path.join(DEST_DIR, m["file"])
    part = dest + ".part"
    st, size = status(key)
    if st == "complete":
        print(f"[{key}] already complete: {dest}", flush=True)
        return True
    if st == "truncated":
        aside = dest + f".truncated-{size}"
        os.replace(dest, aside)
        print(f"[{key}] moved truncated file ({size} bytes) aside to {aside}", flush=True)
    have = os.path.getsize(part) if os.path.exists(part) else 0
    if have >= m["size"]:
        have = 0
        os.remove(part)
    for attempt in range(1, 100):
        req = urllib.request.Request(m["url"], headers=dict(HEADERS, **({"Range": f"bytes={have}-"} if have else {})))
        try:
            with urllib.request.urlopen(req, timeout=60) as resp, open(part, "ab" if have else "wb") as out:
                total = m["size"]
                print(f"[{key}] {'resuming at ' + str(round(have / 2**20)) + ' MB' if have else 'starting'} · {round(total / 2**30, 2)} GB total", flush=True)
                t0, last = time.time(), time.time()
                while True:
                    chunk = resp.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    have += len(chunk)
                    if time.time() - last > 10:
                        rate = (have / 2**20) / max(1e-3, time.time() - t0)
                        print(f"[{key}] {have * 100 // total}% · {round(have / 2**20)} MB", flush=True)
                        last = time.time()
            if have == m["size"]:
                os.replace(part, dest)
                print(f"[{key}] done: {dest}", flush=True)
                return True
            print(f"[{key}] stream ended at {have} of {m['size']} bytes; resuming", flush=True)
        except Exception as e:
            print(f"[{key}] {type(e).__name__}: {e} — retry {attempt} in {min(60, 5 * attempt)}s", flush=True)
            time.sleep(min(60, 5 * attempt))
    return False


if __name__ == "__main__":
    keys = [k for k in sys.argv[1:] if k in MODELS]
    bad = [k for k in sys.argv[1:] if k not in MODELS]
    if bad:
        print(f"unknown model(s): {bad}; choose from {list(MODELS)}")
        sys.exit(2)
    if not keys:
        for k in MODELS:
            st, size = status(k)
            print(f"{k:12} {st:9} {round(size / 2**30, 2):>5} GB  {MODELS[k]['file']}  — {MODELS[k]['note']}")
        sys.exit(0)
    ok = all(download(k) for k in keys)
    sys.exit(0 if ok else 1)
