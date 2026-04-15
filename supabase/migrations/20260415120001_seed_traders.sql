-- Deterministic seed: mixed demo dataset
-- Top wallets are marked as Pacifica-synced, others simulated.
insert into public.traders (
  wallet, profit_week, profit_month, profit_all_time, win_rate, follower_count,
  total_trades, biggest_win, biggest_loss, avg_hold_seconds, is_simulated
)
select
  'Pac' || substr(md5(i::text), 1, 41) as wallet,
  (950 - i * 22 + (i % 4) * 8)::numeric(18, 2) as profit_week,
  (4400 - i * 95 + (i % 5) * 30)::numeric(18, 2) as profit_month,
  (18000 - i * 260)::numeric(18, 2) as profit_all_time,
  least(75, greatest(44, 64 - (i / 3)))::numeric(5, 2) as win_rate,
  (i * 3 + (i % 5) * 7) as follower_count,
  60 + (i * 3) as total_trades,
  (300 + i * 32)::numeric(18, 2) as biggest_win,
  (-(120 + i * 14))::numeric(18, 2) as biggest_loss,
  (1800 + (i % 13) * 600) as avg_hold_seconds,
  case when i <= 10 then false else true end as is_simulated
from generate_series(1, 50) as s(i)
on conflict (wallet) do nothing;

-- Equity curve points (last 30 days, daily)
insert into public.trader_equity_curve (trader_wallet, ts, cumulative_pnl)
select
  t.wallet,
  now() - (d || ' days')::interval,
  (t.profit_all_time * (d / 30.0) + sin(d + length(t.wallet)) * (t.profit_all_time * 0.02))::numeric(18, 2)
from public.traders t
cross join generate_series(0, 29) d;

-- Top experts: a few open positions for leaderboard preview realism
insert into public.expert_open_positions (
  trader_wallet, symbol, side, amount, entry_price, funding, opened_at, updated_at, source
)
select wallet, v.symbol, v.side, v.amount::numeric, v.entry::numeric, '0'::numeric, now() - interval '2 hours', now(), 'simulated'
from public.traders t
cross join lateral (
  values
    ('BTC', 'bid', '0.12', '98234.5'),
    ('ETH', 'ask', '4.5', '3421.1'),
    ('SOL', 'bid', '80', '142.33')
) as v(symbol, side, amount, entry)
where t.wallet in (
  select wallet from public.traders order by profit_all_time desc limit 3
)
on conflict (trader_wallet, symbol, side) do nothing;

-- Closed trades for profile depth
insert into public.expert_closed_trades (
  trader_wallet, symbol, side, amount, entry_price, exit_price, realized_pnl, opened_at, closed_at
)
select
  t.wallet,
  case (i % 3) when 0 then 'BTC' when 1 then 'ETH' else 'SOL' end,
  case (i % 2) when 0 then 'bid' else 'ask' end,
  (0.05 + (i % 5) * 0.02)::numeric,
  (90000 + i * 50)::numeric,
  (90500 + i * 40)::numeric,
  (120 + i * 15 - (i % 4) * 60)::numeric,
  now() - ((i + 1) || ' days')::interval,
  now() - (i || ' days')::interval
from public.traders t
cross join generate_series(1, 8) i
where t.wallet in (select wallet from public.traders order by profit_all_time desc limit 5);
