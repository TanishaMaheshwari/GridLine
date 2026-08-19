"""
Endpoints the MT5 EA (GridLadder_EA.mq5) talks to. These are a drop-in
replacement for the Google Apps Script Web App:

  Apps Script doGet()                  -> GET  /api/ea/{account_id}/ladder
  Apps Script doPost() (sheet:limits)   -> POST /api/ea/{account_id}/exec  {"sheet":"limits", ...}
  Apps Script doPost() (sheet:trades)   -> POST /api/ea/{account_id}/exec  {"sheet":"trades", ...}
  Apps Script doPost() (sheet:warnings) -> POST /api/ea/{account_id}/exec  {"sheet":"warnings", ...}

No changes are required in GridLadder_EA.mq5 itself — the JSON bodies it
already sends/expects are unchanged. You only need to update two EA inputs:

  InpGetURL  = https://<your-host>/api/ea/<account_id>/ladder?key=<ea_api_key>&symbol=GOLDOCT
  InpPostURL = https://<your-host>/api/ea/<account_id>/exec?key=<ea_api_key>

The account_id/key pair comes from the account card on the dashboard (or
GET /api/accounts once logged in). Because auth travels in the URL itself,
MT5's WebRequest (which can't send custom headers) works unmodified.

IMPORTANT: the EA parses JSON with plain substring search (see ParseJSON /
JSONDouble / JSONString in the .mq5), and specifically checks for the
literal substring `"ok":true` with no space. Regular json.dumps() inserts
a space after ':' by default, which would silently break that check — so
every response here is serialized with compact separators to match exactly
what Google's ContentService (JSON.stringify) produced.
"""
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Body
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..deps import get_ea_account

router = APIRouter(prefix="/api/ea/{account_id}", tags=["ea"])

# Same table as SYMBOL_CONFIG/LOT_UNITS in the Apps Script, kept for parity.
# Unlike the original script this is just a default — any symbol can be
# used without a code change; add overrides here only if a symbol's lot
# unit isn't 100.
LOT_UNITS_DEFAULT = 100
LOT_UNITS_OVERRIDES = {}


def get_lot_units(symbol: str) -> float:
    return LOT_UNITS_OVERRIDES.get((symbol or "").upper(), LOT_UNITS_DEFAULT)


def compact(data) -> Response:
    return Response(content=json.dumps(data, separators=(",", ":")), media_type="application/json")


def now_str() -> str:
    return datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M:%S")


STATUS_TEXT = {
    "BUY_LIMIT_PLACED": "Buy Limit Placed",
    "SELL_LIMIT_PLACED": "Sell Limit Placed",
    "BUY_LIMIT_CANCELLED": "Buy Limit Cancelled",
    "SELL_LIMIT_CANCELLED": "Sell Limit Cancelled",
    "BUY_FILLED": "BOUGHT - Awaiting Sell",
    "SELL_FILLED": "SOLD - Awaiting Buy",
    "MARKET_BUY_PLACED": "Market Buy Placed",
    "MARKET_SELL_PLACED": "Market Sell Placed",
}


# ------------------------------------------------------------------ #
#  GET ladder  (doGet equivalent)
# ------------------------------------------------------------------ #
@router.get("/ladder")
def get_ladder(
    symbol: str,
    account: models.Account = Depends(get_ea_account),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.LimitRow)
        .filter(models.LimitRow.account_id == account.id, models.LimitRow.symbol == symbol)
        .order_by(models.LimitRow.row_index.asc())
        .all()
    )
    out_rows = []
    skipped = 0
    for r in rows:
        if r.buy_price is None or r.buy_price <= 0 or r.sell_price is None or r.sell_price <= 0:
            skipped += 1
            continue
        out_rows.append(
            {
                "row": r.row_index,
                "symbol": r.symbol,
                "buy_price": r.buy_price,
                "qty": r.qty or 0,
                "sell_price": r.sell_price,
                "buy_qty": r.buy_qty or 0.1,
            }
        )
    return compact({"ok": True, "count": len(out_rows), "skipped": skipped, "rows": out_rows})


# ------------------------------------------------------------------ #
#  POST exec  (doPost equivalent — routes on body["sheet"])
# ------------------------------------------------------------------ #
@router.post("/exec")
def exec_post(
    body: dict = Body(...),
    account: models.Account = Depends(get_ea_account),
    db: Session = Depends(get_db),
):
    qid = body.get("qid")
    if qid is not None and _already_processed(db, account.id, str(qid)):
        return compact({"success": True, "duplicate": True, "qid": qid})

    sheet = body.get("sheet")
    if sheet == "warnings":
        result = _handle_warning(db, account, body)
    elif sheet == "trades":
        result = _handle_trade(db, account, body)
    else:
        result = _handle_stock(db, account, body)

    if qid is not None:
        _mark_processed(db, account.id, str(qid))
    db.commit()
    return compact(result)


