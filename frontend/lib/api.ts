// Always hit our same-origin Next route handler from browsers.
// The handler proxies to the backend URL server-side, avoiding CORS/mixed-content issues.
const API_BASE = "/api/proxy";

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { accessToken?: string | null; wallet?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);
  if (init.wallet) headers.set("X-Wallet-Address", init.wallet);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text);
  return text ? (JSON.parse(text) as T) : (null as T);
}
