# Taleo Story Intelligence worker.
#
# A separate image and Cloud Run service from plajah-api (same reasoning as the demucs worker
# one directory up): the pipeline holds an ffmpeg transcode + shot detection of a full feature
# film, runs for many minutes per job, and must never share an instance with API traffic.
# Node + tsx (not a build step) to match how the main server runs.
FROM node:20-alpine

# ffmpeg/ffprobe: proxy transcode from Mux HLS, shot detection, segmenting, stills.
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npx", "tsx", "index.ts"]
