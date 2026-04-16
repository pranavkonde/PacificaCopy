"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { apiFetch, ApiError } from "@/lib/api";
import { formatUsd, shortAddress } from "@/lib/format";
import { hasPrivyConfig } from "@/lib/privy-env";
import { solanaWalletFromUser } from "@/lib/wallet";

type Subscription = { id: string; expert_wallet: string; allocation_usdc: string; realized_pnl: string };
type CopiedPosition = {
  id: string;
  expert_wallet?: string;
  symbol: string;
  side: string;
  amount: string | number;
  entry_price: string | number;
  notional_usdc: string | number;
  unrealized_pnl: string | number;
};
type Dashboard = {
  total_realized_pnl: string;
  total_unrealized_pnl: string;
  total_profit_copy_trading: string;
  active_subscriptions: Subscription[];
  open_copied_positions: CopiedPosition[];
};

export default function DashboardPage() {
  if (!hasPrivyConfig) {
    return (
      <section className="section-spacious border-t border-[var(--fg)]">
        <p className="eyebrow">Configuration required</p>
        <p className="mt-3 text-[var(--muted-fg)]">Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID in frontend/.env.local.</p>
      </section>
    );
  }
  return <DashboardInner />;
}

function DashboardInner() {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const follower = solanaWalletFromUser(user);
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!follower) {
      setData(null);
      return;
    }
    setErr(null);
    try {
      const token = await getAccessToken();
      if (!token) return setErr("No session token");
      const d = await apiFetch<Dashboard>("/api/me/dashboard", { accessToken: token, wallet: follower });
      setData(d);
    } catch (e) {
      if (e instanceof ApiError) {
        let msg = e.body;
        try {
          const j = JSON.parse(e.body) as { detail?: string };
          if (typeof j.detail === "string") msg = j.detail;
        } catch {}
        setErr(msg);
      } else setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [follower, getAccessToken]);

  useEffect(() => {
    if (!ready || !authenticated || !follower) return;
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [ready, authenticated, follower, load]);

  if (!ready) return <p className="text-[var(--muted-fg)]">Loading...</p>;
  if (!authenticated) {
    return (
      <section className="section-spacious border-t border-[var(--fg)] text-center">
        <h1 className="editorial-title text-5xl">Dashboard</h1>
        <p className="mt-4 text-[var(--muted-fg)]">Connect your wallet to inspect copy allocations.</p>
        <button type="button" onClick={() => login()} className="btn-primary mt-8">
          <span>Connect wallet</span>
        </button>
      </section>
    );
  }
  if (!follower) return <p className="text-[var(--muted-fg)]">Waiting for embedded Solana wallet...</p>;

  const total = data?.total_profit_copy_trading ?? "0";

  return (
    <div className="space-y-14">
      <header className="section-spacious border-t border-[var(--fg)] pb-8">
        <p className="eyebrow">Copy control center</p>
        <h1 className="editorial-title mt-3 text-5xl md:text-7xl">Portfolio <span className="editorial-italic">Dashboard</span></h1>
        <p className="mt-2 text-xs text-[var(--muted-fg)]">{follower}</p>
      </header>

      {err && <p className="text-sm text-red-700">{err}</p>}

      <section className="grid gap-8 border-t border-[var(--fg)] py-8 md:grid-cols-3">
        <article className="editorial-card md:col-span-2">
          <p className="eyebrow">Total copy PnL</p>
          <p className={`mt-3 text-5xl ${Number(total) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(total)}</p>
          {data && <p className="mt-2 text-sm text-[var(--muted-fg)]">Realized {formatUsd(data.total_realized_pnl)} · Unrealized {formatUsd(data.total_unrealized_pnl)}</p>}
        </article>
      </section>

      <section className="border-t border-[var(--fg)] pt-6">
        <h2 className="editorial-title text-4xl">Traders you copy</h2>
        <p className="mt-2 text-sm text-[var(--muted-fg)]">Active subscriptions and control</p>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[740px]">
            <thead>
              <tr>
                <th>Expert</th>
                <th className="text-right">Allocation</th>
                <th className="text-right">Realized PnL</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.active_subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[var(--muted-fg)]">No active subscriptions yet. <Link href="/leaderboard" className="hover:text-[var(--accent)]">Browse leaderboard</Link>.</td>
                </tr>
              ) : (
                data.active_subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/traders/${encodeURIComponent(s.expert_wallet)}`} className="hover:text-[var(--accent)]">{shortAddress(s.expert_wallet, 8, 6)}</Link></td>
                    <td className="text-right">{formatUsd(s.allocation_usdc)}</td>
                    <td className={`text-right ${Number(s.realized_pnl) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(s.realized_pnl)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-secondary h-10 px-4"
                        disabled={busyId === s.id}
                        onClick={async () => {
                          setBusyId(s.id);
                          try {
                            const token = await getAccessToken();
                            if (!token || !follower) return;
                            await apiFetch(`/api/me/copy/${s.id}/stop`, { method: "POST", accessToken: token, wallet: follower });
                            await load();
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <span>{busyId === s.id ? "Stopping" : "Stop"}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-[var(--fg)] pt-6">
        <h2 className="editorial-title text-4xl">Open copied positions</h2>
        <p className="mt-2 text-sm text-[var(--muted-fg)]">Live mirrored exposure</p>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>Expert</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="text-right">Size</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Notional</th>
                <th className="text-right">uPnL</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.open_copied_positions.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-[var(--muted-fg)]">No mirrored positions open.</td></tr>
              ) : (
                data.open_copied_positions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.expert_wallet ? shortAddress(p.expert_wallet, 6, 4) : "—"}</td>
                    <td>{p.symbol}</td>
                    <td>{p.side}</td>
                    <td className="text-right">{String(p.amount)}</td>
                    <td className="text-right">{String(p.entry_price)}</td>
                    <td className="text-right">{formatUsd(p.notional_usdc)}</td>
                    <td className={`text-right ${Number(p.unrealized_pnl) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(p.unrealized_pnl)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