# ------------------------------------------------------------------ #
#  handlers
# ------------------------------------------------------------------ #
def _handle_stock(db: Session, account: models.Account, body: dict) -> dict:
    raw_symbol = (body.get("symbol") or "").upper()
    if not raw_symbol:
        return {"error": "Missing symbol"}
    try:
        row_index = int(body.get("row"))
    except (TypeError, ValueError):
        return {"error": f"Invalid row: {body.get('row')}"}
    if row_index <= 0:
        return {"error": f"Invalid row: {row_index}"}

    row = (
        db.query(models.LimitRow)
        .filter(
            models.LimitRow.account_id == account.id,
            models.LimitRow.symbol == raw_symbol,
            models.LimitRow.row_index == row_index,
        )
        .first()
    )
    if not row:
        # Row was removed from the ladder (e.g. user hit Remove) between the
        # EA's last fetch and this callback — nothing to update.
        return {"error": f"Row {row_index} not found for {raw_symbol} (removed?)"}

    if "qty" in body and body["qty"] is not None:
        try:
            row.qty = float(body["qty"])
        except (TypeError, ValueError):
            return {"error": f"Invalid qty: {body.get('qty')}"}

    if body.get("status") is not None:
        code = body["status"]
        row.ea_status_text = STATUS_TEXT.get(code, code)
        row.status = "placed"  # any callback from the EA means it's no longer just "pending"

    db.add(row)
    return {"success": True, "row": row_index, "symbol": raw_symbol}


def _handle_trade(db: Session, account: models.Account, body: dict) -> dict:
    symbol = (body.get("symbol") or "").upper()
    trade_type = (body.get("trade_type") or "").upper()
    ts = body.get("tradeTime") or body.get("datetime") or now_str()
    brokerage = float(body.get("brokerage") or 0)
    qty = float(body.get("qty") or 0)

    if trade_type == "BUY":
        buy_price = float(body.get("buy_price") or 0)
        trade = models.Trade(
            account_id=account.id,
            symbol=symbol,
            buy_time=ts,
            buy_price=buy_price,
            qty=qty,
            buy_brokerage=brokerage,
            matched=False,
        )
        db.add(trade)
        return {"success": True, "trade_type": "BUY", "symbol": symbol}

    if trade_type == "SELL":
        sell_price = float(body.get("sell_price") or 0)
        # Match the most recent unmatched BUY for this account+symbol (LIFO),
        # same rule as handleTradePost() in the Apps Script.
        match = (
            db.query(models.Trade)
            .filter(
                models.Trade.account_id == account.id,
                models.Trade.symbol == symbol,
                models.Trade.matched.is_(False),
                models.Trade.sell_price.is_(None),
            )
            .order_by(models.Trade.id.desc())
            .first()
        )
        if match:
            lot_units = get_lot_units(symbol)
            total_brokerage = (match.buy_brokerage or 0) + brokerage
            profit = ((sell_price - (match.buy_price or 0)) * (match.qty or qty) * lot_units) - total_brokerage
            match.sell_time = ts
            match.sell_price = sell_price
            match.sell_brokerage = brokerage
            match.profit = profit
            match.matched = True
            db.add(match)
            return {"success": True, "trade_type": "SELL", "matched_row": match.id, "profit": profit, "lot_units": lot_units}

        _log_warning(db, account, "WARN", "SHEET", symbol, "SELL has no matched BUY row", f"sellPrice={sell_price} qty={qty}")
        orphan = models.Trade(
            account_id=account.id,
            symbol=symbol,
            sell_time=ts,
            sell_price=sell_price,
            qty=qty,
            sell_brokerage=brokerage,
            matched=True,
            note="no_buy_match",
        )
        db.add(orphan)
        return {"success": True, "trade_type": "SELL", "matched_row": -1, "note": "no_buy_match"}

    return {"error": f"Unknown trade_type: {body.get('trade_type')}"}


def _handle_warning(db: Session, account: models.Account, body: dict) -> dict:
    w = _log_warning(
        db,
        account,
        body.get("level", "WARN"),
        body.get("category", "EA"),
        body.get("symbol", ""),
        body.get("message", ""),
        body.get("timestamp", ""),
    )
    return {"success": True, "written_row": w.id}


def _log_warning(db: Session, account: models.Account, level, category, symbol, message, extra) -> models.Warning:
    w = models.Warning(
        account_id=account.id, level=level, category=category, symbol=symbol, message=message, extra=extra
    )
    db.add(w)
    db.flush()
    return w


# ------------------------------------------------------------------ #
#  qid idempotency  (mirrors PROP_PROCESSED_QIDS in the Apps Script)
# ------------------------------------------------------------------ #
def _already_processed(db: Session, account_id: int, qid: str) -> bool:
    cutoff = datetime.now(timezone.utc) - models.QID_EXPIRY
    return (
        db.query(models.ProcessedQid)
        .filter(
            models.ProcessedQid.account_id == account_id,
            models.ProcessedQid.qid == qid,
            models.ProcessedQid.created_at >= cutoff,
        )
        .first()
        is not None
    )


def _mark_processed(db: Session, account_id: int, qid: str):
    db.add(models.ProcessedQid(account_id=account_id, qid=qid))
    # opportunistic cleanup of old entries
    cutoff = datetime.now(timezone.utc) - models.QID_EXPIRY
    db.query(models.ProcessedQid).filter(models.ProcessedQid.created_at < cutoff).delete()
