"""
council_local_lane.py — the Council of Art Directors' on-device model lane.

Serves the council's four rounds (PROPOSE / DISPUTE / SYNTHESISE / REFLECT) and its research lane from the GGUF
models on disk (D:\\Plajah Models\\llm; scripts/localAi/download_council_models.py fetches them), through
llama-cpp-python on the NVIDIA GPU. Models and roles:

  Gemma 2 2B        fast lane — disputes and reflections (short, simple shapes); synthesis when no 7B is on disk
  Nemotron-Mini 4B  proposals when no 7B is on disk (4k context)
  Qwen2.5-7B        proposals + synthesis once downloaded (16k context, "qwen-cascade" preset picks itself)
  PokeeResearch-7B  the research lane (search → read → verify), falling back to Qwen / Nemotron when absent

Presets / routing: COUNCIL_LOCAL_PRESET=auto|cascade|qwen-cascade|qwen|gemma, COUNCIL_LOCAL_ROUTE=round=model,…,
COUNCIL_LOCAL_MODEL=<key|path.gguf> (everything on one model), COUNCIL_LOCAL_RESEARCH_MODEL, COUNCIL_LOCAL_RESIDENT.
Generation is free-form with JSON extracted and validated here (grammar sampling is ~10x slower on these vocabularies).

HTTP (127.0.0.1:51133):
  GET  /health                       -> {"ok":true,"preset","route","research_model","loaded","available"}
  POST /complete {system,user,maxTokens,schema?:"proposal"|"dispute"|"synthesis"|"reflection",model?}
                                     -> {"text":"...","model":"...","usage":{...},"seconds":n,"attempt":n}
  POST /research {prompt}            -> {"text":"{influences,note}","model","trace":{queries,pages,drafted,kept}}
Requests are served one at a time (one GPU); the Node side waits.

Run: D:\\ComfyUI_windows_portable\\ComfyUI_windows_portable\\python_embeded\\python.exe -u scripts/localAi/council_local_lane.py
"""
import os
import sys
import json
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SITE = r"D:\ComfyUI_windows_portable\ComfyUI_windows_portable\python_embeded\Lib\site-packages"
LLM_SEARCH_PATHS = [r"D:\Plajah Models\llm", r"D:\Plajah AI Models\llm", r"D:\ComfyUI_windows_portable\ComfyUI_windows_portable\models\llm"]
# `min_bytes` guards against truncated downloads (a 7B Q4 is ~4.7 GB; a 1 GB file with a GGUF magic will not load).
MODELS = {
    "gemma-2-2b": {"files": ["gemma-2-2b-it-Q4_K_M.gguf", "gemma-2-2b-it-IQ4_XS.gguf", "gemma-2-2b-it-Q4_K_S.gguf"], "ctx": 7168, "min_bytes": 1_400_000_000},
    "nemotron-4b": {"files": ["Nemotron-Mini-4B-Instruct-Q4_K_M.gguf", "nemotron-mini-4b-instruct.gguf"], "ctx": 4096, "min_bytes": 2_500_000_000},
    "qwen-7b": {"files": ["Qwen2.5-7B-Instruct-Q4_K_M.gguf", "qwen2.5-7b-instruct-q4_k_m.gguf"], "ctx": 16384, "min_bytes": 4_500_000_000},
    "pokee-7b": {"files": ["PokeeAI.pokee_research_7b.Q4_K_M.gguf", "pokee_research_7b.Q4_K_M.gguf", "PokeeResearch-7B-Q4_K_M.gguf"], "ctx": 16384, "min_bytes": 4_500_000_000},
    "mistral-nemo": {"files": ["Mistral-Nemo-Instruct-2407-Q4_K_M.gguf"], "ctx": 16384, "min_bytes": 7_000_000_000},
}
PORT = int(os.environ.get("COUNCIL_LOCAL_PORT", "51133"))


def find_model(key):
    if key.lower().endswith(".gguf") and os.path.exists(key):
        return key
    for d in LLM_SEARCH_PATHS:
        for f in MODELS.get(key, {}).get("files", []):
            p = os.path.join(d, f)
            if os.path.exists(p) and os.path.getsize(p) >= MODELS[key].get("min_bytes", 10 * 1024 * 1024):
                return p
    return None


# Which model answers which round. Presets, chosen with COUNCIL_LOCAL_PRESET (default "auto"):
#   cascade       Nemotron 4B proposals · Gemma 2 2B disputes / synthesis / reflections   (what ships on disk today)
#   qwen-cascade  Qwen2.5-7B proposals + synthesis · Gemma 2 2B disputes / reflections     (auto when Qwen is on disk)
#   qwen          Qwen2.5-7B for every round
#   gemma         Gemma 2 2B for every round (smallest footprint)
# COUNCIL_LOCAL_ROUTE="proposal=qwen-7b,synthesis=qwen-7b" overrides single rounds; COUNCIL_LOCAL_MODEL=<key> overrides all.
PRESETS = {
    "cascade": {"proposal": "nemotron-4b", "dispute": "gemma-2-2b", "synthesis": "gemma-2-2b", "reflection": "gemma-2-2b"},
    "qwen-cascade": {"proposal": "qwen-7b", "dispute": "gemma-2-2b", "synthesis": "qwen-7b", "reflection": "gemma-2-2b"},
    "qwen": {"proposal": "qwen-7b", "dispute": "qwen-7b", "synthesis": "qwen-7b", "reflection": "qwen-7b"},
    "gemma": {"proposal": "gemma-2-2b", "dispute": "gemma-2-2b", "synthesis": "gemma-2-2b", "reflection": "gemma-2-2b"},
}


