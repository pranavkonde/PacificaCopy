export const hasPrivyConfig =
  typeof process.env.NEXT_PUBLIC_PRIVY_APP_ID === "string" &&
  process.env.NEXT_PUBLIC_PRIVY_APP_ID.length > 0 &&
  typeof process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID === "string" &&
  process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID.length > 0;
