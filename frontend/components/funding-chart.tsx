"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";

type FundingRow = { time: string; funding_rate: number };

export function FundingChart({ symbol }: { symbol: string }) {
  const [data, setData] = useState<FundingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = await apiFetch<FundingRow[]>(`/api/pacifica/funding-history/${encodeURIComponent(symbol)}`);
        if (!cancelled) {
          setData(raw.map((r) => ({ ...r, funding_rate: Number(r.funding_rate) })));
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load funding history");
      }
    }
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [symbol]);

  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (data.length === 0) return <p className="text-[var(--muted-fg)] text-sm">Loading funding history…</p>;

  const chartData = data.map((r) => ({
    t: new Date(r.time).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit" }),
    rate: r.funding_rate * 100,
  }));

  return (
    <div className="border-t border-[var(--fg)] pt-4">
      <p className="eyebrow mb-3">Funding rate history / {symbol}</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="rgba(26,26,26,0.14)" />
            <XAxis dataKey="t" stroke="#6c6863" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis stroke="#6c6863" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(4)}%`} />
            <Tooltip
              contentStyle={{ background: "#f9f8f6", border: "1px solid rgba(26,26,26,0.2)", fontSize: 12 }}
              formatter={(value) => [`${Number(value ?? 0).toFixed(4)}%`, "Funding"]}
            />
            <Bar dataKey="rate" maxBarSize={8}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.rate >= 0 ? "#047857" : "#b91c1c"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
