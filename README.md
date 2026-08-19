# Gridline backend

A real web app that replaces the Google Apps Script + Google Sheets layer.
It serves the Gridline dashboard **and** talks to the MT5 EA directly —
one FastAPI service, one SQLite database, no spreadsheet in the loop.

```
GridLadder_EA.mq5  <--HTTP-->  this backend  <--HTTP-->  Gridline web UI (served at /)
```

## What changed vs. the Apps Script version

- **Storage**: SQLite (via SQLAlchemy) instead of Sheet cells. Trivially swappable
  for Postgres later (`GRIDLINE_DB_URL=postgresql://...`).
- **Multi-tenant**: real user accounts (email/password + JWT), each with any number
  of trading accounts, each account with any number of symbols — the original
  script hardcoded one Gold-only sheet.
- **No rollover code changes**: the old script needed you to edit `SYMBOL_CONFIG`
  and `symbolMap` every contract rollover. This backend accepts any symbol string
  dynamically — only the EA's own `InpGold` input needs updating each rollover.
- **The `.mq5` EA is unmodified.** It can't send custom headers, so auth travels
  in the URL you configure in `InpGetURL` / `InpPostURL` (see below).

## 1. Run it

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` — that's the Gridline dashboard. Create a user
account with your email and password; a starter trading account is created
automatically. After signing in, open the dashboard and use `+ Add account` or
`Connect a new account` to add additional MT5 accounts.

For anything beyond local testing, put this behind HTTPS (nginx/Caddy/a
reverse-proxying host) — MT5's `WebRequest` requires HTTPS, and you'll want a
real domain for `InpGetURL`/`InpPostURL` anyway. Also set a real secret:

```bash
export GRIDLINE_SECRET_KEY="$(openssl rand -hex 32)"
```

## 2. Connect an app account to the EA

Complete these steps once for every MT5 trading account.

### 2.1 Create the trading account in Gridline

1. Sign in to the Gridline web app.
2. On the dashboard, click `+ Add account` or `Connect a new account`.
3. Enter a recognizable account name, such as `Gold Live - Account 1`.
4. Enter the broker/server label, such as `Exness-MT5`.
5. Click **Connect account**.
6. Note the account card's numeric ID and its **EA key**.

The account ID and EA key are credentials for that trading account. Do not
share the EA key publicly.

### 2.2 Configure the matching MT5 EA

Open the EA's inputs in the MT5 terminal that belongs to that account and set
the URLs using that account's own ID and key:

```
InpGetURL  = https://your-host/api/ea/<account_id>/ladder?key=<ea_api_key>&symbol=GOLDOCT
InpPostURL = https://your-host/api/ea/<account_id>/exec?key=<ea_api_key>
```

Replace `<account_id>` and `<ea_api_key>` with the values shown on the matching
dashboard card. Replace `GOLDOCT` with the exact symbol used by that terminal.

For example, if one user has three accounts:

```text
MT5 terminal 1 -> /api/ea/1/ladder?key=KEY_FOR_ACCOUNT_1&symbol=GOLDOCT
MT5 terminal 2 -> /api/ea/2/ladder?key=KEY_FOR_ACCOUNT_2&symbol=GOLDOCT
MT5 terminal 3 -> /api/ea/3/ladder?key=KEY_FOR_ACCOUNT_3&symbol=GOLDOCT
```

The symbol can be the same on all three accounts. The account ID and key are
what keep their grids separate. No changes to `GridLadder_EA.mq5` are needed.

### 2.3 Allow the backend in MT5

Don't forget MT5 → Tools → Options → Expert Advisors → allow WebRequest for
your host. For local testing, allow the exact host and port, for example
`http://127.0.0.1:8000`. For live trading, use HTTPS and a real domain because
MT5 WebRequest deployments should be protected by TLS.

### 2.4 Add and publish limits from the app

1. Open the matching account card in Gridline.
2. Select or add the symbol tab, for example `GOLDOCT`.
3. Enter the buy price, sell price, and quantities in the grid.
4. Click **Push to MT5**.
5. The EA polls its configured ladder URL and receives the rows for that
  account and symbol only.

The EA then reports status updates to its matching `InpPostURL`. Repeat the
same process in another account page to publish a different grid to another
MT5 terminal.

### 2.5 Verify the connection

Test the ladder URL with the same account ID, key, and symbol configured in the
EA:

```bash
curl "https://your-host/api/ea/<account_id>/ladder?key=<ea_api_key>&symbol=GOLDOCT"
```

A successful response has this shape:

```json
{"ok":true,"count":1,"skipped":0,"rows":[...]}
```

An `Invalid account or key` response means the account ID and EA key do not
belong together. An empty `rows` array means that no valid limits have been
pushed for that account and symbol yet.

### How account and user separation works

The web app uses the signed-in user's JWT to manage only accounts owned by that
user. Each account has:

- a unique `accounts.id`
- an `owner_id` pointing to the user
- a unique `ea_api_key`

Each limit row is stored with both `account_id` and `symbol`. When an EA calls
`/api/ea/{account_id}/ladder`, the backend first validates the account ID and
key, then filters rows by:

```text
account_id = the account in the EA URL
symbol     = the symbol in the EA URL
```

The EA does not need the user's email or JWT. The account ID plus EA key
identifies the exact trading account, which is already linked to its owner in
the database. Never reuse one account's EA key in another MT5 terminal.

## 3. Rollover

Each contract expiry:
- Update `InpGold` in the EA (e.g. `"GOLDNOV"`).
- Update the `symbol=` query param in `InpGetURL` to match.
- Nothing to change on the backend — new symbols are created automatically the
  first time you push a row for one from the dashboard.

## API surface

**Dashboard (JWT bearer auth)**
- `POST /api/auth/signup`, `POST /api/auth/login`
- `GET /api/accounts`, `POST /api/accounts`, `DELETE /api/accounts/{id}`
- `GET /api/config` — public, used for first paint before login
- `GET /api/accounts/{id}/limits?symbol=`
- `POST /api/accounts/{id}/limits/push`
- `POST /api/accounts/{id}/limits/remove`
- `GET /api/accounts/{id}/history?symbol=`

**EA (account id + key in the URL, no bearer token)**
- `GET /api/ea/{account_id}/ladder?key=&symbol=` — replaces `doGet`
- `POST /api/ea/{account_id}/exec?key=` — replaces `doPost`, routes on
  `body.sheet` (`limits` / `trades` / `warnings`) exactly like the Apps Script did

## Known gaps / next steps

- The dashboard's account cards are now real (pulled from `/api/accounts`), but
  the **symbol tabs** on the account page are tracked client-side per session
  rather than persisted — add a `GET /api/accounts/{id}/symbols` endpoint
  (trivial: `SELECT DISTINCT symbol FROM limit_rows WHERE account_id=...`) if
  you want tabs to survive a refresh.
- `column 2` (labelled "Sell qty" in the UI) is stored directly as the EA's
  `qty` field, which the EA reads as **current position size**, not a target
  sell volume — that's how the original Apps Script/EA pair used it too. Leave
  it blank/0 for a fresh grid row (so the EA places the buy leg first); only
  set it non-zero if you're seeding a row that already has an open position.
  Worth double-checking against your actual trading intent before going live.
- No rate limiting / email verification — add before exposing this publicly.


create account
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'# GridLine
