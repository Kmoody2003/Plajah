# Plajah Realtime — its own Cloud Run service next to plajah-api. Small image: only services/realtime + ws + tsx.
# Build from the REPO ROOT so the COPY paths resolve:
#   docker build -f services/realtime/deploy/Dockerfile -t plajah-realtime .
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node services/realtime/deploy/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
# Only the realtime service. settle.ts and client.ts sit in the folder but aren't loaded by main.ts.
COPY --chown=node:node services/realtime/ ./services/realtime/
EXPOSE 8080
CMD ["./node_modules/.bin/tsx", "services/realtime/main.ts"]
