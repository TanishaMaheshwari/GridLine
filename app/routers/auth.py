from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=schemas.TokenOut)
def signup(body: schemas.SignupIn, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with that email already exists")

    user = models.User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()

    # Give every new user one starter trading account so the dashboard /
    # /api/config has something real to point at immediately.
    account = models.Account(owner_id=user.id, name="My Account", broker_label="MT5")
    db.add(account)
    db.commit()
    db.refresh(account)
    db.add(models.AccountSymbol(account_id=account.id, symbol="GOLDOCT"))
    db.commit()

    token = create_access_token(user.id)
    return schemas.TokenOut(access_token=token)


@router.post("/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id)
    return schemas.TokenOut(access_token=token)
