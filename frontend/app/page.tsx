import Link from "next/link";
import { PacificaLivePanel } from "@/components/pacifica-live-panel";
import { formatPct, formatUsd, shortAddress } from "@/lib/format";

type PreviewRow = {
  wallet: string;
  profit_week: string;
  profit_month: string;
  profit_all_time: string;
  win_rate: string;
  follower_count: number;
};

async function getPreview(): Promise<PreviewRow[]> {
  const apiBase = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${apiBase}/api/landing-preview`, { next: { revalidate: 20 } });
    if (!res.ok) return [];
    return (await res.json()) as PreviewRow[];
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const preview = await getPreview();

  return (
    <div className="space-y-20 md:space-y-28">
      <section className="section-spacious relative overflow-hidden border-t border-[var(--fg)]">
        <div className="absolute right-0 top-12 hidden md:block vertical-label">Editorial / Vol. 01</div>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7 lg:col-start-1">
            <div className="mb-6 flex items-center gap-4">
              <span className="h-px w-10 bg-[var(--fg)]" />
              <p className="eyebrow">Curated automation</p>
            </div>
            <h1 className="editorial-title text-5xl md:text-7xl xl:text-9xl">
              Copy the <span className="editorial-italic">Best</span>
              <br /> Traders on Pacifica
            </h1>
          </div>
          <div className="lg:col-span-4 lg:col-start-9 flex flex-col justify-end gap-8">
            <p className="text-base leading-relaxed text-[var(--muted-fg)] md:text-lg">
              A luxury-grade copy trading terminal for Pacifica DEX. Precision controls, curated leaderboards, and
              synchronized execution intelligence.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/leaderboard" className="btn-primary inline-flex items-center">
                <span>Browse leaderboard</span>
              </Link>
              <Link href="/dashboard" className="btn-secondary inline-flex items-center">
                <span>Open dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section-spacious border-t border-[var(--fg)]">
        <div className="grid gap-10 md:grid-cols-3">
          {[
            { step: "01", title: "Select", body: "Inspect leaderboard and profile depth before subscribing." },
            { step: "02", title: "Configure", body: "Define allocation, max-loss, and position constraints." },
            { step: "03", title: "Mirror", body: "Copy engine maps opens/closes and updates live exposure." },
          ].map((s) => (
            <article key={s.step} className="editorial-card">
              <p className="eyebrow">Step {s.step}</p>
              <h3 className="editorial-title mt-4 text-4xl">{s.title}</h3>
              <p className="mt-4 leading-relaxed text-[var(--muted-fg)]">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-spacious border-t border-[var(--fg)]">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Weekly leaderboard preview</p>
            <h2 className="editorial-title mt-2 text-5xl">
              Curated <span className="editorial-italic">Performance</span>
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto border-t border-[var(--fg)]">
          <table className="data-table min-w-[740px]">
            <thead>
              <tr>
                <th>Trader</th>
                <th className="text-right">Week</th>
                <th className="text-right">Month</th>
                <th className="text-right">Win rate</th>
                <th className="text-right">Followers</th>
              </tr>
            </thead>
            <tbody>
              {preview.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[var(--muted-fg)]">
                    No preview data. Start backend and migrations.
                  </td>
                </tr>
              ) : (
                preview.map((r) => (
                  <tr key={r.wallet}>
                    <td className="text-sm">
                      <Link href={`/traders/${encodeURIComponent(r.wallet)}`} className="hover:text-[var(--accent)] transition-colors duration-500">
                        {shortAddress(r.wallet)}
                      </Link>
                    </td>
                    <td className={`text-right ${Number(r.profit_week) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(r.profit_week)}</td>
                    <td className={`text-right ${Number(r.profit_month) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatUsd(r.profit_month)}</td>
                    <td className="text-right">{formatPct(r.win_rate)}</td>
                    <td className="text-right">{r.follower_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PacificaLivePanel />
    </div>
  );
}
