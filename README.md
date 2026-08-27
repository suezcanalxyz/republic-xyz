# ATLAS

Real-time geopolitical intelligence platform: a 3D globe (CesiumJS) plotting live signals — GDELT news events, RSS feeds, submarine cable infrastructure, conflict/geo hotspots — scored, deduplicated and enriched by an LLM pipeline, served through Next.js and refreshed on a cron schedule.

**[republic.suezcanal.xyz](https://republic.suezcanal.xyz)**

## What it does

- Ingests live signals from multiple sources (GDELT doc API, RSS news, geo hotspot feeds, Telegram) on a twice-daily cron.
- Runs each batch through a two-pass enrichment pipeline (`lib/pipeline/enrichment-pipeline.ts`): deterministic ranking first (corroboration + recency + category weight), then LLM enrichment for only the top-N signals — summary rewrite, category confirmation, tag extraction, contradiction detection — so inference cost stays bounded and predictable.
- LLM layer (`lib/nim.ts`) is provider-agnostic over an OpenAI-compatible interface: NVIDIA NIM (Llama 3.1 70B) or Groq in production, falling back to local Ollama with zero API cost for self-hosted/dev use.
- Renders signals as an interactive Cesium globe with a command-bar search/filter UI and a signal inspector panel; results are cached (`lib/cache.ts`) and served through `/api/atlas/*` routes.

## Architecture

```text
app/api/atlas/     globe, search, signal detail routes
app/api/cron/       scheduled refresh endpoint (Bearer-authenticated)
lib/pipeline/        two-pass ranking + LLM enrichment engine
lib/sources/         GDELT, RSS, geo-hotspots, Telegram ingest adapters
lib/nim.ts           NIM/Groq/Ollama inference client
components/          CesiumGlobe, CommandBar, SignalInspector
prisma/              Postgres schema
ops/                 systemd unit, nginx config, deploy script for VM hosting
```

## Stack

Next.js 14 (App Router) · TypeScript · Prisma/PostgreSQL · CesiumJS · NVIDIA NIM / Groq / Ollama (LLM) · Vercel + Oracle VM deploy targets

## Run locally

```bash
cp .env.example .env.local   # fill DATABASE_URL, NEXT_PUBLIC_CESIUM_TOKEN, NVIDIA_NIM_API_KEY or leave for Ollama
npm install
npm run db:push
npm run dev
```

## Deployment

Two supported targets, see `ops/`:
- **Vercel** — `vercel.json`, cron-triggered refresh via `/api/cron/refresh`.
- **Self-hosted VM** — `ops/setup-vm.sh`, `ops/deploy-atlas.sh`, `ops/atlas.service` (systemd), `ops/nginx-atlas.conf` (reverse proxy), local Ollama for zero-cost inference.
