from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user, get_owned_account

router = APIRouter(prefix="/api", tags=["accounts"])


@router.get("/accounts", response_model=List[schemas.AccountOut])
def list_accounts(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return db.query(models.Account).filter(models.Account.owner_id == user.id).all()


@router.get("/accounts/{account_id}", response_model=schemas.AccountOut)
def get_account(account: models.Account = Depends(get_owned_account)):
    return account


@router.post("/accounts", response_model=schemas.AccountOut)
def create_account(
    body: schemas.AccountCreateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    account = models.Account(owner_id=user.id, name=body.name, broker_label=body.broker_label)
    db.add(account)
    db.commit()
    db.refresh(account)
    db.add(models.AccountSymbol(account_id=account.id, symbol="GOLDOCT"))
    db.commit()
    return account


@router.delete("/accounts/{account_id}")
def delete_account(account: models.Account = Depends(get_owned_account), db: Session = Depends(get_db)):
    db.delete(account)
    db.commit()
    return {"success": True}


@router.get("/config", response_model=schemas.ConfigOut)
def get_config(db: Session = Depends(get_db)):
    """
    Public, unauthenticated — the frontend calls this before login exists,
    purely to know whether the backend is reachable and which account/symbol
    to default the single-account demo screen to.

    Returns the most recently created account and the first symbol it has
    any grid rows for. Once the dashboard's account cards are wired to real
    accounts (see README), this becomes informational only.
    """
    account = db.query(models.Account).order_by(models.Account.id.desc()).first()
    if not account:
        return schemas.ConfigOut(accountId=None, symbol=None)
    row = (
        db.query(models.LimitRow)
        .filter(models.LimitRow.account_id == account.id)
        .order_by(models.LimitRow.id.asc())
        .first()
    )
    return schemas.ConfigOut(accountId=account.id, symbol=(row.symbol if row else "GOLDOCT"))
