from __future__ import annotations

import time as _time
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from app.db import get_supabase
from app.pacifica_client import PacificaClient

router = APIRouter(prefix="/api/pacifica", tags=["pacifica"])

_leaderboard_cache: list[dict[str, Any]] = []
_leaderboard_cache_ts: float = 0.0
_LEADERBOARD_TTL = 30.0


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _pct_change(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return ((current - previous) / abs(previous)) * 100.0


# ── Markets (enriched with price data) ──────────────────────────────

@router.get("/markets")
async def markets(limit: int = Query(20, ge=1, le=100)) -> list[dict[str, Any]]:
    pc = PacificaClient()
    info_list, price_rows = await pc.get_market_info(), await pc.get_prices()

    info_by_sym = {m["symbol"]: m for m in info_list if m.get("symbol")}
    price_by_sym = {r["symbol"]: r for r in price_rows if r.get("symbol")}

    sortable: list[tuple[float, str]] = []
    all_symbols = set(info_by_sym.keys()) | set(price_by_sym.keys())
    for sym in all_symbols:
        vol = _safe_float(price_by_sym.get(sym, {}).get("volume_24h"))
        sortable.append((vol, sym))
    sortable.sort(reverse=True)

    out: list[dict[str, Any]] = []
    for _vol, sym in sortable[:limit]:
        info = info_by_sym.get(sym, {})
        px = price_by_sym.get(sym, {})
        mark = _safe_float(px.get("mark")) if px.get("mark") is not None else None
        yesterday = _safe_float(px.get("yesterday_price")) if px.get("yesterday_price") is not None else None
        change_24h = _pct_change(mark, yesterday) if mark is not None and yesterday is not None else None

        out.append({
            "symbol": sym,
            "mark_price": mark,
            "mid_price": px.get("mid"),
            "oracle_price": px.get("oracle"),
            "funding_rate": px.get("funding"),
            "next_funding_rate": px.get("next_funding"),
            "open_interest": px.get("open_interest"),
            "volume_24h": px.get("volume_24h"),
            "yesterday_price": yesterday,
            "change_24h_pct": change_24h,
            "tick_size": info.get("tick_size"),
            "lot_size": info.get("lot_size"),
            "max_leverage": info.get("max_leverage"),
            "min_order_size": info.get("min_order_size"),
            "max_order_size": info.get("max_order_size"),
            "created_at": info.get("created_at"),
        })
    return out


# ── Prices ───────────────────────────────────────────────────────────

@router.get("/prices")
async def prices() -> list[dict[str, Any]]:
    """Full price rows from Pacifica (mark, mid, oracle, OI, volume, funding, …)."""
    return await PacificaClient().get_prices()


# ── Trades ───────────────────────────────────────────────────────────

@router.get("/trades")
async def trades(symbol: str = Query(..., min_length=1, max_length=20)) -> list[dict[str, Any]]:
    return await PacificaClient().get_recent_trades(symbol)


# ── Candles ──────────────────────────────────────────────────────────

@router.get("/candles")
async def candles(
    symbol: str = Query(..., min_length=1, max_length=20),
    interval: Literal["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d"] = Query("1m"),
    hours: int = Query(6, ge=1, le=168),
) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)
    return await PacificaClient().get_candles(
        symbol,
        interval,
        int(start.timestamp() * 1000),
        int(now.timestamp() * 1000),
    )


# ── Orderbook ────────────────────────────────────────────────────────

@router.get("/book/{symbol}")
async def orderbook(
    symbol: str,
    agg_level: int | None = Query(None),
) -> dict[str, Any]:
    data = await PacificaClient().get_orderbook(symbol, agg_level)
    if data is None:
        raise HTTPException(502, f"Could not fetch orderbook for {symbol}")
    levels = data.get("l") or [[], []]
    bids_raw = levels[0] if len(levels) > 0 else []
    asks_raw = levels[1] if len(levels) > 1 else []
    return {
        "symbol": data.get("s", symbol),
        "bids": [{"price": _safe_float(b.get("p")), "amount": _safe_float(b.get("a")), "orders": b.get("n", 0)} for b in bids_raw],
        "asks": [{"price": _safe_float(a.get("p")), "amount": _safe_float(a.get("a")), "orders": a.get("n", 0)} for a in asks_raw],
        "timestamp": data.get("t"),
    }


# ── Funding rate history ─────────────────────────────────────────────

@router.get("/funding-history/{symbol}")
async def funding_history(
    symbol: str,
    limit: int = Query(100, ge=1, le=500),
    cursor: str | None = Query(None),
) -> list[dict[str, Any]]:
    result = await PacificaClient().get_funding_history(symbol, limit, cursor)
    items = result.get("items", [])
    return [
        {
            "time": r.get("created_at"),
            "funding_rate": _safe_float(r.get("funding_rate")),
            "next_funding_rate": _safe_float(r.get("next_funding_rate")),
            "oracle_price": r.get("oracle_price"),
        }
        for r in items
    ]


# ── Account info ─────────────────────────────────────────────────────

