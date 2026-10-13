import os
import sys
import time
import urllib.request

URL = "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf"
DEST = r"D:\Plajah Models\llm\gemma-2-2b-it-Q4_K_M.gguf"
PART = DEST + ".part"

print(f"[DOWNLOAD] Target: {DEST}")
headers = {
    "User-Agent": "PlajahNativeEngine/1.0"
}

existing_bytes = 0
if os.path.exists(PART):
    existing_bytes = os.path.getsize(PART)
    print(f"[DOWNLOAD] Resuming from byte {existing_bytes} ({round(existing_bytes / (1024*1024), 2)} MB)...")

req = urllib.request.Request(URL, headers=headers)
if existing_bytes > 0:
    req.add_header("Range", f"bytes={existing_bytes}-")

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        content_range = resp.headers.get("Content-Range")
        total_size = None
        if content_range:
            total_size = int(content_range.split("/")[-1])
        else:
            cl = resp.headers.get("Content-Length")
            if cl:
                total_size = int(cl) + existing_bytes

        print(f"[DOWNLOAD] Connected. Total size: {round(total_size / (1024*1024), 2) if total_size else 'unknown'} MB")

        mode = "ab" if existing_bytes > 0 else "wb"
        downloaded = existing_bytes
        start_time = time.time()
        last_log = time.time()

        with open(PART, mode) as out_file:
            chunk_size = 4 * 1024 * 1024  # 4 MB chunks for high throughput
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)
                now = time.time()
                if now - last_log >= 3.0:
                    speed = (downloaded - existing_bytes) / max(0.1, now - start_time) / (1024 * 1024)
                    pct = (downloaded / total_size * 100) if total_size else 0
                    print(f"[DOWNLOAD] {round(downloaded / (1024*1024), 1)} MB / {round(total_size / (1024*1024), 1) if total_size else '?'} MB ({pct:.1f}%) at {speed:.2f} MB/s")
                    last_log = now

    if os.path.exists(DEST):
        os.remove(DEST)
    os.rename(PART, DEST)
    print(f"[SUCCESS] Gemma 2 2B GGUF saved to {DEST} ({os.path.getsize(DEST)} bytes)")
except Exception as e:
    print(f"[ERROR] Download encountered: {e}")
    sys.exit(1)
