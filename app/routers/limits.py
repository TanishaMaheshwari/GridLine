from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..deps import get_owned_account

router = APIRouter(prefix="/api/accounts/{account_id}", tags=["limits"])


@router.get("/symbols", response_model=List[str])
def list_symbols(
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    symbols = [row.symbol for row in db.query(models.AccountSymbol).filter(models.AccountSymbol.account_id == account.id).order_by(models.AccountSymbol.symbol).all()]
    if not symbols:
        symbols = [row.symbol for row in db.query(models.LimitRow.symbol).filter(models.LimitRow.account_id == account.id).distinct().all()]
    if not symbols:
        symbols = ["GOLDOCT"]
    existing_symbols = {
        row.symbol for row in db.query(models.AccountSymbol.symbol).filter(models.AccountSymbol.account_id == account.id).all()
    }
    for symbol in symbols:
        if symbol not in existing_symbols:
            db.add(models.AccountSymbol(account_id=account.id, symbol=symbol))
    db.commit()
    return symbols


@router.post("/symbols", response_model=List[str])
def add_symbol(
    body: schemas.SymbolIn,
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    existing = db.query(models.AccountSymbol).filter(
        models.AccountSymbol.account_id == account.id,
        models.AccountSymbol.symbol == symbol,
    ).first()
    if not existing:
        db.add(models.AccountSymbol(account_id=account.id, symbol=symbol))
        db.commit()
    return list_symbols(account=account, db=db)


@router.get("/limits", response_model=List[schemas.LimitRowOut])
def get_limits(
    symbol: str,
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.LimitRow)
        .filter(models.LimitRow.account_id == account.id, models.LimitRow.symbol == symbol)
        .order_by(models.LimitRow.row_index.asc())
        .all()
    )
    return [
        schemas.LimitRowOut(
            id=r.id,
            row_index=r.row_index,
            status=r.status,
            updated_at=r.updated_at.isoformat() if r.updated_at else None,
            buy_price=r.buy_price,
            sell_qty=r.qty,
            sell_price=r.sell_price,
            buy_qty=r.buy_qty,
        )
        for r in rows
    ]


@router.post("/limits/push", response_model=List[schemas.PushedRowOut])
def push_limits(
    body: schemas.LimitsPushIn,
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    existing_symbol = db.query(models.AccountSymbol).filter(
        models.AccountSymbol.account_id == account.id,
        models.AccountSymbol.symbol == symbol,
    ).first()
    if not existing_symbol:
        db.add(models.AccountSymbol(account_id=account.id, symbol=symbol))
        db.flush()
    created = []
    for row_in in body.rows:
        if row_in.buy_price <= 0 or row_in.sell_price <= 0:
            continue  # matches the Apps Script's doGet-side validation (skip invalid rows)

        existing = (
            db.query(models.LimitRow)
            .filter(
                models.LimitRow.account_id == account.id,
                models.LimitRow.symbol == symbol,
                models.LimitRow.row_index == row_in.row_index,
            )
            .first()
        )
        if existing:
            continue  # never overwrite a row that's already active — same rule the frontend's fill logic uses

        row = models.LimitRow(
            account_id=account.id,
            symbol=symbol,
            row_index=row_in.row_index,
            buy_price=row_in.buy_price,
            qty=row_in.sell_qty or 0.0,
            sell_price=row_in.sell_price,
            buy_qty=row_in.buy_qty or 0.1,
            status="pending",
        )
        db.add(row)
        db.flush()
        created.append(schemas.PushedRowOut(id=row.id, row_index=row.row_index, status=row.status))

    db.commit()
    return created


@router.post("/limits/remove")
def remove_limits(
    body: schemas.LimitsRemoveIn,
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    q = db.query(models.LimitRow).filter(
        models.LimitRow.account_id == account.id, models.LimitRow.symbol == body.symbol
    )
    if not body.all:
        if not body.row_ids:
            raise HTTPException(status_code=400, detail="Provide row_ids or all=true")
        q = q.filter(models.LimitRow.id.in_(body.row_ids))

    removed = q.delete(synchronize_session=False)
    db.commit()
    # Rows are deleted outright (not soft-cancelled) — once a row is gone from
    # the ladder the EA hands back on its next poll, its own orphan-cleanup
    # cancels whatever live order it had, so there's no confirmation to wait on.
    return {"success": True, "removed": removed}


@router.delete("/symbols/{symbol}")
def delete_symbol(
    symbol: str,
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    symbol = symbol.strip().upper()
    removed = (
        db.query(models.LimitRow)
        .filter(models.LimitRow.account_id == account.id, models.LimitRow.symbol == symbol)
        .delete(synchronize_session=False)
    )
    db.query(models.AccountSymbol).filter(
        models.AccountSymbol.account_id == account.id,
        models.AccountSymbol.symbol == symbol,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "symbol": symbol, "removed_limits": removed}


@router.get("/history", response_model=List[schemas.TradeOut])
def get_history(
    symbol: Optional[str] = None,
    limit: int = 200,
    account: models.Account = Depends(get_owned_account),
    db: Session = Depends(get_db),
):
    q = db.query(models.Trade).filter(models.Trade.account_id == account.id)
    if symbol:
        q = q.filter(models.Trade.symbol == symbol)
    rows = q.order_by(models.Trade.id.desc()).limit(limit).all()

    out = []
    for t in rows:
        trade_type = "Sell" if t.sell_price else "Buy"
        out.append(
            schemas.TradeOut(
                ticket=t.id,
                symbol=t.symbol,
                type=trade_type,
                open_time=t.buy_time,
                open_price=t.buy_price,
                close_time=t.sell_time,
                close_price=t.sell_price,
                qty=t.qty,
                profit=t.profit,
            )
        )
    return out
