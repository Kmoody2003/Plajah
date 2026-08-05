"""Demucs stem-separation worker.

Runs as its own Cloud Run service, reachable only by plajah-api (service-to-service auth) —
never by a browser. The API validates the user and the source URL, then hands a job here.

Why a job API rather than a plain synchronous endpoint: htdemucs on CPU takes minutes for a
normal song, which outlives both the API's 300s timeout and any reasonable browser request.
So POST /jobs returns immediately and the work continues on a background thread.

That background thread only survives because the service is deployed with CPU always allocated
(--no-cpu-throttling). Under the default request-scoped CPU, Cloud Run throttles an instance to
near-zero once the response is sent and the job would crawl or stall. See DEPLOY.md.

Job state lives in GCS next to the stems, not in memory: the service scales to zero between
jobs, and in-process state would vanish with it.
"""

import os
import json
import shutil
import tempfile
import threading
import subprocess
import urllib.request
from pathlib import Path

from flask import Flask, request, jsonify
from google.cloud import storage

app = Flask(__name__)

BUCKET = os.environ.get("STORAGE_BUCKET", "")
STEM_NAMES = ("vocals", "drums", "bass", "other")
# A separation reads the whole file into memory in the model; a huge upload is either a mistake
# or an attack. 200MB is comfortably above a long lossless song.
MAX_INPUT_BYTES = 200 * 1024 * 1024
MODEL = "htdemucs"

_gcs = storage.Client() if BUCKET else None


def _blob(path: str):
    return _gcs.bucket(BUCKET).blob(path)


def _write_status(job_id: str, **fields) -> None:
    """Publish job state. Best-effort: losing a status update must not kill the job itself."""
    try:
        _blob(f"demucs-stems/{job_id}/status.json").upload_from_string(
            json.dumps(fields), content_type="application/json"
        )
    except Exception as e:  # noqa: BLE001 — status is advisory, never fatal
        app.logger.warning("status write failed for %s: %s", job_id, e)


def _read_status(job_id: str):
    try:
        return json.loads(_blob(f"demucs-stems/{job_id}/status.json").download_as_bytes())
    except Exception:  # noqa: BLE001 — absent or unreadable both mean "nothing to report"
        return None


def _download(url: str, dest: Path) -> None:
    """Fetch the source audio, refusing anything oversized.

    The API is what validates the URL's host; this is the size guard the API can't apply,
    since it never sees the body. Streamed rather than read whole so an oversized file is
    rejected partway instead of after it has already been buffered.
    """
    with urllib.request.urlopen(url, timeout=120) as resp:  # noqa: S310 — host allow-listed upstream
        declared = resp.headers.get("Content-Length")
        if declared and int(declared) > MAX_INPUT_BYTES:
            raise ValueError("input audio too large")
        written = 0
        with open(dest, "wb") as fh:
            while chunk := resp.read(1 << 20):
                written += len(chunk)
                if written > MAX_INPUT_BYTES:
                    raise ValueError("input audio too large")
                fh.write(chunk)
    if dest.stat().st_size < 1024:
        raise ValueError("input audio empty or unreadable")


def _separate(job_id: str, url: str) -> None:
    """Run demucs and publish the stems. Owns the whole lifecycle of one job."""
    work = Path(tempfile.mkdtemp(prefix=f"demucs_{job_id}_"))
    try:
        _write_status(job_id, status="running", stage="fetching")
        src = work / "input"
        _download(url, src)

        _write_status(job_id, status="running", stage="separating")
        out_dir = work / "out"
        proc = subprocess.run(
            ["python", "-m", "demucs", "-n", MODEL, "-o", str(out_dir), str(src)],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            # Only the tail is useful and it can be long; keep the status doc small.
            raise RuntimeError(f"demucs failed: {proc.stderr[-500:]}")

        # demucs writes to <out>/<model>/<input stem name>/<stem>.wav
        model_dir = out_dir / MODEL
        subdirs = [d for d in model_dir.iterdir() if d.is_dir()] if model_dir.exists() else []
        if not subdirs:
            raise RuntimeError("demucs produced no output")

        _write_status(job_id, status="running", stage="uploading")
        produced = []
        for stem in STEM_NAMES:
            path = subdirs[0] / f"{stem}.wav"
            if not path.exists():
                continue
            _blob(f"demucs-stems/{job_id}/{stem}.wav").upload_from_filename(
                str(path), content_type="audio/wav"
            )
            produced.append(stem)

        if not produced:
            raise RuntimeError("no stems were produced")
        _write_status(job_id, status="done", stems=produced)
    except Exception as e:  # noqa: BLE001 — every failure must reach the client as a status
        app.logger.exception("job %s failed", job_id)
        _write_status(job_id, status="error", message=str(e)[:400])
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/jobs")
def create_job():
    if not _gcs:
        return jsonify(ok=False, message="STORAGE_BUCKET not configured"), 500
    body = request.get_json(silent=True) or {}
    job_id, url = body.get("jobId"), body.get("url")
    if not job_id or not str(job_id).isalnum():
        return jsonify(ok=False, message="alphanumeric jobId required"), 400
    if not url or not isinstance(url, str):
        return jsonify(ok=False, message="url required"), 400

    _write_status(job_id, status="queued")
    # Daemon thread: a redeploy mid-job should not block the instance from going down. The job
    # is lost in that case, which the client sees as a stalled status and can retry.
    threading.Thread(target=_separate, args=(job_id, url), daemon=True).start()
    return jsonify(ok=True, jobId=job_id, status="queued"), 202


@app.get("/jobs/<job_id>")
def job_status(job_id: str):
    if not job_id.isalnum():
        return jsonify(ok=False, message="bad jobId"), 400
    status = _read_status(job_id)
    if not status:
        return jsonify(ok=False, status="unknown"), 404
    return jsonify(ok=True, **status)


@app.get("/health")
def health():
    return jsonify(ok=True, model=MODEL, bucket=bool(BUCKET))
