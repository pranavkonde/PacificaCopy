# PacificaCopy

Automated copy-trading terminal for [Pacifica DEX](https://pacifica.exchange) on Solana. Discover top perpetuals traders via a live leaderboard, inspect their profiles, and mirror their positions automatically — with configurable risk controls.

**Demo video:** [Watch on Google Drive](https://drive.google.com/file/d/1LFBe88yTeze_iqc3NGKWJ1_P37Be_d4J/view?usp=sharing)

## How it works

1. **Leaderboard** — Ranks wallets by PnL (24h / 7d / 30d / all-time), equity, volume, and follower count. Data comes from Pacifica's native leaderboard API, cached and refreshed every 15 s.
2. **Trader profiles** — Per-wallet pages showing account balance & equity, open positions (symbol, side, entry, leverage), trade history with per-trade PnL, an equity-curve chart, and computed stats (win rate, biggest win/loss, total trades).
3. **Copy with risk controls** — Authenticated users subscribe to any trader with four parameters: USDC allocation, max loss threshold, max single position size, and max concurrent trades.
4. **Copy engine** — A background async loop in the FastAPI backend polls Pacifica every few seconds, syncs expert positions, and mirrors opens/closes into follower accounts. When an expert closes a position, all follower copies settle automatically. If cumulative loss hits the threshold, the subscription auto-stops.
5. **Dashboard** — Followers see total realized + unrealized PnL, active subscriptions with per-trader contribution, and every open copied position in real time.

## Architecture

```
┌────────────────────────┐        ┌─────────────────────────┐
│  Next.js 15 (App Router)│  API   │  FastAPI  (async)        │
│  Tailwind v4 · Recharts │───────▶│  Privy JWT auth          │
│  Privy React Auth        │  proxy │  Copy engine loop        │
│  localhost:3000          │        │  Pacifica REST client    │
└────────────────────────┘        │  localhost:8000          │
                                   └──────────┬──────────────┘
                                              │
                          ┌───────────────────┴───────────────────┐
                          │                                       │
                  ┌───────▼───────┐                     ┌─────────▼─────────┐
                  │  Supabase      │                     │  Pacifica API      │
                  │  (Postgres)    │                     │  api.pacifica.fi   │
                  │  Subscriptions │                     │  Positions, trades │
                  │  Positions     │                     │  Prices, orderbook │
                  │  Activity log  │                     │  Leaderboard       │
                  └───────────────┘                     └───────────────────┘
```

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 15 (App Router, Turbopack), React 19, Tailwind CSS v4, Recharts, Privy React Auth, Solana web3.js |
| Backend | FastAPI, Uvicorn, httpx (async HTTP), Pydantic Settings, Privy JWT verification |
| Database | Supabase (Postgres with RLS) |
| External | Pacifica REST API v1 — 12+ endpoints (prices, orderbook, candles, funding history, account, positions, trades, portfolio, leaderboard) |

## Prerequisites

- **Node 20+** and **Python 3.11+**
- A [Supabase](https://supabase.com) project (URL + service-role key)
- A [Privy](https://privy.io) app (App ID + App Client ID for the React SDK; App Secret + optional JWT verification key for the API)

## 1 — Database

Run the migrations in the Supabase SQL editor (or via CLI):

```bash
supabase/migrations/20260415120000_initial_schema.sql
supabase/migrations/20260415120001_seed_traders.sql
```

This creates public tables with RLS. Leaderboard data is readable via the anon role; follower data has no public policies and is only accessed by the backend using the service-role key.

## 2 — Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then fill in the values below
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Backend environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | yes | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | Supabase service-role key (bypasses RLS) |
| `PRIVY_APP_ID` | yes | — | Privy application ID |
| `PRIVY_APP_SECRET` | yes | — | Privy application secret |
| `PRIVY_VERIFICATION_KEY` | no | — | Privy JWT verification public key |
| `PACIFICA_API_BASE` | no | `https://api.pacifica.fi/api/v1` | Pacifica REST base URL |
| `COPY_POLL_INTERVAL_SECONDS` | no | `4` | How often the copy engine polls (seconds) |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated allowed origins |
| `DEV_SKIP_PRIVY` | no | `false` | Set `true` to bypass Privy auth in dev (use `Authorization: Bearer dev` + `X-Wallet-Address` header) |

## 3 — Frontend

```bash
cd frontend
cp .env.example .env.local    # then fill in the values below
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Frontend environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | yes | Backend URL, e.g. `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | yes | Privy App ID |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | yes | Privy Client ID (for the React SDK) |
| `BACKEND_API_URL` | no | Server-side-only backend URL (falls back to `NEXT_PUBLIC_API_URL`) |

## API reference

### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/landing-preview` | Top 8 traders for the landing hero |
| GET | `/api/leaderboard?period=&search=&limit=` | Ranked leaderboard (`week` / `month` / `all`) |
| GET | `/api/traders/{wallet}` | Full trader profile + open positions + recent trades |
| GET | `/api/traders/{wallet}/equity?time_range=` | Equity-curve data points |

### Pacifica proxy endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pacifica/markets?limit=` | Markets enriched with price data |
| GET | `/api/pacifica/prices` | Full price rows (mark, mid, oracle, OI, volume, funding) |
| GET | `/api/pacifica/trades?symbol=` | Recent trades for a symbol |
| GET | `/api/pacifica/candles?symbol=&interval=&hours=` | OHLCV candle data |
| GET | `/api/pacifica/book/{symbol}` | Orderbook (bids + asks) |
| GET | `/api/pacifica/funding-history/{symbol}` | Funding rate history |
| GET | `/api/pacifica/account/{wallet}` | Account info (balance, equity, margin, fees) |
| GET | `/api/pacifica/account/{wallet}/positions` | Open positions |
| GET | `/api/pacifica/account/{wallet}/trades` | Trade history |
| GET | `/api/pacifica/account/{wallet}/equity` | Portfolio / equity history |
| GET | `/api/pacifica/leaderboard` | Native Pacifica leaderboard (enriched with follower counts) |

### Authenticated endpoints

All require `Authorization: Bearer <Privy access token>` and `X-Wallet-Address: <Solana address>`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/me/copy/{expert_wallet}` | Start copying a trader (body: allocation, max loss, max trade size, max concurrent) |
| POST | `/api/me/copy/{subscription_id}/stop` | Stop a copy subscription |
| GET | `/api/me/dashboard` | Follower dashboard (PnL, subscriptions, open positions) |

## Copy engine details

The copy engine runs as a background `asyncio` task alongside the FastAPI server:

1. **Sync** — For each expert with active followers, fetch their current positions from Pacifica and diff against the local `expert_open_positions` table.
2. **Mirror opens** — New expert positions are proportionally scaled (capped by `max_trade_size_usdc`) and inserted as `copied_positions`.
3. **Mirror closes** — When an expert position disappears, all follower copies are closed at the current mark price and PnL is settled.
4. **Risk check** — Before opening and on every cycle, cumulative (realized + unrealized) PnL is checked against `max_loss_usdc`. If breached, the subscription is auto-stopped and all positions are settled.
5. **Mark-to-market** — Unrealized PnL on every open copied position is updated using live mark prices every cycle.
6. **Activity log** — Every event (open, close, skip, auto-stop) is written to `copy_activity_log` for full auditability.

## Project structure

```
PacificaCopy/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + copy engine lifecycle
│   │   ├── config.py            # Pydantic settings from .env
│   │   ├── db.py                # Supabase client singleton
│   │   ├── auth_privy.py        # Privy JWT verification middleware
│   │   ├── pacifica_client.py   # Async Pacifica REST client (12+ endpoints)
│   │   ├── copy_engine.py       # Background copy loop + position mirroring
│   │   ├── schemas.py           # Pydantic models
│   │   └── routers/
│   │       ├── public.py        # Leaderboard, trader profiles, equity curves
│   │       ├── user.py          # Authenticated: copy, stop, dashboard
│   │       └── pacifica.py      # Proxy/enrichment for Pacifica data
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Landing page
│   │   ├── leaderboard/         # Leaderboard with search + period filters
│   │   ├── dashboard/           # Follower dashboard (auth required)
│   │   ├── traders/[wallet]/    # Trader profile + copy button
│   │   └── api/proxy/           # Next.js API route → backend proxy
│   ├── components/
│   │   ├── copy-settings-modal.tsx  # Risk configuration form
│   │   ├── pacifica-live-panel.tsx  # Live market context panel
│   │   ├── nav.tsx                  # Navigation bar
│   │   └── providers.tsx            # Privy + app providers
│   ├── lib/
│   │   ├── api.ts               # Typed fetch helper
│   │   ├── format.ts            # USD / percent / duration formatters
│   │   ├── wallet.ts            # Solana wallet extraction from Privy user
│   │   └── privy-env.ts         # Privy config availability check
│   └── package.json
└── supabase/
    └── migrations/              # SQL schema + seed data
```

## License

MIT
