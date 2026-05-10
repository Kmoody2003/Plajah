FROM node:20-alpine
WORKDIR /app

# Skip Chromium download — puppeteer is a dev tool, not needed in the server runtime
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

# Copy everything — CI has already built dist/ before docker build runs
COPY . .

EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
