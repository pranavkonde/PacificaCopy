"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatPct, formatUsd, shortAddress } from "@/lib/format";

type Row = {
  rank: number;
  wallet: string;
  is_simulated: boolean;
  data_source: "simulated" | "pacifica";
  profit_week: string;
  profit_month: string;
  profit_all_time: string;
  win_rate: string;
  follower_count: number;
};

type Period = "week" | "month" | "all";

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams({ period, limit: "50" });
    if (debouncedSearch.trim()) q.set("search", debouncedSearch.trim());
    return q.toString();
  }, [period, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiFetch<Row[]>(`/api/leaderboard?${queryString}`);
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  return (
    <div className="space-y-12">
      <header className="section-spacious border-t border-[var(--fg)] pb-8">
        <p className="eyebrow">Performance archive</p>
        <h1 className="editorial-title mt-3 text-5xl md:text-7xl">
          Trader <span className="editorial-italic">Leaderboard</span>
        </h1>
      </header>

      <section className="grid gap-8 border-t border-[var(--fg)] py-8 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-wrap gap-2">
          {([ ["week", "This week"], ["month", "This month"], ["all", "All time"] ] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setPeriod(k)} className={period === k ? "btn-primary" : "btn-secondary"}>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <label className="block md:w-96">
          <span className="eyebrow">Search wallet</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-underlined mt-2" placeholder="Paste full or partial address" />
        </label>
      </section>

      {err && <p className="text-sm text-red-700">{err}</p>}

      <div className="overflow-x-auto border-t border-[var(--fg)]">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Wallet</th>
              <th>Source</th>
              <th className="text-right">Week</th>
              <th className="text-right">Month</th>
              <th className="text-right">All time</th>
              <th className="text-right">Win rate</th>
              <th className="text-right">Followers</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center text-[var(--muted-fg)]">Loading leaderboard...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-[var(--muted-fg)]">No traders match this filter.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.wallet}>
                  <td>{r.rank}</td>
                  <td>
                    <Link href={`/traders/${encodeURIComponent(r.wallet)}`} className="hover:text-[var(--accent)] transition-colors duration-500">
                      {shortAddress(r.wallet, 8, 6)}
                    </Link>
                  </td>
                  <td>
                    <span className={`px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${r.data_source === "pacifica" ? "text-emerald-700" : "text-[var(--muted-fg)]"}`}>
                      {r.data_source}
                    </span>
                  </td>
                  <td className={`text-right ${Number(r.profit_week) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(r.profit_week)}</td>
                  <td className={`text-right ${Number(r.profit_month) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(r.profit_month)}</td>
                  <td className={`text-right ${Number(r.profit_all_time) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(r.profit_all_time)}</td>
                  <td className="text-right">{formatPct(r.win_rate)}</td>
                  <td className="text-right">{r.follower_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
