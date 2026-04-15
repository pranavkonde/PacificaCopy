from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.db import get_supabase
from app.schemas import Period

router = APIRouter(prefix="/api", tags=["public"])


def _profit_column(period: Period) -> str:
    if period == "week":
        return "profit_week"
    if period == "month":
        return "profit_month"
    return "profit_all_time"


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/leaderboard")
def leaderboard(
    period: Period = Query("all"),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
) -> list[dict[str, Any]]:
    sb = get_supabase()
    col = _profit_column(period)
    q = sb.table("traders").select("*").order(col, desc=True).limit(limit)
    if search and search.strip():
        q = q.ilike("wallet", f"%{search.strip()}%")
    res = q.execute()
    rows = res.data or []
    out: list[dict[str, Any]] = []
    for i, r in enumerate(rows, start=1):
        out.append(
            {
                "rank": i,
                "wallet": r["wallet"],
                "is_simulated": bool(r.get("is_simulated", True)),
                "data_source": "simulated" if bool(r.get("is_simulated", True)) else "pacifica",
                "profit_week": str(r.get("profit_week", "0")),
                "profit_month": str(r.get("profit_month", "0")),
                "profit_all_time": str(r.get("profit_all_time", "0")),
                "win_rate": str(r.get("win_rate", "0")),
                "follower_count": r.get("follower_count", 0),
                "sort_profit": str(r.get(col, "0")),
            }
        )
    return out


@router.get("/traders/{wallet}/equity")
def trader_equity(wallet: str) -> list[dict[str, Any]]:
    sb = get_supabase()
    w = wallet.strip()
    rows = (
        sb.table("trader_equity_curve")
        .select("ts,cumulative_pnl")
        .eq("trader_wallet", w)
        .order("ts")
        .execute()
        .data
        or []
    )
    return [{"ts": r["ts"], "cumulative_pnl": str(r["cumulative_pnl"])} for r in rows]


@router.get("/traders/{wallet}")
def trader_profile(wallet: str) -> dict[str, Any]:
    sb = get_supabase()
    w = wallet.strip()
    tr = sb.table("traders").select("*").eq("wallet", w).maybe_single().execute()
    if not tr.data:
        raise HTTPException(404, "Trader not found")
    t = tr.data
    open_pos = (
        sb.table("expert_open_positions").select("*").eq("trader_wallet", w).order("opened_at", desc=True).execute().data
        or []
    )
    closed = (
        sb.table("expert_closed_trades")
        .select("*")
        .eq("trader_wallet", w)
        .order("closed_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    return {
        "trader": {
            "wallet": t["wallet"],
            "is_simulated": bool(t.get("is_simulated", True)),
            "data_source": "simulated" if bool(t.get("is_simulated", True)) else "pacifica",
            "profit_week": str(t.get("profit_week", "0")),
            "profit_month": str(t.get("profit_month", "0")),
            "profit_all_time": str(t.get("profit_all_time", "0")),
            "win_rate": str(t.get("win_rate", "0")),
            "follower_count": t.get("follower_count", 0),
            "total_trades": t.get("total_trades", 0),
            "biggest_win": str(t.get("biggest_win", "0")),
            "biggest_loss": str(t.get("biggest_loss", "0")),
            "avg_hold_seconds": t.get("avg_hold_seconds", 0),
        },
        "open_positions": open_pos,
        "closed_trades": closed,
    }


@router.get("/landing-preview")
def landing_preview() -> list[dict[str, Any]]:
    sb = get_supabase()
    rows = (
        sb.table("traders")
        .select("wallet,is_simulated,profit_week,profit_month,profit_all_time,win_rate,follower_count")
        .order("profit_all_time", desc=True)
        .limit(3)
        .execute()
        .data
        or []
    )
    return [dict(r) for r in rows]