def resolve_route():
    preset = os.environ.get("COUNCIL_LOCAL_PRESET", "auto").strip().lower()
    if preset == "auto":
        preset = "qwen-cascade" if find_model("qwen-7b") else "cascade"
    route = dict(PRESETS.get(preset, PRESETS["cascade"]))
    for pair in os.environ.get("COUNCIL_LOCAL_ROUTE", "").split(","):
        if "=" in pair:
            k, v = pair.split("=", 1)
            if k.strip() in route and v.strip():
                route[k.strip()] = v.strip()
    return preset, route


PRESET, ROUTE = resolve_route()
# The research lane's model: PokeeResearch-7B when on disk, else the best general model present.
RESEARCH_MODEL = os.environ.get("COUNCIL_LOCAL_RESEARCH_MODEL", "").strip() or next((k for k in ("pokee-7b", "qwen-7b", "nemotron-4b", "gemma-2-2b") if find_model(k)), "gemma-2-2b")
RESIDENT = max(1, int(os.environ.get("COUNCIL_LOCAL_RESIDENT", "1")))

S = {"type": "string"}
def obj(props, required=None):
    return {"type": "object", "properties": props, "required": required or list(props.keys())}
ID = {"type": "string", "enum": ["CLASSICAL", "REBEL", "FUTURIST", "WORLD_ECLECTIC", "BAROQUE", "RADICAL_MINIMAL"]}
SCHEMAS = {
    "proposal": obj({"title": S, "idea": S, "geometry": S, "typography": S, "imageLogic": S, "texture": S, "motion": S,
                     "productionMethod": S, "humanTrace": S, "risk": S, "arguesWith": obj({"directorId": ID, "why": S})}),
    "dispute": obj({"against": ID, "objection": S, "concession": S}),
    "synthesis": obj({"lead": ID, "counterpoint": ID, "editor": ID, "direction": S, "keepFromCounterpoint": S, "editorCut": S,
                      "openDecision": S, "ariaSummary": S,
                      "quotes": {"type": "array", "maxItems": 2, "items": obj({"directorId": ID, "line": S})}}),
    "reflection": obj({"note": S}),
}


def wire_dlls():
    for d in (SITE + r"\llama_cpp\lib", SITE + r"\torch\lib"):
        if os.path.exists(d):
            os.add_dll_directory(d)
            os.environ["PATH"] = d + ";" + os.environ.get("PATH", "")


LAYERS = {"gemma-2-2b": 26, "nemotron-4b": 32, "qwen-7b": 28, "pokee-7b": 28, "mistral-nemo": 40}


def free_vram_mb():
    """Free VRAM in MiB from nvidia-smi, or None when it cannot be read."""
    try:
        import subprocess
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
        return int(out.strip().splitlines()[0])
    except Exception:
        return None


