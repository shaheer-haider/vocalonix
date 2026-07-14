FROM oven/bun:1.1.45-alpine AS builder

WORKDIR /workspace
COPY package.json bun.lockb ./
COPY app/api/package.json app/api/package.json
COPY app/web/package.json app/web/package.json
RUN bun install --frozen-lockfile

COPY app/web app/web
COPY dograh/ui/public/embed/dograh-widget.js dograh/ui/public/embed/dograh-widget.js
ARG VITE_API_BASE_URL=http://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN bun run --cwd app/web build

FROM nginx:1.27-alpine
COPY app/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/app/web/dist /usr/share/nginx/html
EXPOSE 3000
