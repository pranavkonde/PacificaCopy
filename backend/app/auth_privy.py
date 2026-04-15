from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException
from privy import PrivyAPI

from app.config import settings

_privy: PrivyAPI | None = None


def _get_privy() -> PrivyAPI:
    global _privy
    if _privy is None:
        if not settings.privy_app_id or not settings.privy_app_secret:
            raise HTTPException(500, "Privy is not configured on the server")
        _privy = PrivyAPI(app_id=settings.privy_app_id, app_secret=settings.privy_app_secret)
    return _privy


def _linked_wallet_addresses(user) -> set[str]:
    out: list[str] = []
    linked = getattr(user, "linked_accounts", None)
    if linked is None and isinstance(user, dict):
        linked = user.get("linked_accounts")
    for acc in linked or []:
        if isinstance(acc, dict):
            addr = acc.get("address") or acc.get("public_key")
        else:
            addr = getattr(acc, "address", None) or getattr(acc, "public_key", None)
        if not addr:
            continue
        out.append(addr.strip())
    # EVM addresses are case-insensitive in comparisons
    normalized: set[str] = set()
    for a in out:
        if a.startswith("0x"):
            normalized.add(a.lower())
        else:
            normalized.add(a)
    return normalized


def _wallet_matches(claimed: str, authorized: set[str]) -> bool:
    w = claimed.strip()
    if w.startswith("0x"):
        return w.lower() in {x.lower() for x in authorized}
    return w in authorized


@dataclass
class AuthContext:
    privy_user_id: str
    wallet: str


def _claims_user_id(claims) -> str:
    uid = getattr(claims, "user_id", None)
    if not uid and isinstance(claims, dict):
        # SDKs may return snake_case or JWT-style subject.
        uid = claims.get("user_id") or claims.get("sub")
    if not uid:
        raise HTTPException(401, "Invalid access token claims")
    return str(uid)


async def require_wallet_user(
    authorization: str | None = Header(None),
    x_wallet_address: str | None = Header(None, alias="X-Wallet-Address"),
) -> AuthContext:
    if not x_wallet_address:
        raise HTTPException(400, "X-Wallet-Address header is required")

    if settings.dev_skip_privy:
        return AuthContext(privy_user_id="dev-user", wallet=x_wallet_address.strip())

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1].strip()
    privy = _get_privy()
    vk = settings.privy_verification_key or None
    try:
        if vk:
            claims = privy.users.verify_access_token(auth_token=token, verification_key=vk)
        else:
            claims = privy.users.verify_access_token(auth_token=token)
    except Exception:
        raise HTTPException(401, "Invalid or expired access token")

    user_id = _claims_user_id(claims)
    user = privy.users.get(user_id)
    wallets = _linked_wallet_addresses(user)
    if not _wallet_matches(x_wallet_address, wallets):
        raise HTTPException(403, "Wallet is not linked to this Privy user")

    return AuthContext(privy_user_id=user_id, wallet=x_wallet_address.strip())