@router.get("/account/{wallet}")
async def account_info(wallet: str) -> dict[str, Any]:
    data = await PacificaClient().get_account(wallet)
    if data is None:
        raise HTTPException(404, f"Account not found or API error for {wallet}")
    equity = _safe_float(data.get("account_equity"))
    balance = _safe_float(data.get("balance"))
    margin = _safe_float(data.get("total_margin_used"))
    return {
        "balance": balance,
        "equity": equity,
        "margin": margin,
        "unrealized_pnl": round(equity - balance, 2),
        "available_to_spend": _safe_float(data.get("available_to_spend")),
        "available_to_withdraw": _safe_float(data.get("available_to_withdraw")),
        "positions_count": data.get("positions_count"),
        "orders_count": data.get("orders_count"),
        "fee_level": data.get("fee_level"),
        "maker_fee": data.get("maker_fee"),
        "taker_fee": data.get("taker_fee"),
    }


# ── Account positions ────────────────────────────────────────────────

@router.get("/account/{wallet}/positions")
async def account_positions(wallet: str) -> list[dict[str, Any]]:
    data = await PacificaClient().get_positions(wallet)
    if data is None:
        raise HTTPException(502, f"Could not fetch positions for {wallet}")
    return data


# ── Account trade history ────────────────────────────────────────────

@router.get("/account/{wallet}/trades")
async def account_trades(
    wallet: str,
    limit: int = Query(100, ge=1, le=500),
    cursor: str | None = Query(None),
) -> list[dict[str, Any]]:
    result = await PacificaClient().get_trade_history(wallet, limit, cursor)
    items = result.get("items", [])
    side_map = {"open_long": "bid", "close_long": "bid", "open_short": "ask", "close_short": "ask"}
    return [
        {
            "symbol": t.get("symbol", ""),
            "side": side_map.get(t.get("side", ""), t.get("side", "")),
            "amount": t.get("amount"),
            "price": t.get("price"),
            "pnl": t.get("pnl"),
            "fee": t.get("fee"),
            "time": t.get("created_at"),
            "event_type": t.get("event_type"),
            "raw_side": t.get("side"),
            "cause": t.get("cause"),
        }
        for t in items
    ]


# ── Account equity / portfolio ───────────────────────────────────────

@router.get("/account/{wallet}/equity")
async def account_equity(
    wallet: str,
    time_range: Literal["1d", "7d", "14d", "30d", "all"] = Query("30d"),
) -> list[dict[str, Any]]:
    rows = await PacificaClient().get_portfolio(wallet, time_range)
    return [
        {
            "ts": r.get("timestamp"),
            "account_equity": r.get("account_equity"),
            "cumulative_pnl": r.get("pnl", "0"),
        }
        for r in rows
    ]


# ── Leaderboard (built from recent trade data) ──────────────────────

@router.get("/leaderboard")
async def leaderboard(
    limit: int = Query(50, ge=1, le=200),
    period: str = Query("all"),
    search: str | None = Query(None),
) -> list[dict[str, Any]]:
    """Live leaderboard from Pacifica's native leaderboard API.

    Pacifica returns all traders sorted by equity with pnl_1d/7d/30d/all_time.
    We enrich with follower counts from our Supabase copy_subscriptions.
    """
    global _leaderboard_cache, _leaderboard_cache_ts
    now = _time.monotonic()
    if not _leaderboard_cache or (now - _leaderboard_cache_ts) > _LEADERBOARD_TTL:
        pc = PacificaClient()
        fresh = await pc.get_leaderboard()
        if fresh:
            _leaderboard_cache = fresh
            _leaderboard_cache_ts = now

    rows = list(_leaderboard_cache)
    if not rows:
        return []

    if search and search.strip():
        term = search.strip().lower()
        rows = [r for r in rows if term in (r.get("address") or "").lower() or term in (r.get("username") or "").lower()]

    sort_field = {
        "week": "pnl_7d",
        "month": "pnl_30d",
        "day": "pnl_1d",
    }.get(period, "pnl_all_time")

    rows.sort(key=lambda r: _safe_float(r.get(sort_field)), reverse=True)
    rows = rows[:limit]

    try:
        sb = get_supabase()
        subs = sb.table("copy_subscriptions").select("expert_wallet").eq("status", "active").execute().data or []
        follower_counts = Counter(s["expert_wallet"] for s in subs)
    except Exception:
        follower_counts = Counter()

    result = []
    for i, r in enumerate(rows, start=1):
        wallet = r.get("address", "")
        result.append({
            "rank": i,
            "wallet": wallet,
            "username": r.get("username"),
            "data_source": "pacifica",
            "profit_24h": r.get("pnl_1d", "0"),
            "profit_week": r.get("pnl_7d", "0"),
            "profit_month": r.get("pnl_30d", "0"),
            "profit_all_time": r.get("pnl_all_time", "0"),
            "account_equity": r.get("equity_current", "0"),
            "open_interest": r.get("oi_current", "0"),
            "volume_24h": r.get("volume_1d", "0"),
            "volume_7d": r.get("volume_7d", "0"),
            "volume_30d": r.get("volume_30d", "0"),
            "volume_all_time": r.get("volume_all_time", "0"),
            "win_rate": "0",
            "follower_count": follower_counts.get(wallet, 0),
        })
    return result
