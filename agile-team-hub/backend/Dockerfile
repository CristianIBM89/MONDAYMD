# ── Build stage ────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production stage ───────────────────────────────────────────────
FROM node:22-alpine AS production

# Create non-root user
RUN addgroup -S athub && adduser -S athub -G athub
WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Create logs dir with correct ownership
RUN mkdir -p logs && chown -R athub:athub /app
USER athub

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:${PORT:-3001}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3001
CMD ["node", "dist/server.js"]
