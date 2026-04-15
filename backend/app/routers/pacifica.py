from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Query

from app.pacifica_client import PacificaClient

router = APIRouter(prefix="/api/pacifica", tags=["pacifica"])


@router.get("/markets")
async def markets(limit: int = Query(20, ge=1, le=100)) -> list[dict[str, Any]]:
    pc = PacificaClient()
    info = await pc.get_market_info()
    prices_map = await pc.get_prices()
    by_symbol = {m.get("symbol"): m for m in info if m.get("symbol")}

    # Try to preserve meaningful ordering by 24h volume when available.
    sortable: list[tuple[float, str]] = []
    for sym, _px in prices_map.items():
        v = 0.0
        m = by_symbol.get(sym) or {}
        try:
            v = float(m.get("volume_24h") or 0)
        except (TypeError, ValueError):
            v = 0.0
        sortable.append((v, sym))
    sortable.sort(reverse=True)
    symbols = [s for _v, s in sortable] or list(by_symbol.keys())

    out: list[dict[str, Any]] = []
    for s in symbols[:limit]:
        m = by_symbol.get(s) or {"symbol": s}
        out.append(
            {
                "symbol": s,
                "mark_price": prices_map.get(s),
                "tick_size": m.get("tick_size"),
                "lot_size": m.get("lot_size"),
                "max_leverage": m.get("max_leverage"),
                "funding_rate": m.get("funding_rate"),
                "next_funding_rate": m.get("next_funding_rate"),
                "created_at": m.get("created_at"),
            }
        )
    return out


@router.get("/prices")
async def prices() -> dict[str, float]:
    return await PacificaClient().get_prices()


@router.get("/trades")
async def trades(symbol: str = Query(..., min_length=2, max_length=20)) -> list[dict[str, Any]]:
    return await PacificaClient().get_recent_trades(symbol.upper())


@router.get("/candles")
async def candles(
    symbol: str = Query(..., min_length=2, max_length=20),
    interval: Literal["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d"] = Query("1m"),
    hours: int = Query(6, ge=1, le=168),
) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)
    return await PacificaClient().get_candles(
        symbol.upper(),
        interval,
        int(start.timestamp() * 1000),
        int(now.timestamp() * 1000),
    )

