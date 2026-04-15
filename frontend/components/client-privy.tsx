"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { Nav } from "@/components/nav";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";

export default function ClientPrivy({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#D4AF37",
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <Nav />
      <main className="editorial-shell pb-24 pt-6 md:pt-10">{children}</main>
    </PrivyProvider>
  );
}
