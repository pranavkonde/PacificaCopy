import type { User } from "@privy-io/react-auth";

/** Best-effort Solana address from Privy user (embedded or linked). */
export function solanaWalletFromUser(user: User | null | undefined): string | null {
  if (!user) return null;
  const linked = user.linkedAccounts ?? [];
  for (const a of linked) {
    const anyA = a as { type?: string; chainType?: string; address?: string };
    if (anyA.chainType === "solana" && anyA.address) return anyA.address;
    if (anyA.type === "wallet" && anyA.address && "chainType" in a) {
      const ct = (a as { chainType?: string }).chainType;
      if (ct === "solana") return anyA.address;
    }
  }
  const w = user.wallet as { address?: string; chainType?: string } | undefined;
  if (w?.address && w.chainType === "solana") return w.address;
  return null;
}
