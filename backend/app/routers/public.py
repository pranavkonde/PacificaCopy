from __future__ import annotations

import asyncio
import time as _time
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.db import get_supabase
from app.pacifica_client import PacificaClient
from app.schemas import Period

router = APIRouter(prefix="/api", tags=["public"])

_lb_cache: list[dict[str, Any]] = []
_lb_cache_ts: float = 0.0
_LB_TTL = 30.0


async def _cached_leaderboard() -> list[dict[str, Any]]:
    global _lb_cache, _lb_cache_ts
    now = _time.monotonic()
    if not _lb_cache or (now - _lb_cache_ts) > _LB_TTL:
        fresh = await PacificaClient().get_leaderboard()
        if fresh:
            _lb_cache = fresh
            _lb_cache_ts = now
    return list(_lb_cache)


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _parse_ts(v: Any) -> datetime | None:
    """Parse a Pacifica timestamp (epoch ms or ISO string) into a tz-aware datetime."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, (int, float)):
        if v > 1e12:
            v = v / 1000.0
        return datetime.fromtimestamp(v, tz=timezone.utc)
    if isinstance(v, str) and v.strip():
        return datetime.fromisoformat(v)
    return None


def _side_pnl(side: str, entry_px: float, mark_px: float, amount: float) -> float:
    if str(side).lower() == "bid":
        return (mark_px - entry_px) * amount
    return (entry_px - mark_px) * amount


def _compute_live_metrics(
    *,
    positions: list[dict[str, Any]],
    trade_history: list[dict[str, Any]],
    marks: dict[str, float],
    account_info: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compute trader metrics from live Pacifica data (positions + trade history)."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    pnl_week = 0.0
    pnl_month = 0.0
    pnl_all = 0.0
    wins = 0
    total = 0
    biggest_win: float = 0.0
    biggest_loss: float = 0.0

    for t in trade_history:
        pnl = _safe_float(t.get("pnl"))
        created = _parse_ts(t.get("created_at"))

        pnl_all += pnl
        total += 1
        if pnl > 0:
            wins += 1
        biggest_win = max(biggest_win, pnl)
        biggest_loss = min(biggest_loss, pnl)

        if created is not None:
            if created >= week_ago:
                pnl_week += pnl
            if created >= month_ago:
                pnl_month += pnl

    unrealized = 0.0
    for p in positions:
        sym = p.get("symbol", "")
        entry = _safe_float(p.get("entry_price"))
        amt = _safe_float(p.get("amount"))
        side = str(p.get("side", ""))
        mark = marks.get(sym, entry)
        unrealized += _side_pnl(side, entry, mark, amt)

    pnl_week += unrealized
    pnl_month += unrealized
    pnl_all += unrealized

    win_rate = (wins / total * 100.0) if total > 0 else 0.0

    equity = _safe_float((account_info or {}).get("account_equity"))
    balance = _safe_float((account_info or {}).get("balance"))

    return {
        "profit_week": pnl_week,
        "profit_month": pnl_month,
        "profit_all_time": pnl_all,
        "win_rate": win_rate,
        "total_trades": total,
        "biggest_win": biggest_win,
        "biggest_loss": biggest_loss,
        "unrealized_pnl": unrealized,
        "account_equity": equity,
        "balance": balance,
    }


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── Leaderboard ──────────────────────────────────────────────────────

@router.get("/leaderboard")
async def leaderboard(
    period: Period = Query("all"),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
) -> list[dict[str, Any]]:
    """Live leaderboard from Pacifica's native leaderboard API."""
    rows = await _cached_leaderboard()

    if not rows:
        return []

    if search and search.strip():
        term = search.strip().lower()
        rows = [r for r in rows if term in (r.get("address") or "").lower() or term in (r.get("username") or "").lower()]

    sort_field = {
        "week": "pnl_7d",
        "month": "pnl_30d",
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
            "data_source": "pacifica",
            "profit_week": r.get("pnl_7d", "0"),
            "profit_month": r.get("pnl_30d", "0"),
            "profit_all_time": r.get("pnl_all_time", "0"),
            "profit_24h": r.get("pnl_1d", "0"),
            "account_equity": r.get("equity_current", "0"),
            "volume_30d": r.get("volume_30d", "0"),
            "win_rate": "0",
            "total_trades": 0,
            "follower_count": follower_counts.get(wallet, 0),
        })
    return result


