from __future__ import annotations

import asyncio
import logging
import random
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.config import settings
from app.db import get_supabase
from app.pacifica_client import PacificaClient

logger = logging.getLogger(__name__)

SYMBOLS = ["BTC", "ETH", "SOL", "AVAX", "ARB"]


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _side_pnl(side: str, entry: float, exit_px: float, amount: float) -> float:
    if str(side).lower() == "bid":
        return (exit_px - entry) * amount
    return (entry - exit_px) * amount


def _close_copied_row(sb: Client, sub: dict[str, Any], row: dict[str, Any], exit_px: float, reason: str) -> None:
    entry = float(row["entry_price"])
    amt = float(row["amount"])
    pnl = _side_pnl(row["side"], entry, exit_px, amt)
    new_realized = float(sub.get("realized_pnl") or 0) + pnl
    sb.table("copied_positions").update({"status": "closed", "closed_at": _utcnow(), "unrealized_pnl": 0}).eq(
        "id", row["id"]
    ).execute()
    sb.table("copy_subscriptions").update({"realized_pnl": new_realized}).eq("id", sub["id"]).execute()
    sub["realized_pnl"] = new_realized
    sb.table("copy_activity_log").insert(
        {
            "subscription_id": sub["id"],
            "expert_wallet": sub["expert_wallet"],
            "event_type": "follower_closed",
            "detail": {"reason": reason, "symbol": row["symbol"], "pnl": pnl},
        }
    ).execute()


def _close_all_copies_for_expert_position(sb: Client, expert_position_id: str, marks: dict[str, float]) -> None:
    copies = (
        sb.table("copied_positions")
        .select("*")
        .eq("expert_position_id", expert_position_id)
        .eq("status", "open")
        .execute()
        .data
        or []
    )
    for c in copies:
        sub = (
            sb.table("copy_subscriptions")
            .select("*")
            .eq("id", c["subscription_id"])
            .single()
            .execute()
            .data
        )
        mark = marks.get(c["symbol"], float(c["entry_price"]))
        _close_copied_row(sb, sub, c, mark, "expert_closed")


def _close_expert_position(sb: Client, row: dict[str, Any], exit_px: float) -> None:
    eid = row["id"]
    entry = float(row["entry_price"])
    amt = float(row["amount"])
    pnl = _side_pnl(row["side"], entry, exit_px, amt)
    sb.table("expert_closed_trades").insert(
        {
            "trader_wallet": row["trader_wallet"],
            "symbol": row["symbol"],
            "side": row["side"],
            "amount": amt,
            "entry_price": entry,
            "exit_price": exit_px,
            "realized_pnl": pnl,
            "opened_at": row["opened_at"],
            "closed_at": _utcnow(),
        }
    ).execute()
    sb.table("expert_open_positions").delete().eq("id", eid).execute()


def _insert_expert_from_api(sb: Client, wallet: str, p: dict[str, Any], source: str) -> str | None:
    try:
        opened_ms = int(p.get("created_at") or p.get("updated_at") or 0)
        opened_at = (
            datetime.fromtimestamp(opened_ms / 1000, tz=timezone.utc).isoformat()
            if opened_ms
            else _utcnow()
        )
        row = {
            "trader_wallet": wallet,
            "symbol": p["symbol"],
            "side": p["side"],
            "amount": float(p["amount"]),
            "entry_price": float(p["entry_price"]),
            "funding": float(p.get("funding") or 0),
            "opened_at": opened_at,
            "updated_at": _utcnow(),
            "source": source,
        }
        res = sb.table("expert_open_positions").insert(row).execute()
        return (res.data or [{}])[0].get("id")
    except Exception as e:
        logger.warning("insert expert position failed: %s", e)
        return None


async def _sync_expert_pacifica(sb: Client, pc: PacificaClient, wallet: str, marks: dict[str, float]) -> None:
    rows = sb.table("expert_open_positions").select("*").eq("trader_wallet", wallet).execute().data or []
    db_by_key = {(r["symbol"], r["side"]): r for r in rows}
    api_list = await pc.get_positions(wallet)
    if api_list is None:
        return
    api_by_key = {(p["symbol"], p["side"]): p for p in api_list}

    for key, row in list(db_by_key.items()):
        if key not in api_by_key:
            mark = marks.get(row["symbol"], float(row["entry_price"]))
            _close_all_copies_for_expert_position(sb, row["id"], marks)
            _close_expert_position(sb, row, mark)

    for key, p in api_by_key.items():
        if key not in db_by_key:
            _insert_expert_from_api(sb, wallet, p, "pacifica")


