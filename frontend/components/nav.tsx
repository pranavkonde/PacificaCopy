"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { hasPrivyConfig } from "@/lib/privy-env";
import { shortAddress } from "@/lib/format";
import { solanaWalletFromUser } from "@/lib/wallet";

function NavInner() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const wallet = solanaWalletFromUser(user);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-sm">
      <div className="editorial-shell flex items-center justify-between gap-6 py-4">
        <Link href="/" className="editorial-title text-2xl text-[var(--fg)]">
          Pacifica<span className="editorial-italic">Copy</span>
        </Link>

        <nav className="flex items-center gap-4 md:gap-8">
          <Link className="eyebrow hover:text-[var(--accent)] transition-colors duration-500" href="/leaderboard">
            Leaderboard
          </Link>
          <Link className="eyebrow hover:text-[var(--accent)] transition-colors duration-500" href="/dashboard">
            Dashboard
          </Link>

          {!ready ? (
            <span className="eyebrow">...</span>
          ) : authenticated ? (
            <>
              {wallet && <span className="text-xs text-[var(--muted-fg)]">{shortAddress(wallet, 6, 6)}</span>}
              <button type="button" className="btn-secondary" onClick={() => logout()}>
                <span>Log out</span>
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => login()}>
              <span>Connect wallet</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Nav() {
  if (!hasPrivyConfig) {
    return (
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="editorial-shell flex items-center justify-between gap-6 py-4">
          <Link href="/" className="editorial-title text-2xl text-[var(--fg)]">
            Pacifica<span className="editorial-italic">Copy</span>
          </Link>
          <div className="flex items-center gap-4 md:gap-8">
            <Link className="eyebrow hover:text-[var(--accent)] transition-colors duration-500" href="/leaderboard">
              Leaderboard
            </Link>
            <Link className="eyebrow hover:text-[var(--accent)] transition-colors duration-500" href="/dashboard">
              Dashboard
            </Link>
            <span className="text-[10px] uppercase tracking-[0.26em] text-[var(--muted-fg)]">Privy not configured</span>
          </div>
        </div>
      </header>
    );
  }
  return <NavInner />;
}
