from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


Period = Literal["week", "month", "all"]


class CopySettingsCreate(BaseModel):
    allocation_usdc: Decimal = Field(gt=0)
    max_loss_usdc: Decimal = Field(gt=0)
    max_trade_size_usdc: Decimal = Field(gt=0)
    max_concurrent_trades: int = Field(ge=1, le=50)


class TraderRow(BaseModel):
    wallet: str
    profit_week: Decimal
    profit_month: Decimal
    profit_all_time: Decimal
    win_rate: Decimal
    follower_count: int
    total_trades: int
    biggest_win: Decimal
    biggest_loss: Decimal
    avg_hold_seconds: int
