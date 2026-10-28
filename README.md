# Marketplace

A multi-shop e-commerce website.

## Requirements

- Node 22
- pnpm 11
- Docker

## Install

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm admin:create
```

Fill in `.env` before running the other commands.

## Run

```bash
pnpm dev          # API: http://localhost:3000, web: http://localhost:5173
pnpm dev:worker   # background jobs
```

Sample data (optional, deletes existing dev data; needs `pnpm admin:create` first):

```bash
pnpm demo:seed
```

Demo accounts, password `demo password 123`: buyers `buyer@demo.vn`, `buyer2@demo.vn`; sellers `seller@demo.vn`, `seller2@demo.vn` and the other `@demo.vn` shops the script prints. The admin account is `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` in `.env`, created by `pnpm admin:create`.

## Run with Docker

```bash
pnpm app:up       # web: http://localhost:8080
pnpm app:down
```

## Test

```bash
pnpm test
pnpm --filter @ecommerce/api test:e2e
pnpm lint
```
