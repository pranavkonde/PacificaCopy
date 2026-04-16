"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatPct, formatUsd } from "@/lib/format";
import { OrderBook } from "@/components/order-book";
import { FundingChart } from "@/components/funding-chart";

type MarketRow = {
  symbol: string;
  mark_price: number | null;
  volume_24h: string | number | null;
  open_interest: string | number | null;
  change_24h_pct: number | null;
  funding_rate: string | null;
  max_leverage: number | null;
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
        const data = await apiFetch<MarketRow[]>("/api/pacifica/markets");
        if (!cancelled) {
          setMarkets(data);
          if (!data.find((m) => m.symbol === symbol) && data[0]?.symbol) setSymbol(data[0].symbol);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed loading Pacifica markets");
      }
    }
    void loadMarkets();
    const t = setInterval(() => void loadMarkets(), 5000);
    return () => { cancelled = true; clearInterval(t); };
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
    return () => { cancelled = true; clearInterval(t); };
  }, [symbol]);

  const selected = useMemo(() => markets.find((m) => m.symbol === symbol), [markets, symbol]);

  const change24h = selected?.change_24h_pct ?? null;
  const fundingNum = selected?.funding_rate ? Number(selected.funding_rate) : null;

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

      {/* Stat cards row */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Mark price" value={selected?.mark_price != null ? formatUsd(selected.mark_price) : "—"} />
        <StatCard
          label="24h change"
          value={change24h != null ? formatPct(change24h) : "—"}
          className={change24h != null ? (change24h >= 0 ? "text-emerald-700" : "text-red-700") : ""}
        />
        <StatCard label="24h volume" value={selected?.volume_24h != null ? formatUsd(selected.volume_24h) : "—"} />
        <StatCard label="Open interest" value={selected?.open_interest != null ? formatUsd(selected.open_interest) : "—"} />
        <StatCard
          label="Funding rate"
          value={fundingNum != null ? `${(fundingNum * 100).toFixed(4)}%` : "—"}
          className={fundingNum != null ? (fundingNum >= 0 ? "text-emerald-700" : "text-red-700") : ""}
        />
      </div>

      {/* Market snapshot table + Recent trades */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="border-t border-[var(--fg)] pt-4">
          <p className="eyebrow mb-3">Market snapshot</p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="text-right">Mark</th>
                  <th className="text-right">24h Δ</th>
                  <th className="text-right">Volume</th>
                  <th className="text-right">OI</th>
                  <th className="text-right">Lev</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => {
                  const mChange = m.change_24h_pct;
                  return (
                    <tr
                      key={m.symbol}
                      className={m.symbol === symbol ? "!bg-[rgba(212,175,55,0.06)]" : "cursor-pointer"}
                      onClick={() => setSymbol(m.symbol)}
                    >
                      <td className="font-medium">{m.symbol}</td>
                      <td className="text-right">{m.mark_price != null ? formatUsd(m.mark_price) : "—"}</td>
                      <td className={`text-right ${mChange != null ? (mChange >= 0 ? "text-emerald-700" : "text-red-700") : ""}`}>
                        {mChange != null ? formatPct(mChange) : "—"}
                      </td>
                      <td className="text-right">{m.volume_24h != null ? formatUsd(m.volume_24h) : "—"}</td>
                      <td className="text-right">{m.open_interest != null ? formatUsd(m.open_interest) : "—"}</td>
                      <td className="text-right">{m.max_leverage ? `${m.max_leverage}x` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                trades.map((t, i) => {
                  const isBuy = t.side.includes("long");
                  return (
                  <tr key={`${t.created_at}-${i}`}>
                    <td className={isBuy ? "text-emerald-700" : "text-red-700"}>
                      {isBuy ? "Buy" : "Sell"}
                    </td>
                    <td className="text-right">{t.price}</td>
                    <td className="text-right">{t.amount}</td>
                    <td className="text-right text-xs text-[var(--muted-fg)]">
                      {new Date(t.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order book + Funding chart */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <OrderBook symbol={symbol} levels={5} />
        <FundingChart symbol={symbol} />
      </div>
    </section>
  );
}

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="editorial-card">
      <p className="eyebrow">{label}</p>
      <p className={`mt-3 text-3xl font-light ${className ?? ""}`}>{value}</p>
    </div>
  );
}
