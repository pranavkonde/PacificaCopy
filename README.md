# PacificaCopy

Copy trading UI and engine for the Pacifica Hackathon: leaderboard and trader profiles backed by Supabase, a FastAPI copy loop that mirrors expert positions (Pacifica REST for live experts, built-in simulation for seeded demo traders), and a Next.js client with Privy (Solana embedded wallet), Recharts, and a Bloomberg-style dark layout.

## Prerequisites

- Node 20+ and Python 3.11+
- A [Supabase](https://supabase.com) project (URL + service role key)
- A [Privy](https://privy.io) app (App ID + **App client ID** for the React SDK, plus App Secret + optional JWT verification key for the API)

## 1. Database

In the Supabase SQL editor (or CLI), run the migrations in order:

- `supabase/migrations/20260415120000_initial_schema.sql`
- `supabase/migrations/20260415120001_seed_traders.sql`

This creates public tables with RLS: leaderboard data is readable by the anon role; follower data has no public policies and is only touched by the backend using the service role (bypasses RLS).

## 2. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill SUPABASE_*, PRIVY_*, optional PACIFICA_API_BASE, CORS_ORIGINS
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- **Pacifica:** experts with `is_simulated = false` sync from `GET /positions?account=…`. Simulated experts use the in-database simulator in `app/copy_engine.py`.
- **Follower orders:** real signed Pacifica order placement requires each user’s keys; this repo mirrors positions in Postgres and updates PnL from mark prices (production path would plug in per-user signing or agent keys).
- **Local auth shortcut:** set `DEV_SKIP_PRIVY=true` and send `Authorization: Bearer dev` with header `X-Wallet-Address` to bypass Privy verification (development only).

## 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL (e.g. http://127.0.0.1:8000), NEXT_PUBLIC_PRIVY_APP_ID, NEXT_PUBLIC_PRIVY_CLIENT_ID
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API surface (FastAPI)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | Liveness |
| GET | `/api/landing-preview` | Top 3 traders for the landing table |
| GET | `/api/leaderboard` | `period=week|month|all`, `search`, `limit` |
| GET | `/api/traders/{wallet}` | Profile + open/closed expert trades |
| GET | `/api/traders/{wallet}/equity` | Equity curve points |
| POST | `/api/me/copy/{expert_wallet}` | Start copy (Privy + `X-Wallet-Address`) |
| POST | `/api/me/copy/{subscription_id}/stop` | Stop copying |
| GET | `/api/me/dashboard` | Follower dashboard |

Authenticated requests must include `Authorization: Bearer <Privy access token>` and `X-Wallet-Address: <linked Solana address>`.
