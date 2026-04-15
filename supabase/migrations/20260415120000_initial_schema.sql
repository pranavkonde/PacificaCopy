-- PacificaCopy initial schema
-- Public read for leaderboard/profile; sensitive tables have no anon policies.

create extension if not exists "pgcrypto";

create table public.traders (
  wallet text primary key,
  profit_week numeric not null default 0,
  profit_month numeric not null default 0,
  profit_all_time numeric not null default 0,
  win_rate numeric not null default 0,
  follower_count integer not null default 0,
  total_trades integer not null default 0,
  biggest_win numeric not null default 0,
  biggest_loss numeric not null default 0,
  avg_hold_seconds integer not null default 0,
  is_simulated boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.trader_equity_curve (
  id bigserial primary key,
  trader_wallet text not null references public.traders (wallet) on delete cascade,
  ts timestamptz not null,
  cumulative_pnl numeric not null
);

create index trader_equity_curve_trader_ts_idx
  on public.trader_equity_curve (trader_wallet, ts);

create table public.expert_open_positions (
  id uuid primary key default gen_random_uuid(),
  trader_wallet text not null references public.traders (wallet) on delete cascade,
  symbol text not null,
  side text not null,
  amount numeric not null,
  entry_price numeric not null,
  funding numeric not null default 0,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'simulated',
  unique (trader_wallet, symbol, side)
);

create index expert_open_positions_wallet_idx on public.expert_open_positions (trader_wallet);

create table public.expert_closed_trades (
  id uuid primary key default gen_random_uuid(),
  trader_wallet text not null references public.traders (wallet) on delete cascade,
  symbol text not null,
  side text not null,
  amount numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  realized_pnl numeric not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now()
);

create index expert_closed_trades_wallet_idx on public.expert_closed_trades (trader_wallet);

create table public.copy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null,
  follower_wallet text not null,
  expert_wallet text not null references public.traders (wallet),
  allocation_usdc numeric not null,
  max_loss_usdc numeric not null,
  max_trade_size_usdc numeric not null,
  max_concurrent_trades integer not null,
  status text not null default 'active',
  realized_pnl numeric not null default 0,
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);

create unique index copy_subscriptions_active_pair_uidx
  on public.copy_subscriptions (follower_wallet, expert_wallet)
  where status = 'active';

create index copy_subscriptions_follower_idx on public.copy_subscriptions (follower_wallet);
create index copy_subscriptions_expert_idx on public.copy_subscriptions (expert_wallet);
create index copy_subscriptions_status_idx on public.copy_subscriptions (status);

create table public.copied_positions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.copy_subscriptions (id) on delete cascade,
  expert_position_id uuid references public.expert_open_positions (id) on delete set null,
  symbol text not null,
  side text not null,
  amount numeric not null,
  entry_price numeric not null,
  notional_usdc numeric not null,
  unrealized_pnl numeric not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open'
);

create index copied_positions_subscription_idx on public.copied_positions (subscription_id);
create index copied_positions_status_idx on public.copied_positions (status);

create table public.copy_activity_log (
  id bigserial primary key,
  subscription_id uuid references public.copy_subscriptions (id) on delete set null,
  expert_wallet text,
  event_type text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index copy_activity_log_subscription_idx on public.copy_activity_log (subscription_id);

-- RLS
alter table public.traders enable row level security;
alter table public.trader_equity_curve enable row level security;
alter table public.expert_open_positions enable row level security;
alter table public.expert_closed_trades enable row level security;
alter table public.copy_subscriptions enable row level security;
alter table public.copied_positions enable row level security;
alter table public.copy_activity_log enable row level security;

create policy traders_select_public on public.traders for select using (true);
create policy trader_equity_curve_select_public on public.trader_equity_curve for select using (true);
create policy expert_open_positions_select_public on public.expert_open_positions for select using (true);
create policy expert_closed_trades_select_public on public.expert_closed_trades for select using (true);
