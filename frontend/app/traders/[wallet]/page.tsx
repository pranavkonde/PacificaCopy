"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CopySettingsModal, type CopyFormValues } from "@/components/copy-settings-modal";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDuration, formatPct, formatUsd, shortAddress } from "@/lib/format";
import { hasPrivyConfig } from "@/lib/privy-env";
import { solanaWalletFromUser } from "@/lib/wallet";

type AccountInfo = {
  balance: number;
  equity: number;
  margin: number;
  unrealized_pnl?: number;
};

type Position = {
  symbol: string;
  side: string;
  amount: number | string;
  entry_price: number | string;
  funding?: number | string;
  margin_type?: "isolated" | "cross";
  leverage?: number;
};

type Trade = {
  symbol: string;
  side: string;
  amount: number | string;
  price: number | string;
  pnl?: number | string;
  fee?: number | string;
  time: number | string;
  raw_side?: string;
  event_type?: string;
  cause?: string;
};

type EquityPoint = { ts: number | string; cumulative_pnl: string; account_equity?: string };

type LegacyProfile = {
  trader: {
    wallet: string;
    data_source: "simulated" | "pacifica";
    profit_week: string;
    profit_month: string;
    profit_all_time: string;
    win_rate: string;
    follower_count: number;
    total_trades: number;
    biggest_win: string;
    biggest_loss: string;
    avg_hold_seconds: number;
  };
  open_positions: Array<{ id: string; symbol: string; side: string; amount: string | number; entry_price: string | number; opened_at: string; source?: string }>;
  closed_trades: Array<{ id: string; symbol: string; side: string; amount: string | number; entry_price: string | number; exit_price: string | number; realized_pnl: string | number; closed_at: string }>;
};

export default function TraderProfilePage() {
  const params = useParams();
  const wallet = decodeURIComponent((params.wallet as string) || "");
  if (!wallet) return <p className="text-[var(--muted-fg)]">Invalid trader</p>;

  return (
    <ProfileBody wallet={wallet} headerActions={hasPrivyConfig ? <CopyToolbar wallet={wallet} /> : <p className="text-xs text-[var(--muted-fg)]">Configure Privy to copy trades.</p>} />
  );
}

function CopyToolbar({ wallet }: { wallet: string }) {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const follower = solanaWalletFromUser(user);
  const [modal, setModal] = useState(false);

  async function onConfirmCopy(form: CopyFormValues) {
    if (!follower) throw new Error("Connect a Solana wallet first");
    const token = await getAccessToken();
    if (!token) throw new Error("Could not get session token");
    await apiFetch(`/api/me/copy/${encodeURIComponent(wallet)}`, {
      method: "POST",
      accessToken: token,
      wallet: follower,
      body: JSON.stringify(form),
    });
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <button type="button" className="btn-primary" onClick={() => {
        if (!ready) return;
        if (!authenticated) return login();
        if (!follower) return window.alert("No Solana wallet linked yet.");
        setModal(true);
      }}>
        <span>Copy this trader</span>
      </button>

      <CopySettingsModal
        open={modal}
        expertWallet={wallet}
        onClose={() => setModal(false)}
        onConfirm={async (form) => {
          try { await onConfirmCopy(form); }
          catch (e) {
            if (e instanceof ApiError) {
              let msg = e.body;
              try { const j = JSON.parse(e.body) as { detail?: unknown }; if (typeof j.detail === "string") msg = j.detail; } catch {}
              throw new Error(msg);
            }
            throw e;
          }
        }}
      />
    </div>
  );
}

