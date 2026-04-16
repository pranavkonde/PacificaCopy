from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.auth_privy import AuthContext, require_wallet_user
from app.db import get_supabase
from app.schemas import CopySettingsCreate

router = APIRouter(prefix="/api/me", tags=["me"])


@router.post("/copy/{expert_wallet}")
def start_copy(
    expert_wallet: str,
    body: CopySettingsCreate,
    auth: AuthContext = Depends(require_wallet_user),
) -> dict[str, Any]:
    sb = get_supabase()
    expert = expert_wallet.strip()
    ex = sb.table("traders").select("wallet").eq("wallet", expert).maybe_single().execute()
    if not ex.data:
        try:
            sb.table("traders").insert({"wallet": expert, "is_simulated": False}).execute()
        except Exception:
            pass
    if expert == auth.wallet:
        raise HTTPException(400, "Cannot copy your own wallet")

    dup = (
        sb.table("copy_subscriptions")
        .select("id")
        .eq("follower_wallet", auth.wallet)
        .eq("expert_wallet", expert)
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    if dup:
        raise HTTPException(409, "You are already copying this trader")

    row = {
        "privy_user_id": auth.privy_user_id,
        "follower_wallet": auth.wallet,
        "expert_wallet": expert,
        "allocation_usdc": str(body.allocation_usdc),
        "max_loss_usdc": str(body.max_loss_usdc),
        "max_trade_size_usdc": str(body.max_trade_size_usdc),
        "max_concurrent_trades": body.max_concurrent_trades,
        "status": "active",
        "realized_pnl": "0",
    }
    res = sb.table("copy_subscriptions").insert(row).execute()
    data = (res.data or [None])[0]
    if not data:
        raise HTTPException(500, "Failed to create subscription")
    sb.table("copy_activity_log").insert(
        {
            "subscription_id": data["id"],
            "expert_wallet": expert,
            "event_type": "subscription_started",
            "detail": {"follower_wallet": auth.wallet},
        }
    ).execute()
    return {"subscription": data}


@router.post("/copy/{subscription_id}/stop")
def stop_copy(subscription_id: str, auth: AuthContext = Depends(require_wallet_user)) -> dict[str, str]:
    from datetime import datetime, timezone

    sb = get_supabase()
    sub = (
        sb.table("copy_subscriptions")
        .select("*")
        .eq("id", subscription_id)
        .maybe_single()
        .execute()
        .data
    )
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub["follower_wallet"] != auth.wallet:
        raise HTTPException(403, "Not your subscription")
    if sub.get("status") != "active":
        return {"status": "already_stopped"}

    now = datetime.now(timezone.utc).isoformat()
    sb.table("copy_subscriptions").update({"status": "stopped", "stopped_at": now}).eq("id", subscription_id).execute()

    open_rows = (
        sb.table("copied_positions")
        .select("*")
        .eq("subscription_id", subscription_id)
        .eq("status", "open")
        .execute()
        .data
        or []
    )
    settle = sum(float(r.get("unrealized_pnl") or 0) for r in open_rows)
    for row in open_rows:
        sb.table("copied_positions").update({"status": "closed", "closed_at": now, "unrealized_pnl": 0}).eq(
            "id", row["id"]
        ).execute()
    if open_rows:
        new_realized = float(sub.get("realized_pnl") or 0) + settle
        sb.table("copy_subscriptions").update({"realized_pnl": str(new_realized)}).eq(
            "id", subscription_id
        ).execute()

    sb.table("copy_activity_log").insert(
        {
            "subscription_id": subscription_id,
            "expert_wallet": sub["expert_wallet"],
            "event_type": "subscription_stopped",
            "detail": {},
        }
    ).execute()
    return {"status": "stopped"}


@router.get("/dashboard")
def dashboard(auth: AuthContext = Depends(require_wallet_user)) -> dict[str, Any]:
    sb = get_supabase()
    subs = (
        sb.table("copy_subscriptions")
        .select("*")
        .eq("follower_wallet", auth.wallet)
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    all_subs = (
        sb.table("copy_subscriptions").select("*").eq("follower_wallet", auth.wallet).execute().data or []
    )

    total_realized = sum((Decimal(str(s.get("realized_pnl") or 0)) for s in all_subs), Decimal("0"))
    sub_ids = [s["id"] for s in all_subs]
    open_positions: list[dict[str, Any]] = []
    if sub_ids:
        open_positions = (
            sb.table("copied_positions")
            .select("*")
            .in_("subscription_id", sub_ids)
            .eq("status", "open")
            .execute()
            .data
            or []
        )
    sub_by_id = {s["id"]: s for s in all_subs}
    for p in open_positions:
        sub = sub_by_id.get(p["subscription_id"])
        if sub:
            p["expert_wallet"] = sub["expert_wallet"]

    total_unrealized = sum(
        (Decimal(str(p.get("unrealized_pnl") or 0)) for p in open_positions), Decimal("0")
    )
    total_equity = total_realized + total_unrealized

    contrib: list[dict[str, Any]] = []
    for s in subs:
        contrib.append(
            {
                "expert_wallet": s["expert_wallet"],
                "subscription_id": s["id"],
                "realized_pnl": str(s.get("realized_pnl", "0")),
                "allocation_usdc": str(s.get("allocation_usdc", "0")),
            }
        )

    return {
        "wallet": auth.wallet,
        "total_realized_pnl": str(total_realized),
        "total_unrealized_pnl": str(total_unrealized),
        "total_profit_copy_trading": str(total_equity),
        "active_subscriptions": subs,
        "per_trader_contribution": contrib,
        "open_copied_positions": open_positions,
    }
