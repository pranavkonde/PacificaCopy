"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatUsd } from "@/lib/format";

type MarketRow = {
  symbol: string;
  mark_price: number | null;
  tick_size: string | null;
  lot_size: string | null;
  max_leverage: number | null;
  funding_rate: string | null;
  next_funding_rate: string | null;
};

type TradeRow = {
  event_type: string;
  price: string;
  amount: string;
  side: string;
  cause: string;
  created_at: number;
};

export function PacificaLivePanel() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [symbol, setSymbol] = useState("BTC");
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMarkets() {
      try {
        const data = await apiFetch<MarketRow[]>("/api/pacifica/markets?limit=8");
        if (!cancelled) {
          setMarkets(data);
          if (!data.find((m) => m.symbol === symbol) && data[0]?.symbol) setSymbol(data[0].symbol);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed loading Pacifica markets");
      }
    }
    void loadMarkets();
    const t = setInterval(() => void loadMarkets(), 12000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    async function loadTrades() {
      try {
        const data = await apiFetch<TradeRow[]>(`/api/pacifica/trades?symbol=${encodeURIComponent(symbol)}`);
        if (!cancelled) setTrades(data.slice(0, 8));
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed loading Pacifica trades");
      }
    }
    void loadTrades();
    const t = setInterval(() => void loadTrades(), 7000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol]);

  const selected = useMemo(() => markets.find((m) => m.symbol === symbol), [markets, symbol]);

  return (
    <section className="section-spacious border-t border-[var(--fg)]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Pacifica intelligence</p>
          <h3 className="editorial-title mt-2 text-5xl md:text-6xl">
            Live <span className="editorial-italic">Markets</span>
          </h3>
        </div>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="input-underlined w-40">
          {markets.map((m) => (
            <option key={m.symbol} value={m.symbol}>
              {m.symbol}
            </option>
          ))}
        </select>
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}

      <div className="grid gap-6 lg:grid-cols-4">
        <StatCard label="Mark" value={selected?.mark_price != null ? formatUsd(selected.mark_price) : "—"} />
        <StatCard label="Leverage" value={selected?.max_leverage ? `${selected.max_leverage}x` : "—"} />
        <StatCard label="Funding" value={selected?.funding_rate ?? "—"} />
        <StatCard label="Next funding" value={selected?.next_funding_rate ?? "—"} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="border-t border-[var(--fg)] pt-4">
          <p className="eyebrow mb-3">Market snapshot</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="text-right">Mark</th>
                <th className="text-right">Max lev</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.symbol}>
                  <td className="font-medium">{m.symbol}</td>
                  <td className="text-right">{m.mark_price != null ? formatUsd(m.mark_price) : "—"}</td>
                  <td className="text-right">{m.max_leverage ? `${m.max_leverage}x` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[var(--fg)] pt-4">
          <p className="eyebrow mb-3">Recent trades / {symbol}</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Side</th>
                <th className="text-right">Price</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[var(--muted-fg)]">
                    No recent trades
                  </td>
                </tr>
              ) : (
                trades.map((t, i) => (
                  <tr key={`${t.created_at}-${i}`}>
                    <td>{t.side}</td>
                    <td className="text-right">{t.price}</td>
                    <td className="text-right">{t.amount}</td>
                    <td className="text-right text-xs text-[var(--muted-fg)]">{new Date(t.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="editorial-card">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 text-3xl font-light">{value}</p>
    </div>
  );
}