def gpu_state():
    """temp °C, free MiB, used MiB from nvidia-smi (None when it cannot be read)."""
    try:
        import subprocess
        out = subprocess.run(["nvidia-smi", "--query-gpu=temperature.gpu,memory.free,memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
        t, f, u = [int(x.strip()) for x in out.strip().splitlines()[0].split(",")]
        return {"temp": t, "freeMb": f, "usedMb": u}
    except Exception:
        return None


# ── Safety rails ─────────────────────────────────────────────────────────────────────────────────────────────────
# The parallel runs crashed the laptop (bugcheck 0x101 CLOCK_WATCHDOG_TIMEOUT) after hours at 87–89 °C with 7B
# models spilled onto the CPU while the diffusion sidecar held the GPU. So: one model, fully on the GPU or not at
# all, at most 4 CPU threads, nothing generated above 83 °C, and the lane will not even start beside another GPU
# process.
N_THREADS = max(1, min(4, int(os.environ.get("COUNCIL_LOCAL_THREADS", "4"))))
THERMAL_PAUSE_C = int(os.environ.get("COUNCIL_LOCAL_THERMAL_PAUSE", "83"))
# Resume at 78 °C: this laptop's GPU idles at 76–77 °C (4.6 W, clocks parked) from chassis heat-soak, so a lower
# resume point is never reached. Set COUNCIL_LOCAL_THERMAL_RESUME to tighten it on a cooler machine.
THERMAL_RESUME_C = int(os.environ.get("COUNCIL_LOCAL_THERMAL_RESUME", "78"))


class ThermalPause(Exception):
    """Raised instead of blocking: the HTTP caller gets a 503 at once and retries when the GPU has cooled."""
    def __init__(self, temp):
        super().__init__(f"thermal pause: GPU {temp} °C (pause ≥ {THERMAL_PAUSE_C} °C, resume ≤ {THERMAL_RESUME_C} °C)")
        self.temp = temp


_thermal_latched = False


def thermal_gate():
    """Hysteresis: once the GPU hits the pause temperature, nothing generates until it is back at or below resume."""
    global _thermal_latched
    g = gpu_state()
    if not g:
        return
    if _thermal_latched:
        if g["temp"] <= THERMAL_RESUME_C:
            _thermal_latched = False
            print(f"[council-local] GPU {g['temp']} °C — thermal pause lifted", flush=True)
        else:
            raise ThermalPause(g["temp"])
    elif g["temp"] >= THERMAL_PAUSE_C:
        _thermal_latched = True
        print(f"[council-local] GPU {g['temp']} °C ≥ {THERMAL_PAUSE_C} °C — thermal pause until ≤ {THERMAL_RESUME_C} °C", flush=True)
        raise ThermalPause(g["temp"])
BLOCKING_PROCESS_MARKERS = ("plajah_gpu_sidecar", "comfyui", "main.py --", "llama-server", "ollama", "lmstudio", "stable-diffusion", "story_intelligence_engine")


def other_gpu_processes():
    """Command lines of other model / GPU processes that must not share the card with the council."""
    hits = []
    try:
        import psutil
        me = os.getpid()
        for p in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                if p.info["pid"] == me:
                    continue
                cmd = " ".join(p.info.get("cmdline") or []).lower()
                if not cmd:
                    continue
                if any(m in cmd for m in BLOCKING_PROCESS_MARKERS) and "council_local_lane" not in cmd:
                    hits.append(f"{p.info['name']} (pid {p.info['pid']}): {cmd[:120]}")
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:
        print(f"[council-local] process scan unavailable: {e}", flush=True)
    return hits


def wait_for_cool_gpu():
    """Block while the GPU is at or above the pause temperature; returns the seconds waited."""
    waited = 0.0
    g = gpu_state()
    if g and g["temp"] >= THERMAL_PAUSE_C:
        print(f"[council-local] GPU {g['temp']} °C ≥ {THERMAL_PAUSE_C} °C — pausing until ≤ {THERMAL_RESUME_C} °C", flush=True)
        while True:
            time.sleep(10)
            waited += 10
            g = gpu_state()
            if g and g["temp"] <= THERMAL_RESUME_C:
                print(f"[council-local] GPU {g['temp']} °C — resuming after {waited:.0f} s", flush=True)
                break
    return waited


def gpu_layers_for(key, path, ctx):
    """
    Full GPU offload only. The model plus its context cache must fit in the VRAM free right now; otherwise the load
    is refused with the numbers (no partial offload, no CPU inference: a 7B on the CPU pegs every core for minutes).
    COUNCIL_LOCAL_GPU_LAYERS=<n> still overrides for debugging.
    """
    forced = os.environ.get("COUNCIL_LOCAL_GPU_LAYERS", "").strip()
    if forced:
        return int(forced)
    g = gpu_state()
    if g is None:
        raise RuntimeError("cannot read the GPU with nvidia-smi; refusing to load a model blind")
    need = os.path.getsize(path) / 2**20 + ctx * 0.12 + 600  # weights + f16 KV cache (~0.12 MiB/token) + compute buffers
    if g["freeMb"] < need:
        raise RuntimeError(f"{key} needs ~{need:.0f} MiB of VRAM but only {g['freeMb']} MiB is free ({g['usedMb']} MiB in use by other processes); not loading")
    return -1


class Pool:
    """Dual-resident model pool: both small models stay hot on the GPU; one request at a time."""
    def __init__(self):
        self.models = {}
        self.lock = threading.Lock()
        self.supports_system = {}

    def get(self, key):
        if key in self.models:
            return self.models[key]
        from llama_cpp import Llama
        path = find_model(key)
        if not path:
            raise RuntimeError(f"model {key} not found under {LLM_SEARCH_PATHS}")
        # Keep at most RESIDENT models on the GPU. The driver offers ~7 GB of the 4070's 8 GB; both models with their
        # caches come to ~6.3 GB, and once the diffusion sidecar or a desktop app holds the rest, allocations spill to
        # system memory and generation drops from ~45 to ~3 tok/s. One resident model (default) swaps twice per
        # deliberation (~10 s each); COUNCIL_LOCAL_RESIDENT=2 keeps both hot when the GPU is otherwise free.
        while self.models and len(self.models) >= RESIDENT:
            old = next(iter(self.models))
            del self.models[old]
            import gc
            gc.collect()
            print(f"[council-local] evicted {old} to make room for {key}", flush=True)
        # staged rail: short contexts only (4096 by default) — the KV cache is what pushes a 7B past free VRAM
        ctx = min(MODELS.get(key, {}).get("ctx", 8192), int(os.environ.get("COUNCIL_LOCAL_CTX", "4096")))
        t0 = time.time()
        # Plain f16 KV cache by default (the 8-bit cache + flash attention path was no faster here); COUNCIL_LOCAL_KV=q8 to try it.
        GGML_TYPE_Q8_0 = 8
        kv = {"flash_attn": True, "type_k": GGML_TYPE_Q8_0, "type_v": GGML_TYPE_Q8_0} if os.environ.get("COUNCIL_LOCAL_KV", "f16").lower() == "q8" else {}
        layers = gpu_layers_for(key, path, ctx)
        before = gpu_state()
        llm = Llama(model_path=path, n_gpu_layers=layers, n_ctx=ctx, n_threads=N_THREADS, n_threads_batch=N_THREADS, verbose=False, **kv)
        after = gpu_state()
        # confirm the weights actually went to the card (llama.cpp can silently keep them in RAM): the VRAM in use must
        # have grown by most of the file size, or the model is unloaded again and the load refused
        if before and after and layers == -1:
            grew = after["usedMb"] - before["usedMb"]
            if grew < os.path.getsize(path) / 2**20 * 0.8:
                del llm
                import gc
                gc.collect()
                raise RuntimeError(f"{key}: VRAM grew by only {grew} MiB on load (file is {os.path.getsize(path) / 2**20:.0f} MiB) — the model is not on the GPU; refusing to run it on the CPU")
        self.last_load_vram_mb = (after["usedMb"] - before["usedMb"]) if (before and after) else 0
        print(f"[council-local] loaded {key} ({os.path.basename(path)}) ctx {ctx} threads {N_THREADS} in {time.time() - t0:.1f}s · +{self.last_load_vram_mb} MiB VRAM", flush=True)
        self.models[key] = llm
        return llm

    def unload_all(self):
        """Drop every resident model and return its VRAM (gc + the llama.cpp destructor)."""
        keys = list(self.models.keys())
        self.models.clear()
        import gc
        gc.collect()
        g = gpu_state()
        print(f"[council-local] unloaded {keys or 'nothing'} · GPU {g['usedMb'] if g else '?'} MiB in use", flush=True)
        return keys

    def _chat(self, key, llm, messages, max_tokens, fmt):
        kw = {"response_format": fmt} if fmt else {}
        try:
            return llm.create_chat_completion(messages=messages, max_tokens=max_tokens, temperature=0.9, **kw)
        except ValueError as e:
            # Gemma's chat template has no system role: fold the system prompt into the user turn. Nemotron accepts it.
            if "System role" not in str(e):
                raise
            self.supports_system[key] = False
            folded = [{"role": "user", "content": "\n\n".join(m["content"] for m in messages)}]
            return llm.create_chat_completion(messages=folded, max_tokens=max_tokens, temperature=0.9, **kw)

    def complete(self, key, system, user, max_tokens, schema):
        """
        Free generation, then extract + validate the JSON ourselves. Grammar-constrained sampling over these models'
        256k-token vocabularies runs at 2-3 tok/s against ~45 tok/s free, so the grammar is only the last resort.
        """
        llm = self.get(key)
        required = SCHEMAS[schema]["required"] if schema in SCHEMAS else []
        split = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        folded = [{"role": "user", "content": f"{system}\n\n{user}"}]
        messages = split if self.supports_system.get(key, True) else folded
        with self.lock:
            thermal_gate()  # raises ThermalPause (→ HTTP 503) instead of holding the connection open
            self.last_waited = 0.0
            self.peak_temp = max(getattr(self, "peak_temp", 0), (gpu_state() or {}).get("temp", 0))
            t0 = time.time()
            usage = {}
            last = ""
            truncated = False
            for attempt in range(3):
                # no grammar mode in the staged runner (10× slower on these vocabularies): two free attempts, then give up
                if attempt == 2 and os.environ.get("COUNCIL_LOCAL_GRAMMAR_FALLBACK", "0") != "1":
                    break
                fmt = {"type": "json_object", "schema": SCHEMAS[schema]} if (attempt == 2 and schema in SCHEMAS) else None
                # a truncated answer (hit the token cap mid-JSON) gets a bigger budget and a brevity nudge, not the same cap again
                if attempt == 0:
                    nudge, budget = messages, max_tokens
                elif truncated:
                    nudge = messages[:-1] + [{"role": "user", "content": messages[-1]["content"] + "\n\nYour previous answer ran past the length limit before the JSON closed. Answer again with ONLY the JSON object, every field one short sentence."}]
                    budget = min(int(max_tokens * 1.8), 1200)
                else:
                    nudge = messages[:-1] + [{"role": "user", "content": messages[-1]["content"] + "\n\nYour previous answer was not valid JSON with every field filled. Answer again with ONLY the JSON object, every field a non-empty string."}]
                    budget = max_tokens if attempt < 2 else min(max_tokens, 400)
                r = self._chat(key, llm, nudge, budget, fmt)
                last = r["choices"][0]["message"]["content"] or ""
                truncated = r["choices"][0].get("finish_reason") == "length"
                u = r.get("usage", {})
                usage = {k: usage.get(k, 0) + u.get(k, 0) for k in set(usage) | set(u)}
                parsed = extract_json(last)
                if parsed is not None:
                    normalize_ids(parsed)
                if parsed is not None and all(isinstance(parsed.get(k), (str, dict, list)) and parsed.get(k) for k in required) and ids_resolve(parsed):
                    return json.dumps(parsed), usage, time.time() - t0, attempt
            return last, usage, time.time() - t0, 3


DIRECTOR_WORDS = [("WORLD_ECLECTIC", ("world", "eclectic", "travel")), ("RADICAL_MINIMAL", ("minimal",)), ("CLASSICAL", ("classic",)),
                  ("BAROQUE", ("baroque", "dramatist")), ("FUTURIST", ("futur",)), ("REBEL", ("rebel",))]
ID_FIELDS = ("lead", "counterpoint", "editor", "against", "directorId")


def to_id(v):
    """'The Futurist' / 'the Classical Mind' / 'futurist' -> the council id the readers expect; ids pass through."""
    if not isinstance(v, str):
        return v
    s = v.strip()
    if s in ID["enum"]:
        return s
    low = s.lower()
    for did, words in DIRECTOR_WORDS:
        if any(w in low for w in words):
            return did
    return s


def normalize_ids(node):
    """Small models answer with the directors' names where the prompt asked for ids; map them back, in place."""
    if isinstance(node, dict):
        for k, v in list(node.items()):
            if k in ID_FIELDS:
                node[k] = to_id(v)
            else:
                normalize_ids(v)
    elif isinstance(node, list):
        for v in node:
            normalize_ids(v)


def ids_resolve(node):
    if isinstance(node, dict):
        return all((v in ID["enum"]) if k in ID_FIELDS else ids_resolve(v) for k, v in node.items())
    if isinstance(node, list):
        return all(ids_resolve(v) for v in node)
    return True


def extract_json(text):
    """The first {...} object in the text, tolerant of prose and code fences around it."""
    if not text:
        return None
    if "```" in text:
        inner = text.split("```")
        text = max(inner, key=len)
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except Exception:
        return None


POOL = Pool()
OVERRIDE = os.environ.get("COUNCIL_LOCAL_MODEL", "").strip()


# ─── Research lane: a Pokee-style deep-research loop ───────────────────────────────────────────────────────────────
# PokeeResearch-7B is trained as a tool-using agent: search → visit pages → draft → self-verify against the evidence →
# answer, or restart. We run the same scaffold here with our own tools (DuckDuckGo HTML search, a page reader) and the
# research model (Pokee's weights when on disk, else Qwen / Nemotron), and return the JSON the council's
# researchUser() prompt asks for: {"influences":[{topic,finding,source:{title,url}}], "note"}.
import re
import html as htmllib
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PlajahCouncil/1.0"}
SEARCH_TIMEOUT = 20
PAGE_TIMEOUT = 20
MAX_PAGES = 4
PAGE_CHARS = 3200


def _get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or UA)
    with urllib.request.urlopen(req, timeout=SEARCH_TIMEOUT) as r:
        return r.read().decode("utf-8", "replace")


def _strip(s):
    return htmllib.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def _ddg_lite(query, n):
    """DuckDuckGo lite (no key, no bot challenge): [{title, url, snippet}]. Links are wrapped as //duckduckgo.com/l/?uddg=<url>."""
    out = []
    lite = _get("https://lite.duckduckgo.com/lite/?" + urllib.parse.urlencode({"q": query}))
    for m in re.finditer(r"""<a rel="nofollow" href="([^"]+)" class=['"]result-link['"]>(.*?)</a>(?:.*?class=['"]result-snippet['"][^>]*>(.*?)</td>)?""", lite, re.S):
        href = htmllib.unescape(m.group(1))
        q = urllib.parse.urlparse(href if href.startswith("http") else "https:" + href)
        if "duckduckgo.com" in q.netloc and "uddg" in q.query:
            href = urllib.parse.parse_qs(q.query).get("uddg", [href])[0]
        if href.startswith("http"):
            out.append({"title": _strip(m.group(2)), "url": href, "snippet": _strip(m.group(3))})
        if len(out) >= n:
            break
    return out


def _wikipedia(query, n):
    """Wikipedia's search API: named makers, works, movements and dates with a stable, citable URL."""
    data = json.loads(_get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "list": "search", "srsearch": query, "srlimit": n, "format": "json", "utf8": 1})))
    return [{"title": s["title"], "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(s["title"].replace(" ", "_")), "snippet": _strip(s.get("snippet", ""))}
            for s in data.get("query", {}).get("search", [])]


def _bing_rss(query, n):
    """Bing's RSS feed. Last resort only: it matches single tokens ('George's', 'LA') and ranks poorly for named topics."""
    out = []
    rss = _get("https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "format": "rss", "count": n}))
    for item in re.findall(r"<item>(.*?)</item>", rss, re.S):
        title = re.search(r"<title>(.*?)</title>", item, re.S)
        link = re.search(r"<link>(.*?)</link>", item, re.S)
        desc = re.search(r"<description>(.*?)</description>", item, re.S)
        if link and link.group(1).startswith("http"):
            out.append({"title": _strip(title.group(1) if title else ""), "url": htmllib.unescape(link.group(1)).strip(), "snippet": _strip(desc.group(1) if desc else "")})
    return out[:n]


def web_search(query, n=6):
    """
    [{title, url, snippet}] for a query, with no API key needed:
      Brave Search API when BRAVE_SEARCH_API_KEY is set; otherwise DuckDuckGo lite (general web) interleaved with
      Wikipedia's search API (encyclopedic, citable), and Bing RSS only if both fail.
      (DuckDuckGo's HTML endpoint answers scripted calls with a bot challenge, so it is not used.)
    """
    key = os.environ.get("BRAVE_SEARCH_API_KEY", "").strip()
    if key:
        try:
            data = json.loads(_get("https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": query, "count": n}),
                                   {"Accept": "application/json", "X-Subscription-Token": key}))
            return [{"title": x.get("title", ""), "url": x.get("url", ""), "snippet": x.get("description", "")} for x in data.get("web", {}).get("results", [])][:n]
        except Exception as e:
            print(f"[council-local] Brave search failed for {query!r}: {e}", flush=True)
    web, wiki = [], []
    try:
        web = _ddg_lite(query, n)
    except Exception as e:
        print(f"[council-local] DuckDuckGo lite failed for {query!r}: {e}", flush=True)
    try:
        wiki = _wikipedia(query, 3)
    except Exception as e:
        print(f"[council-local] Wikipedia search failed for {query!r}: {e}", flush=True)
    out, seen = [], set()
    for r in [x for pair in zip(wiki + [None] * len(web), web + [None] * len(wiki)) for x in pair if x]:
        if r["url"] not in seen:
            seen.add(r["url"]); out.append(r)
    if not out:
        try:
            out = _bing_rss(query, n)
        except Exception as e:
            print(f"[council-local] Bing RSS failed for {query!r}: {e}", flush=True)
    return out[:n]