# ── Trader profile ───────────────────────────────────────────────────

@router.get("/traders/{wallet}")
async def trader_profile(wallet: str) -> dict[str, Any]:
    """Fetch a trader's full profile live from the Pacifica API."""
    w = wallet.strip()
    pc = PacificaClient()

    positions, trades_resp, acct, marks = await asyncio.gather(
        pc.get_positions(w),
        pc.get_trade_history(w, limit=200),
        pc.get_account(w),
        pc.get_prices_map(),
    )

    if positions is None and acct is None:
        raise HTTPException(404, f"Trader {w} not found on Pacifica")

    positions = positions or []
    trade_items = trades_resp.get("items", []) if isinstance(trades_resp, dict) else []
    acct_data = acct if isinstance(acct, dict) else None

    metrics = _compute_live_metrics(
        positions=positions,
        trade_history=trade_items,
        marks=marks,
        account_info=acct_data,
    )

    sb = get_supabase()
    follower_rows = (
        sb.table("copy_subscriptions")
        .select("id")
        .eq("expert_wallet", w)
        .eq("status", "active")
        .execute()
        .data or []
    )
    follower_count = len(follower_rows)

    return {
        "trader": {
            "wallet": w,
            "data_source": "pacifica",
            "profit_week": str(metrics["profit_week"]),
            "profit_month": str(metrics["profit_month"]),
            "profit_all_time": str(metrics["profit_all_time"]),
            "win_rate": str(metrics["win_rate"]),
            "follower_count": follower_count,
            "total_trades": metrics["total_trades"],
            "biggest_win": str(metrics["biggest_win"]),
            "biggest_loss": str(metrics["biggest_loss"]),
            "unrealized_pnl": str(metrics["unrealized_pnl"]),
            "account_equity": str(metrics["account_equity"]),
            "balance": str(metrics["balance"]),
        },
        "open_positions": positions,
        "recent_trades": trade_items[:50],
    }


# ── Trader equity curve ─────────────────────────────────────────────

@router.get("/traders/{wallet}/equity")
async def trader_equity(
    wallet: str,
    time_range: str = Query("30d"),
) -> list[dict[str, Any]]:
    """Equity history directly from Pacifica's /portfolio endpoint."""
    w = wallet.strip()
    pc = PacificaClient()
    portfolio = await pc.get_portfolio(w, time_range)

    if not portfolio:
        return []

    return [
        {
            "ts": p.get("timestamp"),
            "account_equity": p.get("account_equity"),
            "pnl": p.get("pnl"),
        }
        for p in portfolio
    ]


# ── Landing preview ─────────────────────────────────────────────────

@router.get("/landing-preview")
async def landing_preview() -> list[dict[str, Any]]:
    """Top traders for the landing page hero section from Pacifica leaderboard."""
    rows = await _cached_leaderboard()

    if not rows:
        return []

    rows.sort(key=lambda r: _safe_float(r.get("pnl_all_time")), reverse=True)

    try:
        sb = get_supabase()
        subs = sb.table("copy_subscriptions").select("expert_wallet").eq("status", "active").execute().data or []
        follower_counts = Counter(s["expert_wallet"] for s in subs)
    except Exception:
        follower_counts = Counter()

    result = []
    for r in rows[:8]:
        wallet = r.get("address", "")
        result.append({
            "wallet": wallet,
            "profit_week": r.get("pnl_7d", "0"),
            "profit_month": r.get("pnl_30d", "0"),
            "profit_all_time": r.get("pnl_all_time", "0"),
            "win_rate": "0",
            "follower_count": follower_counts.get(wallet, 0),
            "account_equity": r.get("equity_current", "0"),
        })
    return result