def _simulate_expert_tick(sb: Client, wallet: str, marks: dict[str, float]) -> None:
    rng = random.Random(int(time.time()) // 8 + hash(wallet) % 100000)
    rows = sb.table("expert_open_positions").select("*").eq("trader_wallet", wallet).execute().data or []

    if rows and rng.random() < 0.07:
        row = rng.choice(rows)
        mark = marks.get(row["symbol"], float(row["entry_price"]) * (1 + rng.uniform(-0.02, 0.02)))
        _close_all_copies_for_expert_position(sb, row["id"], marks)
        _close_expert_position(sb, row, mark)

    if len(rows) < 4 and rng.random() < 0.09:
        sym = rng.choice(SYMBOLS)
        side = "bid" if rng.random() > 0.45 else "ask"
        base = marks.get(sym, 100 + rng.random() * 50)
        entry = base * (1 + rng.uniform(-0.001, 0.001))
        amount = round(rng.uniform(0.02, 0.6), 4)
        key = (sym, side)
        existing = {(r["symbol"], r["side"]) for r in rows}
        if key in existing:
            return
        row = {
            "trader_wallet": wallet,
            "symbol": sym,
            "side": side,
            "amount": amount,
            "entry_price": round(entry, 6),
            "funding": 0,
            "opened_at": _utcnow(),
            "updated_at": _utcnow(),
            "source": "simulated",
        }
        sb.table("expert_open_positions").insert(row).execute()


def _maybe_stop_max_loss(sb: Client, sub: dict[str, Any], marks: dict[str, float]) -> bool:
    sid = sub["id"]
    open_rows = (
        sb.table("copied_positions").select("*").eq("subscription_id", sid).eq("status", "open").execute().data or []
    )
    unreal = 0.0
    for row in open_rows:
        mark = marks.get(row["symbol"], float(row["entry_price"]))
        unreal += _side_pnl(row["side"], float(row["entry_price"]), mark, float(row["amount"]))
    realized = float(sub.get("realized_pnl") or 0)
    max_loss = float(sub.get("max_loss_usdc") or 0)
    if max_loss > 0 and realized + unreal <= -max_loss:
        sb.table("copy_subscriptions").update({"status": "stopped", "stopped_at": _utcnow()}).eq("id", sid).execute()
        sb.table("copy_activity_log").insert(
            {
                "subscription_id": sid,
                "expert_wallet": sub["expert_wallet"],
                "event_type": "auto_stopped_max_loss",
                "detail": {"realized": realized, "unrealized": unreal, "threshold": max_loss},
            }
        ).execute()
        for row in open_rows:
            _close_copied_row(sb, sub, row, marks.get(row["symbol"], float(row["entry_price"])), "max_loss_stop")
        return True
    return False


def _open_copy_for_expert(
    sb: Client, sub: dict[str, Any], expert_row: dict[str, Any], marks: dict[str, float]
) -> None:
    sid = sub["id"]
    open_rows = (
        sb.table("copied_positions")
        .select("id")
        .eq("subscription_id", sid)
        .eq("status", "open")
        .execute()
        .data
        or []
    )
    open_count = len(open_rows)
    max_conc = int(sub["max_concurrent_trades"])
    if open_count >= max_conc:
        sb.table("copy_activity_log").insert(
            {
                "subscription_id": sid,
                "expert_wallet": sub["expert_wallet"],
                "event_type": "skipped",
                "detail": {"reason": "max_concurrent_trades", "limit": max_conc},
            }
        ).execute()
        return

    amount = float(expert_row["amount"])
    entry = float(expert_row["entry_price"])
    expert_notional = amount * entry
    if expert_notional <= 0:
        return

    allocation = float(sub["allocation_usdc"])
    max_trade = float(sub["max_trade_size_usdc"])
    target_notional = min(allocation * 0.25, max_trade, expert_notional)
    if target_notional < 1:
        sb.table("copy_activity_log").insert(
            {
                "subscription_id": sid,
                "expert_wallet": sub["expert_wallet"],
                "event_type": "skipped",
                "detail": {"reason": "target_notional_too_small", "target_notional": target_notional},
            }
        ).execute()
        return

    scale = target_notional / expert_notional
    follower_amount = amount * scale
    follower_notional = follower_amount * entry
    if follower_notional > max_trade + 1e-6:
        scale = max_trade / expert_notional
        follower_amount = amount * scale
        follower_notional = follower_amount * entry

    mark = marks.get(expert_row["symbol"], entry)
    unreal = _side_pnl(expert_row["side"], entry, mark, follower_amount)
    realized = float(sub.get("realized_pnl") or 0)
    max_loss = float(sub.get("max_loss_usdc") or 0)
    if max_loss > 0 and realized + unreal <= -max_loss:
        sb.table("copy_activity_log").insert(
            {
                "subscription_id": sid,
                "expert_wallet": sub["expert_wallet"],
                "event_type": "skipped",
                "detail": {"reason": "would_exceed_max_loss"},
            }
        ).execute()
        return

    sb.table("copied_positions").insert(
        {
            "subscription_id": sid,
            "expert_position_id": expert_row["id"],
            "symbol": expert_row["symbol"],
            "side": expert_row["side"],
            "amount": follower_amount,
            "entry_price": entry,
            "notional_usdc": follower_notional,
            "unrealized_pnl": unreal,
            "status": "open",
        }
    ).execute()
    sb.table("copy_activity_log").insert(
        {
            "subscription_id": sid,
            "expert_wallet": sub["expert_wallet"],
            "event_type": "follower_opened",
            "detail": {"symbol": expert_row["symbol"], "amount": follower_amount, "notional": follower_notional},
        }
    ).execute()


def _mirror_new_positions(sb: Client, sub: dict[str, Any], marks: dict[str, float]) -> None:
    if sub.get("status") != "active":
        return
    if _maybe_stop_max_loss(sb, sub, marks):
        return

    expert = sub["expert_wallet"]
    expert_rows = (
        sb.table("expert_open_positions").select("*").eq("trader_wallet", expert).execute().data or []
    )
    open_copies = (
        sb.table("copied_positions").select("*").eq("subscription_id", sub["id"]).eq("status", "open").execute().data
        or []
    )
    tracked = {str(r["expert_position_id"]) for r in open_copies if r.get("expert_position_id")}

    for er in expert_rows:
        eid = str(er["id"])
        if eid in tracked:
            continue
        _open_copy_for_expert(sb, sub, er, marks)


def _update_unrealized(sb: Client, marks: dict[str, float]) -> None:
    rows = sb.table("copied_positions").select("*").eq("status", "open").execute().data or []
    for row in rows:
        mark = marks.get(row["symbol"], float(row["entry_price"]))
        u = _side_pnl(row["side"], float(row["entry_price"]), mark, float(row["amount"]))
        sb.table("copied_positions").update({"unrealized_pnl": u}).eq("id", row["id"]).execute()


def _refresh_follower_counts(sb: Client) -> None:
    subs = sb.table("copy_subscriptions").select("expert_wallet").eq("status", "active").execute().data or []
    counts = Counter(s["expert_wallet"] for s in subs)
    distinct = sb.table("copy_subscriptions").select("expert_wallet").execute().data or []
    wallets = {r["expert_wallet"] for r in distinct}
    for w in wallets:
        sb.table("traders").update({"follower_count": counts.get(w, 0), "updated_at": _utcnow()}).eq(
            "wallet", w
        ).execute()


async def run_copy_cycle() -> None:
    try:
        sb = get_supabase()
    except RuntimeError:
        logger.warning("Supabase not configured; skipping copy cycle")
        return
    pc = PacificaClient()
    marks = await pc.get_prices()

    subs = sb.table("copy_subscriptions").select("expert_wallet").eq("status", "active").execute().data or []
    experts = list({s["expert_wallet"] for s in subs})
    if not experts:
        _update_unrealized(sb, marks)
        return

    meta_rows = sb.table("traders").select("wallet,is_simulated").in_("wallet", experts).execute().data or []
    is_sim = {m["wallet"]: m["is_simulated"] for m in (meta_rows or [])}

    for w in experts:
        try:
            if is_sim.get(w, True):
                await asyncio.to_thread(_simulate_expert_tick, sb, w, marks)
            else:
                await _sync_expert_pacifica(sb, pc, w, marks)
        except Exception as e:
            logger.exception("expert sync failed %s: %s", w[:10], e)

    active_subs = sb.table("copy_subscriptions").select("*").eq("status", "active").execute().data or []
    for sub in active_subs or []:
        try:
            fresh = (
                sb.table("copy_subscriptions")
                .select("*")
                .eq("id", sub["id"])
                .single()
                .execute()
                .data
            )
            await asyncio.to_thread(_mirror_new_positions, sb, fresh, marks)
        except Exception as e:
            logger.exception("mirror failed: %s", e)

    await asyncio.to_thread(_update_unrealized, sb, marks)
    await asyncio.to_thread(_refresh_follower_counts, sb)


async def copy_engine_loop(stop: asyncio.Event) -> None:
    interval = max(1.0, float(settings.copy_poll_interval_seconds))
    while not stop.is_set():
        try:
            await run_copy_cycle()
        except Exception:
            logger.exception("copy cycle error")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except TimeoutError:
            continue


def start_copy_engine() -> tuple[asyncio.Task, asyncio.Event]:
    stop = asyncio.Event()
    task = asyncio.create_task(copy_engine_loop(stop))
    return task, stop
