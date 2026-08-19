from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
import jwt

from .database import get_db
from . import models
from .security import decode_access_token


def get_current_user(
    authorization: str = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        user_id = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_owned_account(
    account_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.Account:
    account = db.query(models.Account).get(account_id)
    if not account or account.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def get_ea_account(
    account_id: int,
    key: str,
    db: Session = Depends(get_db),
) -> models.Account:
    """EA/Apps-Script-equivalent auth: account id + secret key in the query string,
    so the .mq5 EA (which can't send custom headers) can authenticate purely via
    the InpGetURL / InpPostURL it's configured with."""
    account = db.query(models.Account).get(account_id)
    if not account or account.ea_api_key != key:
        raise HTTPException(status_code=401, detail="Invalid account or key")
    return account
