import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from .database import Base


def now_utc():
    return datetime.now(timezone.utc)


def gen_api_key():
    return secrets.token_urlsafe(24)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=now_utc)

    accounts = relationship("Account", back_populates="owner", cascade="all, delete-orphan")


class Account(Base):
    """
    A trading account (what the dashboard shows as a card).
    ea_api_key is the credential the EA / Apps Script equivalent uses to
    authenticate — put it straight into the InpGetURL / InpPostURL query
    string on the MT5 side, no EA code changes required.
    """
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False, default="Trading Account")
    broker_label = Column(String, nullable=False, default="MT5")
    ea_api_key = Column(String, unique=True, index=True, default=gen_api_key)
    created_at = Column(DateTime, default=now_utc)

    owner = relationship("User", back_populates="accounts")
    limit_rows = relationship("LimitRow", back_populates="account", cascade="all, delete-orphan")
    trades = relationship("Trade", back_populates="account", cascade="all, delete-orphan")
    warnings = relationship("Warning", back_populates="account", cascade="all, delete-orphan")
    symbols = relationship("AccountSymbol", back_populates="account", cascade="all, delete-orphan")


class AccountSymbol(Base):
    __tablename__ = "account_symbols"
    __table_args__ = (UniqueConstraint("account_id", "symbol", name="uq_account_symbol"),)

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    symbol = Column(String, nullable=False)

    account = relationship("Account", back_populates="symbols")


class LimitRow(Base):
    """
    One row of a symbol's grid sheet. Mirrors the Apps Script 'Limits' sheet
    columns 1:1 — buy_price | qty | sell_price | buy_qty | status | last_update —
    except stored per (account, symbol, row_index) instead of a fixed cell range.

    status:
      'pending' — saved to DB, EA has not touched it yet
      'placed'  — EA has picked it up at least once (order placed / filled / flipped)
    Rows are deleted outright on removal (see routers/limits.py) rather than kept
    in a 'cancelling' state — the EA's own orphan-cleanup silently cancels any live
    order once a row is no longer in the ladder, so there's nothing to wait on.
    """
    __tablename__ = "limit_rows"
    __table_args__ = (UniqueConstraint("account_id", "symbol", "row_index", name="uq_account_symbol_row"),)

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    symbol = Column(String, nullable=False, index=True)
    row_index = Column(Integer, nullable=False)

    buy_price = Column(Float, nullable=False)
    qty = Column(Float, nullable=False, default=0.0)          # current position qty (EA-driven)
    sell_price = Column(Float, nullable=False)
    buy_qty = Column(Float, nullable=False, default=0.1)       # lot size

    status = Column(String, nullable=False, default="pending")
    ea_status_text = Column(String, nullable=True)             # last human status string from EA
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    account = relationship("Account", back_populates="limit_rows")


class Trade(Base):
    """Mirrors the Apps Script 'History' sheet, matched BUY->SELL with P&L."""
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    symbol = Column(String, nullable=False, index=True)

    buy_time = Column(String, nullable=True)
    buy_price = Column(Float, nullable=True)
    qty = Column(Float, nullable=True)
    buy_brokerage = Column(Float, nullable=True, default=0.0)

    sell_time = Column(String, nullable=True)
    sell_price = Column(Float, nullable=True)
    sell_brokerage = Column(Float, nullable=True, default=0.0)

    profit = Column(Float, nullable=True)
    matched = Column(Boolean, default=False)
    note = Column(String, nullable=True)

    created_at = Column(DateTime, default=now_utc)

    account = relationship("Account", back_populates="trades")


class Warning(Base):
    __tablename__ = "warnings"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    level = Column(String, nullable=False, default="WARN")
    category = Column(String, nullable=True)
    symbol = Column(String, nullable=True)
    message = Column(String, nullable=True)
    extra = Column(String, nullable=True)
    created_at = Column(DateTime, default=now_utc)

    account = relationship("Account", back_populates="warnings")


class ProcessedQid(Base):
    """Idempotency store for the EA's retry-queue 'qid' field (24h expiry)."""
    __tablename__ = "processed_qids"
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    qid = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=now_utc)


QID_EXPIRY = timedelta(hours=24)
