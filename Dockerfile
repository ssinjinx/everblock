# Everblock multiplayer server (v6). Build: docker build -t everblock .   Run: see docker-compose.yml / SERVER.md
FROM node:20-bookworm-slim AS deps
WORKDIR /app/server
# better-sqlite3 ships prebuilt binaries for x64/arm64; if none fits, it is skipped (optional) and the
# server falls back to its JSON file store automatically
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATA_DIR=/data
WORKDIR /app
# the game page the server hands to browsers (same files as GitHub Pages) ...
COPY index.html manifest.webmanifest sw.js ./
COPY icons ./icons
# ... the shared game code the server simulates the world with ...
COPY source/src ./source/src
# ... and the server itself
COPY server/package.json server/index.js server/admin.js ./server/
COPY server/lib ./server/lib
COPY --from=deps /app/server/node_modules ./server/node_modules
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/server
CMD ["node", "index.js"]
