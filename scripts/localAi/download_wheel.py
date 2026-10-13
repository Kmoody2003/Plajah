import os
import sys
import time
import urllib.request

URL = "https://github.com/abetlen/llama-cpp-python/releases/download/v0.3.36-cu124/llama_cpp_python-0.3.36-py3-none-win_amd64.whl"
DEST = r"D:\Plajah Models\wheel\llama_cpp_python-0.3.36-py3-none-win_amd64.whl"
PART = DEST + ".part"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

existing_bytes = 0
if os.path.exists(PART):
    existing_bytes = os.path.getsize(PART)

req = urllib.request.Request(URL, headers=headers)
if existing_bytes > 0:
    req.add_header("Range", f"bytes={existing_bytes}-")

print(f"[WHEEL] Downloading {URL} (Resuming from {existing_bytes} bytes)...", flush=True)

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        cl = resp.headers.get("Content-Length")
        total_size = (int(cl) + existing_bytes) if cl else None
        print(f"[WHEEL] Total size: {round(total_size/(1024*1024), 2) if total_size else '?'} MB", flush=True)

        mode = "ab" if existing_bytes > 0 else "wb"
        downloaded = existing_bytes
        start_time = time.time()
        last_log = time.time()

        with open(PART, mode) as f:
            while True:
                chunk = resp.read(2 * 1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                f.flush()
                downloaded += len(chunk)
                now = time.time()
                if now - last_log >= 3.0:
                    speed = (downloaded - existing_bytes) / max(0.1, now - start_time) / (1024 * 1024)
                    print(f"[WHEEL] {round(downloaded/(1024*1024), 1)} MB / {round(total_size/(1024*1024), 1) if total_size else '?'} MB at {speed:.2f} MB/s", flush=True)
                    last_log = now

    if os.path.exists(DEST):
        os.remove(DEST)
    os.rename(PART, DEST)
    print(f"[WHEEL SUCCESS] Downloaded to {DEST} ({os.path.getsize(DEST)} bytes)", flush=True)
except Exception as e:
    print(f"[WHEEL ERROR] {e}", flush=True)
    sys.exit(1)
