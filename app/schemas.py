from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AccountOut(BaseModel):
    id: int
    name: str
    broker_label: str
    ea_api_key: str

    class Config:
        from_attributes = True


class AccountCreateIn(BaseModel):
    name: str
    broker_label: str = "MT5"


class SymbolIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)


class LimitRowPushIn(BaseModel):
    row_index: int
    buy_price: float
    sell_qty: Optional[float] = None   # -> stored as LimitRow.qty
    sell_price: float
    buy_qty: Optional[float] = None


class LimitsPushIn(BaseModel):
    symbol: str
    rows: List[LimitRowPushIn]


class LimitsRemoveIn(BaseModel):
    symbol: str
    row_ids: Optional[List[int]] = None
    all: Optional[bool] = False


class LimitRowOut(BaseModel):
    id: int
    row_index: int
    status: str
    updated_at: Optional[str] = None
    buy_price: Optional[float] = None
    sell_qty: Optional[float] = None
    sell_price: Optional[float] = None
    buy_qty: Optional[float] = None


class PushedRowOut(BaseModel):
    id: int
    row_index: int
    status: str


class ConfigOut(BaseModel):
    accountId: Optional[int] = None
    symbol: Optional[str] = None


class TradeOut(BaseModel):
    ticket: int
    symbol: str
    type: str
    open_time: Optional[str] = None
    open_price: Optional[float] = None
    close_time: Optional[str] = None
    close_price: Optional[float] = None
    qty: Optional[float] = None
    profit: Optional[float] = None
