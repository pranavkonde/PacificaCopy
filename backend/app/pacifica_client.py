from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class PacificaClient:
    """Read-only Pacifica REST client (GET endpoints are unsigned)."""

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

    async def get_positions(self, account: str) -> list[dict[str, Any]] | None:
        """Returns positions, empty list if account has none, or None if the request failed."""
        body = await self._get_json("/positions", {"account": account})
        if body is None:
            return None
        if not body.get("success"):
            return None
        return list(body.get("data") or [])

    async def get_prices(self) -> dict[str, float]:
        body = await self._get_json("/info/prices")
        if body is None:
            return {}
        if not body.get("success"):
            return {}
        out: dict[str, float] = {}
        for row in body.get("data") or []:
            sym = row.get("symbol")
            mark = row.get("mark")
            if sym and mark is not None:
                try:
                    out[str(sym)] = float(mark)
                except (TypeError, ValueError):
                    continue
        return out

    async def get_market_info(self) -> list[dict[str, Any]]:
        body = await self._get_json("/info")
        if body is None or not body.get("success"):
            return []
        return list(body.get("data") or [])

    async def get_recent_trades(self, symbol: str) -> list[dict[str, Any]]:
        body = await self._get_json("/trades", {"symbol": symbol})
        if body is None or not body.get("success"):
            return []
        return list(body.get("data") or [])

    async def get_candles(
        self, symbol: str, interval: str, start_time: int, end_time: int | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"symbol": symbol, "interval": interval, "start_time": start_time}
        if end_time is not None:
            params["end_time"] = end_time
        body = await self._get_json("/kline", params)
        if body is None or not body.get("success"):
            return []
        return list(body.get("data") or [])
