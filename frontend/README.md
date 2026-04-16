# PacificaCopy — Frontend

Next.js 15 (App Router) client for PacificaCopy. Provides the leaderboard, trader profiles, follower dashboard, and copy-settings UI.

## Stack

- **Next.js 15** with App Router and Turbopack
- **React 19**
- **Tailwind CSS v4**
- **Recharts** for equity-curve charts
- **Privy React Auth** for Solana wallet login
- **@solana/web3.js** for address utilities

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | yes | Backend URL, e.g. `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | yes | Privy App ID |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | yes | Privy Client ID |
| `BACKEND_API_URL` | no | Server-side-only backend URL (falls back to `NEXT_PUBLIC_API_URL`) |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with hero, 3-step overview, and top traders preview |
| `/leaderboard` | Searchable, filterable trader leaderboard (auto-refreshes every 15 s) |
| `/traders/[wallet]` | Trader profile: account stats, equity chart, positions, trade history, copy button |
| `/dashboard` | Follower dashboard: PnL, active subscriptions, open copied positions |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
