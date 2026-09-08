# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY tsconfig.json ./
COPY public ./public
COPY src ./src

# Pass backend URL at build time
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN npm run build

# ── Production stage (nginx) ─────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config — handles React Router (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/build /usr/share/nginx/html

# Non-root user
RUN addgroup -S athub && adduser -S athub -G athub \
    && chown -R athub:athub /usr/share/nginx/html \
    && chown -R athub:athub /var/cache/nginx \
    && chown -R athub:athub /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown athub:athub /var/run/nginx.pid

USER athub

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
