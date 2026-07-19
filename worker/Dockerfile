# Demucs stem-separation worker.
#
# Deliberately a SEPARATE image and service from plajah-api. Demucs pulls torch, which has no
# musl wheels (so Alpine is out) and lands around 2GB — putting that on the API image would tax
# every cold start of every endpoint. It also wants 8GB and minutes of CPU per song, and an OOM
# here must not take the API down with it.
FROM python:3.11-slim

WORKDIR /app

# ffmpeg: demucs reads/writes through it for anything that isn't plain WAV.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch. The default index would pull the CUDA build — several GB of driver payload
# that is dead weight on a CPU Cloud Run service.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

# Bake the model weights into the image. Downloading htdemucs on first request would add minutes
# to a cold start and make the service fail entirely if the upstream host is unreachable.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY app.py ./

ENV PYTHONUNBUFFERED=1

# One request at a time — demucs saturates every core it is given, so a second concurrent
# separation on the same instance makes both slower and risks the OOM killer. Concurrency is
# also capped at the Cloud Run service level; this is the second line of defence.
# Threads, not processes: the job runs on a background thread and must share process memory.
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "4", "--timeout", "3600", "app:app"]
