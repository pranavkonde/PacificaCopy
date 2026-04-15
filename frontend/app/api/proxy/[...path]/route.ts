import { NextRequest } from "next/server";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function backendBaseUrl() {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
}

function buildUpstreamUrl(req: NextRequest, path: string[]) {
  const url = new URL(req.url);
  const upstream = `${backendBaseUrl()}/${path.join("/")}`;
  return `${upstream}${url.search}`;
}

function forwardHeaders(req: NextRequest) {
  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP_HEADERS) headers.delete(h);
  return headers;
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  const method = req.method.toUpperCase();
  const upstreamUrl = buildUpstreamUrl(req, params.path);
  const headers = forwardHeaders(req);
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  });

  const outHeaders = new Headers(upstream.headers);
  for (const h of HOP_BY_HOP_HEADERS) outHeaders.delete(h);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, await ctx.params);
}