def read_page(url):
    """The readable text of a page, trimmed to PAGE_CHARS."""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=PAGE_TIMEOUT) as r:
            if "text/html" not in (r.headers.get("Content-Type") or "text/html"):
                return ""
            page = r.read(600_000).decode("utf-8", "replace")
    except Exception as e:
        print(f"[council-local] read failed for {url}: {e}", flush=True)
        return ""
    page = re.sub(r"<(script|style|nav|footer|header|noscript)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
    title = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", page)
    text = htmllib.unescape(re.sub(r"\s+", " ", text)).strip()
    return ((title.group(1).strip() + " — ") if title else "") + text[:PAGE_CHARS]


def ask_json(model_key, system, user, max_tokens, required):
    text, usage, secs, attempt = POOL.complete(model_key, system, user, max_tokens, None)
    parsed = extract_json(text)
    if parsed is None or not all(k in parsed for k in required):
        return None
    return parsed


def research(prompt):
    """
    prompt is councilPrompts.researchUser(id, topic): 'Research "<topic>" through the lens of <director> (<medium>).
    What they go looking for: …'. Returns (json_text, trace).
    """
    m = re.search(r'Research "(.+?)" through the lens of (.+?) \((.+?)\)\.\s*What they go looking for: (.+?)\.', prompt, re.S)
    topic = m.group(1) if m else prompt[:200]
    director = m.group(2) if m else "an art director"
    beats = m.group(4) if m else ""
    model_key = RESEARCH_MODEL
    trace = {"model": model_key, "topic": topic, "queries": [], "pages": [], "drafted": 0, "kept": 0}
    sys_prompt = ("You are a careful design-history researcher working for an art director. You only report what the evidence shows, "
                  "you name makers, works, movements and dates, and you never invent names, dates or sources. Answer ONLY with JSON, no code fence.")
    # 1. Plan the searches.
    plan = ask_json(model_key, sys_prompt,
                    f'Topic: "{topic}". Lens: {director}. What they look for: {beats}.\n'
                    'Write 3 web search queries that would find specific, attributable references (named designers, studios, works, movements, techniques, with dates). '
                    'Return JSON exactly: {"queries":["…","…","…"]}', 200, ["queries"])
    # Small models drift towards the lens words ("multilingual typography…") and away from the topic: every query keeps the topic.
    topic_words = {w for w in re.findall(r"[a-z]{4,}", topic.lower())}
    queries = []
    for q in [str(q) for q in (plan or {}).get("queries", [])][:3]:
        if not (topic_words & set(re.findall(r"[a-z]{4,}", q.lower()))):
            q = f"{topic} {q}"
        queries.append(q[:160])
    queries = queries or [topic]
    trace["queries"] = queries
    # 2. Search, then read the best pages (never another search engine's results page).
    results, seen = [], set()
    for q in queries:
        for r in web_search(q, 5):
            host = urllib.parse.urlparse(r["url"]).netloc.lower() if r["url"] else ""
            if not r["url"] or r["url"] in seen or r["url"].lower().endswith((".pdf", ".jpg", ".png")):
                continue
            if any(s in host for s in ("google.", "bing.com", "duckduckgo.com", "yandex.", "baidu.com")):
                continue
            seen.add(r["url"]); results.append(r)
    # Read the pages that are actually about the topic: rank by topic-word overlap in title + snippet, with a nudge
    # for encyclopedic, museum and academic hosts, so a search engine's first hit (often a namesake business) does not
    # become the evidence.
    def relevance(r):
        words = set(re.findall(r"[a-z]{4,}", (r["title"] + " " + r["snippet"]).lower()))
        host = urllib.parse.urlparse(r["url"]).netloc.lower()
        bonus = 2 if any(h in host for h in ("wikipedia.org", "britannica.com", ".edu", "museum", "metmuseum", "getty", "nga.gov", "louvre", "tate.org", "moma", "smithsonian", "archive.org", "jstor")) else 0
        return len(topic_words & words) * 3 + bonus
    results.sort(key=relevance, reverse=True)
    results = [r for r in results if relevance(r) > 0] or results
    evidence = []
    for r in results[:MAX_PAGES]:
        text = read_page(r["url"])
        if text:
            evidence.append({"title": r["title"], "url": r["url"], "text": text})
            trace["pages"].append(r["url"])
    if not evidence:  # nothing readable: fall back to the snippets so the lane still answers from something
        evidence = [{"title": r["title"], "url": r["url"], "text": r["snippet"]} for r in results[:8] if r["snippet"]]
    if not evidence:
        return json.dumps({"influences": [], "note": ""}), trace
    ev_text = "\n\n".join(f"[{i + 1}] {e['title']} <{e['url']}>\n{e['text']}" for i, e in enumerate(evidence))
    # 3. Draft the influences from the evidence.
    draft = ask_json(model_key, sys_prompt,
                     f'Topic: "{topic}". Lens: {director} (looks for: {beats}).\n\nEVIDENCE:\n{ev_text}\n\n'
                     'From the evidence only, give three to five SPECIFIC, ATTRIBUTABLE references this director would bring back to the team. '
                     'Each must cite the evidence item it comes from by number. Return JSON exactly: '
                     '{"influences":[{"topic":"…","finding":"one or two sentences, specific, with names and dates where the evidence gives them","evidence":1}],'
                     f'"note":"two sentences to the team in {director}\'s voice about what this changes for them"}}', 900, ["influences"])
    infl = [x for x in (draft or {}).get("influences", []) if isinstance(x, dict) and x.get("finding")]
    trace["drafted"] = len(infl)
    # 4. Verify each finding against its evidence (Pokee's self-verification step); drop what the evidence does not support.
    kept, unverified = [], []
    for x in infl[:6]:
        try:
            idx = int(x.get("evidence", 0)) - 1
        except (TypeError, ValueError):
            idx = -1
        src = evidence[idx] if 0 <= idx < len(evidence) else (evidence[0] if len(infl) == 1 else None)
        if src is None:
            continue
        item = {"topic": str(x.get("topic") or topic)[:120], "finding": str(x["finding"])[:600], "source": {"title": src["title"][:160], "url": src["url"][:400]}}
        check = ask_json(model_key, sys_prompt,
                         f'EVIDENCE:\n{src["text"]}\n\nCLAIM: {x["finding"]}\n\n'
                         'Is the claim supported by this evidence (names, dates and facts present, nothing invented)? Return JSON exactly: {"supported":true or false,"why":"one sentence"}', 120, ["supported"])
        verdict = None if check is None else str(check.get("supported")).lower() in ("true", "1", "yes")
        print(f"[council-local]   verify: {'unreadable' if verdict is None else ('supported' if verdict else 'rejected')} — {str((check or {}).get('why', ''))[:120]} :: {item['finding'][:90]}", flush=True)
        if verdict is None:
            unverified.append(item)  # the checker did not answer in JSON; the finding is not contradicted
        elif verdict:
            kept.append(item)
    if not kept and unverified:
        kept = unverified
    if not kept and infl:
        # Every finding was rejected: hand back the draft marked as such rather than nothing, so the director still
        # gets something to react to and the session is not thrown away (the readers cap and sanitise it anyway).
        kept = [{"topic": str(x.get("topic") or topic)[:120], "finding": "(unverified) " + str(x["finding"])[:580],
                 "source": {"title": evidence[0]["title"][:160], "url": evidence[0]["url"][:400]}} for x in infl[:3]]
        trace["unverified_fallback"] = True
    trace["kept"] = len(kept)
    note = str((draft or {}).get("note") or "")[:500]
    return json.dumps({"influences": kept, "note": note}), trace


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, body):
        data = json.dumps(body).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # the client gave up waiting; the answer is simply dropped

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "staged": True, "preset": PRESET, "override": OVERRIDE or None, "route": ROUTE, "research_model": RESEARCH_MODEL,
                             "resident": RESIDENT, "threads": N_THREADS, "thermal": {"pause": THERMAL_PAUSE_C, "resume": THERMAL_RESUME_C},
                             "gpu": gpu_state(), "blockedBy": other_gpu_processes(),
                             "loaded": list(POOL.models.keys()), "available": {k: bool(find_model(k)) for k in MODELS}})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/complete", "/research", "/load", "/unload"):
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
            if self.path == "/load":
                # staged runner: exactly one model resident. Anything else is dropped first; the load is refused if another
                # GPU process appeared or the model would not fit.
                key = str(req.get("model") or "")
                if key not in MODELS and not key.lower().endswith(".gguf"):
                    return self._json(400, {"error": f"unknown model {key!r}"})
                blocked = other_gpu_processes()
                if blocked:
                    return self._json(409, {"error": "other GPU/model processes are running: " + "; ".join(blocked)})
                with POOL.lock:
                    POOL.unload_all()
                    POOL.peak_temp = 0
                    thermal_gate()
                    POOL.get(key)
                return self._json(200, {"loaded": key, "vramMb": getattr(POOL, "last_load_vram_mb", 0), "gpu": gpu_state()})
            if self.path == "/unload":
                with POOL.lock:
                    keys = POOL.unload_all()
                return self._json(200, {"unloaded": keys, "gpu": gpu_state()})
            if self.path == "/research":
                t0 = time.time()
                text, trace = research(str(req.get("prompt", "")))
                print(f"[council-local] research via {trace['model']}: {trace['kept']}/{trace['drafted']} findings kept from {len(trace['pages'])} pages in {time.time() - t0:.0f}s", flush=True)
                return self._json(200, {"text": text, "model": trace["model"], "trace": trace, "seconds": time.time() - t0})
            schema = req.get("schema")
            key = req.get("model") or OVERRIDE or ROUTE.get(schema, "gemma-2-2b")
            text, usage, secs, attempt = POOL.complete(key, req.get("system", ""), req.get("user", ""), int(req.get("maxTokens") or 600), schema)
            g = gpu_state() or {}
            print(f"[council-local] {schema or 'free'} via {key}: {usage.get('completion_tokens', 0)} tok in {secs:.1f}s · GPU {g.get('temp', '?')} °C" + (f" (attempt {attempt + 1})" if attempt else ""), flush=True)
            self._json(200, {"text": text, "model": key, "usage": usage, "seconds": secs, "attempt": attempt,
                             "waitedMs": int(getattr(POOL, "last_waited", 0) * 1000), "gpu": {**g, "peakTemp": max(getattr(POOL, "peak_temp", 0), g.get("temp", 0))}})
        except ThermalPause as e:
            self._json(503, {"error": str(e), "thermalPause": True, "temp": e.temp, "resumeAt": THERMAL_RESUME_C, "retryInMs": 10000})
        except Exception as e:
            print(f"[council-local] error: {e}", flush=True)
            self._json(500, {"error": str(e)})


