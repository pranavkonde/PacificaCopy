"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/nav";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";
const ClientPrivy = dynamic(() => import("./client-privy"), { ssr: false });

function LoadingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="editorial-shell flex items-center justify-between py-4">
          <Link href="/" className="editorial-title text-2xl text-[var(--fg)]">
            Pacifica<span className="editorial-italic">Copy</span>
          </Link>
          <span className="eyebrow">Preparing session</span>
        </div>
      </header>
      <main className="editorial-shell pb-24 pt-8">{children}</main>
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  if (!appId || !clientId) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
        <div className="border-b border-[var(--line)] bg-[var(--muted-bg)] px-4 py-3 text-xs uppercase tracking-[0.2em] text-[var(--muted-fg)]">
          Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID in frontend/.env.local
        </div>
        <Nav />
        <main className="editorial-shell pb-24 pt-8">{children}</main>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingShell>{children}</LoadingShell>}>
      <ClientPrivy>{children}</ClientPrivy>
    </Suspense>
  );
}
