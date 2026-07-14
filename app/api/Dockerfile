FROM oven/bun:1.1.45-alpine

WORKDIR /workspace
COPY package.json bun.lockb ./
COPY app/api/package.json app/api/package.json
COPY app/web/package.json app/web/package.json
RUN bun install --frozen-lockfile --production

COPY app/api app/api
WORKDIR /workspace/app/api

EXPOSE 3001
CMD ["bun", "run", "start"]
