FROM node:20-alpine
WORKDIR /app

# Skip Chromium download — puppeteer is a dev tool, not needed in the server runtime
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# .npmrc carries legacy-peer-deps=true — without it, npm ci hard-fails on the
# @lumaai/luma-web ↔ @types/three peer conflict inside the container.
COPY package*.json .npmrc ./
# Include dev deps: the server runs TypeScript directly via `tsx` (a devDependency),
# and NODE_ENV=production would otherwise make npm omit it.
RUN npm ci --include=dev

# Copy everything — CI has already built dist/ before the source is uploaded.
COPY . .

# Cloud Run injects $PORT (defaults to 8080); server.ts binds it.
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
