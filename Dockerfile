FROM node:20-alpine

# ffmpeg — generates cover+audio MP4s for social link previews so music plays inline on
# Facebook/Instagram (which only autoplay direct video/mp4, not HTML/audio players).
RUN apk add --no-cache ffmpeg

# Skip Chromium download — puppeteer is a dev tool, not needed in the server runtime
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# The application does not need root privileges at runtime. Limiting the container user
# reduces the impact of a server or dependency compromise. Everything under /app is owned
# by `node` as it is written — NOT by a trailing `RUN chown -R`, which rewrote every file
# (node_modules + the ~1.8 GB upload incl. dist/) into a second full image layer and pushed
# Cloud Build past its 30-minute deadline (DEADLINE_EXCEEDED, 2026-10-17).
WORKDIR /app
RUN chown node:node /app
USER node

# .npmrc carries legacy-peer-deps=true — without it, npm ci hard-fails on the
# @lumaai/luma-web ↔ @types/three peer conflict inside the container.
COPY --chown=node:node package*.json .npmrc ./
# Include dev deps: the server runs TypeScript directly via `tsx` (a devDependency),
# and NODE_ENV=production would otherwise make npm omit it.
RUN npm ci --include=dev

# Copy everything — CI has already built dist/ before the source is uploaded.
COPY --chown=node:node . .

# Cloud Run injects $PORT (defaults to 8080); server.ts binds it.
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
