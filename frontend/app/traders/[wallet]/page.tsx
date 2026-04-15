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

type Profile = {
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

type EquityPoint = { ts: string; cumulative_pnl: string };

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const enc = encodeURIComponent(wallet);
      const [p, e] = await Promise.all([apiFetch<Profile>(`/api/traders/${enc}`), apiFetch<EquityPoint[]>(`/api/traders/${enc}/equity`)]);
      setProfile(p);
      setEquity(e);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to load trader");
    }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  if (err) return <p className="text-red-700">{err}</p>;
  if (!profile) return <p className="text-[var(--muted-fg)]">Loading...</p>;

  const t = profile.trader;
  const chartData = equity.map((row) => ({ t: new Date(row.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }), pnl: Number(row.cumulative_pnl) }));

  return (
    <div className="space-y-14">
      <header className="section-spacious border-t border-[var(--fg)] pb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow"><Link href="/leaderboard" className="hover:text-[var(--accent)]">Leaderboard</Link> / {shortAddress(wallet, 10, 10)}</p>
          <h1 className="editorial-title mt-3 text-5xl md:text-7xl">Trader <span className="editorial-italic">Profile</span></h1>
          <p className="mt-2 text-sm text-[var(--muted-fg)]">Source: {t.data_source}</p>
        </div>
        {headerActions}
      </header>

      <section className="grid gap-6 md:grid-cols-4 border-t border-[var(--fg)] pt-8">
        <Stat label="All-time PnL" value={formatUsd(t.profit_all_time)} className={Number(t.profit_all_time) >= 0 ? "text-emerald-700" : "text-red-700"} />
        <Stat label="Win rate" value={formatPct(t.win_rate)} />
        <Stat label="Total trades" value={String(t.total_trades)} />
        <Stat label="Followers" value={String(t.follower_count)} />
        <Stat label="Biggest win" value={formatUsd(t.biggest_win)} className="text-emerald-700" />
        <Stat label="Biggest loss" value={formatUsd(t.biggest_loss)} className="text-red-700" />
        <Stat label="Avg hold" value={formatDuration(t.avg_hold_seconds)} />
        <Stat label="Week / month" value={`${formatUsd(t.profit_week)} / ${formatUsd(t.profit_month)}`} />
      </section>

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

      <TableSection title="Open positions" columns={["Symbol", "Side", "Size", "Entry", "Source", "Opened"]}>
        {profile.open_positions.length === 0 ? <Empty colSpan={6}>No open positions.</Empty> : profile.open_positions.map((p) => (
          <tr key={p.id}><td>{p.symbol}</td><td>{p.side}</td><td className="text-right">{String(p.amount)}</td><td className="text-right">{String(p.entry_price)}</td><td>{p.source ?? "unknown"}</td><td className="text-xs text-[var(--muted-fg)]">{new Date(p.opened_at).toLocaleString()}</td></tr>
        ))}
      </TableSection>

      <TableSection title="Closed trades" columns={["Symbol", "Side", "Size", "Entry", "Exit", "PnL", "Closed"]}>
        {profile.closed_trades.length === 0 ? <Empty colSpan={7}>No closed trades.</Empty> : profile.closed_trades.map((p) => (
          <tr key={p.id}><td>{p.symbol}</td><td>{p.side}</td><td className="text-right">{String(p.amount)}</td><td className="text-right">{String(p.entry_price)}</td><td className="text-right">{String(p.exit_price)}</td><td className={`text-right ${Number(p.realized_pnl) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(p.realized_pnl)}</td><td className="text-xs text-[var(--muted-fg)]">{new Date(p.closed_at).toLocaleString()}</td></tr>
        ))}
      </TableSection>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return <article className="editorial-card"><p className="eyebrow">{label}</p><p className={`mt-3 text-3xl ${className ?? ""}`}>{value}</p></article>;
}

function TableSection({ title, columns, children }: { title: string; columns: string[]; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--fg)] pt-6">
      <h2 className="editorial-title text-4xl">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="data-table min-w-[780px]"><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{children}</tbody></table>
      </div>
    </section>
  );
}

function Empty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tr><td colSpan={colSpan} className="py-10 text-center text-[var(--muted-fg)]">{children}</td></tr>;
}
