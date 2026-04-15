"use client";

import { useState } from "react";

export type CopyFormValues = {
  allocation_usdc: string;
  max_loss_usdc: string;
  max_trade_size_usdc: string;
  max_concurrent_trades: number;
};

type Props = {
  open: boolean;
  expertWallet: string;
  onClose: () => void;
  onConfirm: (v: CopyFormValues) => Promise<void>;
};

export function CopySettingsModal({ open, expertWallet, onClose, onConfirm }: Props) {
  const [allocation, setAllocation] = useState("500");
  const [maxLoss, setMaxLoss] = useState("150");
  const [maxTrade, setMaxTrade] = useState("100");
  const [maxConc, setMaxConc] = useState(4);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await onConfirm({
        allocation_usdc: allocation,
        max_loss_usdc: maxLoss,
        max_trade_size_usdc: maxTrade,
        max_concurrent_trades: maxConc,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" className="w-full max-w-xl border border-[var(--fg)] bg-[var(--bg)] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
          <div>
            <p className="eyebrow">Copy settings</p>
            <h2 className="editorial-title mt-2 text-3xl text-[var(--fg)]">
              Configure <span className="editorial-italic">Risk</span>
            </h2>
            <p className="mt-2 text-xs text-[var(--muted-fg)]">{expertWallet}</p>
          </div>
          <button type="button" className="btn-secondary h-10 px-4" onClick={onClose}>
            <span>Close</span>
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <label className="block text-sm text-[var(--muted-fg)]">
            Allocate (USDC)
            <input className="input-underlined mt-2" value={allocation} onChange={(e) => setAllocation(e.target.value)} inputMode="decimal" />
          </label>
          <label className="block text-sm text-[var(--muted-fg)]">
            Max loss before stop
            <input className="input-underlined mt-2" value={maxLoss} onChange={(e) => setMaxLoss(e.target.value)} inputMode="decimal" />
          </label>
          <label className="block text-sm text-[var(--muted-fg)]">
            Max position size
            <input className="input-underlined mt-2" value={maxTrade} onChange={(e) => setMaxTrade(e.target.value)} inputMode="decimal" />
          </label>
          <label className="block text-sm text-[var(--muted-fg)]">
            Max concurrent copied trades
            <input type="number" min={1} max={50} className="input-underlined mt-2" value={maxConc} onChange={(e) => setMaxConc(Number(e.target.value))} />
          </label>
        </div>

        {err && <p className="mt-4 text-sm text-red-700">{err}</p>}

        <div className="mt-8 flex justify-end">
          <button type="button" disabled={busy} onClick={() => void submit()} className="btn-primary disabled:opacity-50">
            <span>{busy ? "Starting" : "Confirm copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
