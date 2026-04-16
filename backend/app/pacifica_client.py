from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class PacificaClient:
    """Read-only Pacifica REST client covering all public GET endpoints."""

    def __init__(self, base: str | None = None) -> None:
        self.base = (base or settings.pacifica_api_base).rstrip("/")

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        url = f"{self.base}{path}"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(url, params=params)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            logger.warning("Pacifica GET %s failed: %s", path, e)
            return None

    def _unwrap(self, body: dict[str, Any] | None) -> Any:
        """Return data payload if success, else None."""
        if body is None or not body.get("success"):
            return None
        return body.get("data")

    # ── Market info ──────────────────────────────────────────────────

    async def get_market_info(self) -> list[dict[str, Any]]:
        """GET /info — symbol metadata (tick_size, lot_size, max_leverage, funding_rate, …)."""
        data = self._unwrap(await self._get_json("/info"))
        return list(data) if data else []

    async def get_prices(self) -> list[dict[str, Any]]:
        """GET /info/prices — full price rows: mark, mid, oracle, open_interest, volume_24h, …"""
        data = self._unwrap(await self._get_json("/info/prices"))
        return list(data) if data else []

    async def get_prices_map(self) -> dict[str, float]:
        """Convenience: symbol → mark price mapping."""
        rows = await self.get_prices()
        out: dict[str, float] = {}
        for row in rows:
            sym = row.get("symbol")
            mark = row.get("mark")
            if sym and mark is not None:
                try:
                    out[str(sym)] = float(mark)
                except (TypeError, ValueError):
                    continue
        return out

    # ── Kline / candles ──────────────────────────────────────────────

    async def get_candles(
        self,
        symbol: str,
        interval: str,
        start_time: int,
        end_time: int | None = None,
    ) -> list[dict[str, Any]]:
        """GET /kline — OHLCV candle data."""
        params: dict[str, Any] = {"symbol": symbol, "interval": interval, "start_time": start_time}
        if end_time is not None:
            params["end_time"] = end_time
        data = self._unwrap(await self._get_json("/kline", params))
        return list(data) if data else []

    async def get_mark_candles(
        self,
        symbol: str,
        interval: str,
        start_time: int,
        end_time: int | None = None,
    ) -> list[dict[str, Any]]:
        """GET /kline/mark — mark-price candles."""
        params: dict[str, Any] = {"symbol": symbol, "interval": interval, "start_time": start_time}
        if end_time is not None:
            params["end_time"] = end_time
        data = self._unwrap(await self._get_json("/kline/mark", params))
        return list(data) if data else []

    # ── Orderbook ────────────────────────────────────────────────────

    async def get_orderbook(self, symbol: str, agg_level: int | None = None) -> dict[str, Any] | None:
        """GET /book — orderbook levels {s, l: [[bids],[asks]], t}."""
        params: dict[str, Any] = {"symbol": symbol}
        if agg_level is not None:
            params["agg_level"] = agg_level
        data = self._unwrap(await self._get_json("/book", params))
        return data if isinstance(data, dict) else None

    # ── Trades ───────────────────────────────────────────────────────

    async def get_recent_trades(self, symbol: str) -> list[dict[str, Any]]:
        """GET /trades — recent trades for a symbol."""
        data = self._unwrap(await self._get_json("/trades", {"symbol": symbol}))
        return list(data) if data else []

    # ── Funding rate history ─────────────────────────────────────────

    async def get_funding_history(
        self, symbol: str, limit: int = 100, cursor: str | None = None
    ) -> dict[str, Any]:
        """GET /funding_rate/history — paginated funding history.
        Returns {items: [...], next_cursor, has_more}.
        """
        params: dict[str, Any] = {"symbol": symbol, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        body = await self._get_json("/funding_rate/history", params)
        if body is None or not body.get("success"):
            return {"items": [], "next_cursor": None, "has_more": False}
        raw = body.get("data")
        if isinstance(raw, list):
            return {"items": raw, "next_cursor": None, "has_more": False}
        if isinstance(raw, dict):
            return {
                "items": list(raw.get("data") or raw.get("items") or []),
                "next_cursor": raw.get("next_cursor"),
                "has_more": raw.get("has_more", False),
            }
        return {"items": [], "next_cursor": None, "has_more": False}

    # ── Account / wallet endpoints ───────────────────────────────────

    async def get_account(self, wallet: str) -> dict[str, Any] | None:
        """GET /account — balance, equity, fees, margin usage, etc."""
        data = self._unwrap(await self._get_json("/account", {"account": wallet}))
        return data if isinstance(data, dict) else None

    async def get_positions(self, wallet: str) -> list[dict[str, Any]] | None:
        """GET /positions — open positions for a wallet. None means request failed."""
        data = self._unwrap(await self._get_json("/positions", {"account": wallet}))
        if data is None:
            return None
        return list(data)

    async def get_trade_history(
        self, wallet: str, limit: int = 100, cursor: str | None = None
    ) -> dict[str, Any]:
        """GET /trades/history — paginated trade history for a wallet."""
        params: dict[str, Any] = {"account": wallet, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        body = await self._get_json("/trades/history", params)
        if body is None or not body.get("success"):
            return {"items": [], "next_cursor": None, "has_more": False}
        raw = body.get("data")
        if isinstance(raw, list):
            return {"items": raw, "next_cursor": None, "has_more": False}
        if isinstance(raw, dict):
            return {
                "items": list(raw.get("data") or raw.get("items") or []),
                "next_cursor": raw.get("next_cursor"),
                "has_more": raw.get("has_more", False),
            }
        return {"items": [], "next_cursor": None, "has_more": False}

    async def get_portfolio(self, wallet: str, time_range: str = "30d") -> list[dict[str, Any]]:
        """GET /portfolio — equity history snapshots (account_equity, pnl, timestamp)."""
        data = self._unwrap(
            await self._get_json("/portfolio", {"account": wallet, "time_range": time_range})
        )
        return list(data) if data else []

    # ── Leaderboard ──────────────────────────────────────────────────

    async def get_leaderboard(self) -> list[dict[str, Any]]:
        """GET /leaderboard — top traders sorted by equity.

        Returns rows with: address, username, pnl_1d, pnl_7d, pnl_30d,
        pnl_all_time, equity_current, oi_current, volume_1d, volume_7d,
        volume_30d, volume_all_time.
        """
        data = self._unwrap(await self._get_json("/leaderboard"))
        return list(data) if data else []