if __name__ == "__main__":
    blocked = other_gpu_processes()
    if blocked:
        print("[council-local] REFUSING TO START — other GPU/model processes are running:\n  " + "\n  ".join(blocked), flush=True)
        sys.exit(3)
    g = gpu_state()
    if g is None:
        print("[council-local] REFUSING TO START — nvidia-smi is not answering; the thermal guard needs it", flush=True)
        sys.exit(3)
    wire_dlls()
    import llama_cpp  # noqa: F401  (fails loudly here rather than on the first request)
    print(f"[council-local] llama-cpp-python {llama_cpp.__version__} · GPU offload supported: {llama_cpp.llama_supports_gpu_offload()} · serving on http://127.0.0.1:{PORT} · override={OVERRIDE or '-'}", flush=True)
    print(f"[council-local] rails: one model resident, full GPU offload only, {N_THREADS} CPU threads, pause ≥ {THERMAL_PAUSE_C} °C / resume ≤ {THERMAL_RESUME_C} °C · GPU now {g['temp']} °C, {g['freeMb']} MiB free", flush=True)
    # no preload: the staged runner loads exactly the model it needs with POST /load and unloads it with POST /unload
    if os.environ.get("COUNCIL_LOCAL_PRELOAD", "0") == "1":
        preload = [OVERRIDE] if OVERRIDE and OVERRIDE in MODELS else list(dict.fromkeys(ROUTE.values()))[:RESIDENT]
        for k in preload:
            try:
                POOL.get(k)
            except Exception as e:
                print(f"[council-local] could not preload {k}: {e}", flush=True)
    # threaded so /health answers while a generation holds the model lock (generation itself is serialised by POOL.lock)
    from http.server import ThreadingHTTPServer
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