function ProfileBody({ wallet, headerActions }: { wallet: string; headerActions?: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [legacyProfile, setLegacyProfile] = useState<LegacyProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    const enc = encodeURIComponent(wallet);
    try {
      const [acct, pos, trd, eq] = await Promise.all([
        apiFetch<AccountInfo>(`/api/pacifica/account/${enc}`).catch(() => null),
        apiFetch<Position[]>(`/api/pacifica/account/${enc}/positions`).catch(() => []),
        apiFetch<Trade[]>(`/api/pacifica/account/${enc}/trades`).catch(() => []),
        apiFetch<EquityPoint[]>(`/api/pacifica/account/${enc}/equity?time_range=30d`).catch(() => []),
      ]);
      setAccount(acct);
      setPositions(pos);
      setTrades(trd);
      setEquity(eq);

      // Also fetch legacy profile for follower/pnl stats (fallback)
      try {
        const lp = await apiFetch<LegacyProfile>(`/api/traders/${enc}`);
        setLegacyProfile(lp);
      } catch {
        // Non-critical — pacifica data is primary
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to load trader");
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  if (loading) return <p className="text-[var(--muted-fg)]">Loading…</p>;
  if (err) return <p className="text-red-700">{err}</p>;

  const t = legacyProfile?.trader;
  const chartData = equity.map((row) => {
    const tsNum = typeof row.ts === "number" ? (row.ts > 1e12 ? row.ts : row.ts * 1000) : Number(row.ts);
    return {
      t: new Date(tsNum).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      pnl: Number(row.cumulative_pnl),
    };
  });

  return (
    <div className="space-y-14">
      <header className="section-spacious border-t border-[var(--fg)] pb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow"><Link href="/leaderboard" className="hover:text-[var(--accent)]">Leaderboard</Link> / {shortAddress(wallet, 10, 10)}</p>
          <h1 className="editorial-title mt-3 text-5xl md:text-7xl">Trader <span className="editorial-italic">Profile</span></h1>
          <p className="mt-2 text-sm text-[var(--muted-fg)]">Source: pacifica · refreshes every 10s</p>
        </div>
        {headerActions}
      </header>

      {/* Account overview */}
      <section className="grid gap-6 md:grid-cols-4 border-t border-[var(--fg)] pt-8">
        <Stat label="Balance" value={account ? formatUsd(account.balance) : "—"} />
        <Stat label="Equity" value={account ? formatUsd(account.equity) : "—"} />
        <Stat label="Margin used" value={account ? formatUsd(account.margin) : "—"} />
        <Stat
          label="Unrealized PnL"
          value={account?.unrealized_pnl != null ? formatUsd(account.unrealized_pnl) : "—"}
          className={account?.unrealized_pnl != null ? (account.unrealized_pnl >= 0 ? "text-emerald-700" : "text-red-700") : ""}
        />
        {t && (
          <>
            <Stat label="All-time PnL" value={formatUsd(t.profit_all_time)} className={Number(t.profit_all_time) >= 0 ? "text-emerald-700" : "text-red-700"} />
            <Stat label="Win rate" value={formatPct(t.win_rate)} />
            <Stat label="Total trades" value={String(t.total_trades)} />
            <Stat label="Avg hold" value={formatDuration(t.avg_hold_seconds)} />
          </>
        )}
      </section>

      {/* Equity curve */}
      <section className="border-t border-[var(--fg)] pt-6">
        <h2 className="editorial-title text-4xl">Equity curve</h2>
        <div className="mt-4 h-80 border-t border-[var(--line)] pt-3">
          {chartData.length === 0 ? (
            <p className="py-10 text-center text-[var(--muted-fg)]">No equity history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d4af37" stopOpacity={0.35} /><stop offset="100%" stopColor="#d4af37" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 6" stroke="rgba(26,26,26,0.14)" />
                <XAxis dataKey="t" stroke="#6c6863" tick={{ fontSize: 11 }} />
                <YAxis stroke="#6c6863" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ background: "#f9f8f6", border: "1px solid rgba(26,26,26,0.2)" }} formatter={(value) => [formatUsd(Number(value ?? 0)), "PnL"]} />
                <Area type="monotone" dataKey="pnl" stroke="#1a1a1a" fill="url(#gp)" strokeWidth={1.8} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Open positions from Pacifica */}
      <section className="border-t border-[var(--fg)] pt-6">
        <h2 className="editorial-title text-4xl">Open positions</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Entry price</th>
                <th className="text-right">Funding</th>
                <th>Margin</th>
                <th className="text-right">Leverage</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-[var(--muted-fg)]">No open positions.</td></tr>
              ) : (
                positions.map((p, i) => (
                  <tr key={`${p.symbol}-${i}`}>
                    <td className="font-medium">{p.symbol}</td>
                    <td className={p.side === "bid" ? "text-emerald-700" : "text-red-700"}>
                      {p.side === "bid" ? "Long" : p.side === "ask" ? "Short" : p.side}
                    </td>
                    <td className="text-right">{String(p.amount)}</td>
                    <td className="text-right">{formatUsd(p.entry_price)}</td>
                    <td className="text-right">{p.funding != null ? formatUsd(p.funding) : "—"}</td>
                    <td>{p.margin_type ?? "—"}</td>
                    <td className="text-right">{p.leverage ? `${p.leverage}x` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trade history from Pacifica */}
      <section className="border-t border-[var(--fg)] pt-6">
        <h2 className="editorial-title text-4xl">Trade history</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Price</th>
                <th className="text-right">PnL</th>
                <th className="text-right">Fee</th>
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-[var(--muted-fg)]">No trade history.</td></tr>
              ) : (
                trades.map((tr, i) => (
                  <tr key={`${tr.time}-${i}`}>
                    <td className="font-medium">{tr.symbol}</td>
                    <td className={tr.side === "bid" || tr.raw_side?.includes("long") ? "text-emerald-700" : "text-red-700"}>
                      {tr.raw_side || (tr.side === "bid" ? "Buy" : "Sell")}
                    </td>
                    <td className="text-right">{String(tr.amount)}</td>
                    <td className="text-right">{formatUsd(tr.price)}</td>
                    <td className={`text-right ${tr.pnl != null && Number(tr.pnl) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {tr.pnl != null ? formatUsd(tr.pnl) : "—"}
                    </td>
                    <td className="text-right text-[var(--muted-fg)]">{tr.fee != null ? formatUsd(tr.fee) : "—"}</td>
                    <td className="text-right text-xs text-[var(--muted-fg)]">{new Date(typeof tr.time === "number" ? tr.time : Number(tr.time)).toLocaleString()}</td>
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

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return <article className="editorial-card"><p className="eyebrow">{label}</p><p className={`mt-3 text-3xl ${className ?? ""}`}>{value}</p></article>;
}
