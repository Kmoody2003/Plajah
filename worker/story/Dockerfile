# Taleo Story Intelligence worker.
#
# A separate image and Cloud Run service from plajah-api (same reasoning as the demucs worker
# one directory up): the pipeline holds an ffmpeg transcode + shot detection of a full feature
# film, runs for many minutes per job, and must never share an instance with API traffic.
# Node + tsx (not a build step) to match how the main server runs.
#
# glibc, NOT Alpine: the tier-3 offline fallback (localModels.ts) depends on
# @huggingface/transformers, whose onnxruntime-node native addon only ships glibc prebuilt
# binaries — no musl/Alpine build exists. On node:20-alpine the addon fails to load at runtime
# despite installing cleanly, a very easy trap to hit (found live 2026-08-30 before it ever
# shipped). sharp (the same package's image decoder) also prefers glibc for its prebuilt.
FROM node:20-slim

# ffmpeg/ffprobe: proxy transcode from Mux HLS, shot detection, segmenting, stills.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npx", "tsx", "index.ts"]
