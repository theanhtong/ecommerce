FROM node:22-slim AS base
# Prisma's schema engine needs OpenSSL for migrate deploy.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG DEMO_LOGIN=false
ARG DEMO_ADMIN_EMAIL
ARG DEMO_ADMIN_PASSWORD
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ecommerce/db build \
  && pnpm --filter @ecommerce/api build \
  && pnpm --filter @ecommerce/web build

# One image runs the API, the worker and the migrate step.
# shortcut: keeps dev dependencies because migrate and the region seed need the Prisma CLI and pg; split a slim runtime image when size matters.
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM nginx:1.27-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
