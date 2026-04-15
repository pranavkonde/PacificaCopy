export function shortAddress(addr: string, left = 6, right = 4) {
  if (addr.length <= left + right) return addr;
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

export function formatUsd(n: string | number) {
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function formatPct(n: string | number) {
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}
