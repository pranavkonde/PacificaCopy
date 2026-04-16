"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatUsd } from "@/lib/format";

type BookLevel = { price: number; amount: number; total: number };
type BookData = {
  bids: Array<{ price: number; amount: number }>;
  asks: Array<{ price: number; amount: number }>;
};

function accumulate(levels: Array<{ price: number; amount: number }>): BookLevel[] {
  let running = 0;
  return levels.map((l) => {
    running += l.amount;
    return { price: l.price, amount: l.amount, total: running };
  });
}

export function OrderBook({ symbol, levels = 10 }: { symbol: string; levels?: number }) {
  const [book, setBook] = useState<{ bids: BookLevel[]; asks: BookLevel[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<BookData>(`/api/pacifica/book/${encodeURIComponent(symbol)}`);
        if (cancelled) return;
        setBook({
          bids: accumulate(data.bids.slice(0, levels)),
          asks: accumulate(data.asks.slice(0, levels)),
        });
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load book");
      }
    }
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [symbol, levels]);

  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!book) return <p className="text-[var(--muted-fg)] text-sm">Loading order book…</p>;

  const maxTotal = Math.max(
    book.bids[book.bids.length - 1]?.total ?? 0,
    book.asks[book.asks.length - 1]?.total ?? 0,
    1,
  );

  return (
    <div className="border-t border-[var(--fg)] pt-4">
      <p className="eyebrow mb-3">Order book / {symbol}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Bids */}
        <div>
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)]">
            <span>Price</span>
            <span>Amount</span>
            <span>Total</span>
          </div>
          {book.bids.map((b, i) => (
            <div key={i} className="relative flex justify-between py-[3px] text-xs">
              <div
                className="absolute inset-y-0 right-0 opacity-15"
                style={{ width: `${(b.total / maxTotal) * 100}%`, background: "#047857" }}
              />
              <span className="relative text-emerald-700 font-medium">{formatUsd(b.price)}</span>
              <span className="relative">{b.amount.toFixed(4)}</span>
              <span className="relative text-[var(--muted-fg)]">{b.total.toFixed(4)}</span>
            </div>
          ))}
        </div>

        {/* Asks */}
        <div>
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.15em] text-[var(--muted-fg)]">
            <span>Price</span>
            <span>Amount</span>
            <span>Total</span>
          </div>
          {book.asks.map((a, i) => (
            <div key={i} className="relative flex justify-between py-[3px] text-xs">
              <div
                className="absolute inset-y-0 left-0 opacity-15"
                style={{ width: `${(a.total / maxTotal) * 100}%`, background: "#b91c1c" }}
              />
              <span className="relative text-red-700 font-medium">{formatUsd(a.price)}</span>
              <span className="relative">{a.amount.toFixed(4)}</span>
              <span className="relative text-[var(--muted-fg)]">{a.total.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
