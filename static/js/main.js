/* ================= NAV ================= */
function go(name){
  // If this is the single-page app (screen exists), switch views in-page
  const el = document.getElementById('screen-'+name);
  if(el){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    el.classList.add('active');
    window.scrollTo(0,0);
    return;
  }
  // Otherwise navigate to matching route
  if(name === 'login') return window.location.href = '/';
  if(name === 'dashboard') return window.location.href = '/dashboard';
  if(name === 'account'){
    if(API.accountId) return window.location.href = `/account/${API.accountId}`;
    return window.location.href = '/dashboard';
  }
  if(name === 'history'){
    if(API.accountId) return window.location.href = `/history?account_id=${API.accountId}`;
    return window.location.href = '/dashboard';
  }
}

/* ================= TOKEN / API ================= */
function getToken(){ return localStorage.getItem('gridline_token'); }
function setToken(t){ localStorage.setItem('gridline_token', t); }
function clearToken(){ localStorage.removeItem('gridline_token'); }

function apiHeaders(){
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if(token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}
function handleAuthFailure(res){
  if(res.status === 401 && getToken()){
    clearToken();
    go('login');
    showToast('Session expired — please sign in again');
  }
}
async function apiGet(path){
  const res = await fetch(path, { headers: apiHeaders() });
  if(!res.ok){ handleAuthFailure(res); throw new Error(`GET ${path} failed: ${res.status}`); }
  return res.json();
}
async function apiPost(path, body){
  const res = await fetch(path, { method:'POST', headers: apiHeaders(), body: JSON.stringify(body) });
  if(!res.ok){ handleAuthFailure(res); throw new Error(`POST ${path} failed: ${res.status}`); }
  return res.json();
}
async function apiDelete(path){
  const res = await fetch(path, { method:'DELETE', headers: apiHeaders() });
  if(!res.ok){ handleAuthFailure(res); throw new Error(`DELETE ${path} failed: ${res.status}`); }
  return res.json();
}

/* ================= TOAST ================= */
const toastEl = document.createElement('div');
toastEl.className = 'toast';
toastEl.innerHTML = `<span class="toast-dot"></span><span id="toast-msg"></span>`;
document.body.appendChild(toastEl);
let toastTimer = null;
function showToast(msg){
  const msgEl = document.getElementById('toast-msg');
  if(msgEl) msgEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 2600);
}

/* ================= AUTH SCREEN ================= */
let authMode = 'login';
const loginToggle = document.getElementById('login-mode-toggle');
const loginSubmitBtn = document.getElementById('login-submit-btn');
if(loginToggle && loginSubmitBtn){
  loginToggle.addEventListener('click', (e)=>{
    e.preventDefault();
    authMode = authMode === 'login' ? 'signup' : 'login';
    loginSubmitBtn.textContent = authMode === 'login' ? 'Sign in' : 'Create account';
    loginToggle.textContent = authMode === 'login' ? 'Create account instead' : 'Sign in instead';
  });
  loginSubmitBtn.addEventListener('click', async ()=>{
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if(!email || !password){ showToast('Enter an email and password'); return; }
    const path = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    try{
      const res = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password}) });
      const data = await res.json();
      if(!res.ok){ showToast(data.detail || 'Sign in failed'); return; }
      setToken(data.access_token);
      window.location.href = '/dashboard';
    }catch(err){
      console.error(err);
      showToast('Could not reach the backend — is it running?');
    }
  });
}
const logoutLink = document.getElementById('logout-link');
if(logoutLink){
  logoutLink.addEventListener('click', ()=>{
    clearToken();
    go('login');
  });
}

/* ================= DASHBOARD ================= */
let ACCOUNTS = [];

async function loadDashboard(){
  document.getElementById('dash-sub').textContent = 'Loading accounts…';
  try{
    ACCOUNTS = await apiGet('/api/accounts');
  }catch(err){
    showToast('Could not load accounts');
    return;
  }
  document.getElementById('dash-sub').textContent =
    ACCOUNTS.length + ' account' + (ACCOUNTS.length===1?'':'s') + ' connected';
  renderAccountGrid();
}

function renderAccountGrid(){
  const grid = document.getElementById('account-grid');
  grid.innerHTML = '';
  ACCOUNTS.forEach(acct=>{
    const card = document.createElement('div');
    card.className = 'acct-card';
    card.innerHTML = `
      <div class="acct-card-top">
        <div>
          <div class="acct-name">${escapeHtml(acct.name)}</div>
          <div class="acct-id">ID ${acct.id} · ${escapeHtml(acct.broker_label)}</div>
        </div>
        <div class="acct-status-dot"></div>
      </div>
      <div class="acct-add-symbol" style="padding-top:0;">EA key: <code style="color:var(--text-muted)">${acct.ea_api_key.slice(0,10)}…</code></div>
      <div class="acct-card-actions">
        <button class="btn-open">Open</button>
        <button class="btn-delete">Delete</button>
      </div>`;
    card.querySelector('.btn-open').addEventListener('click', ()=> openAccount(acct));
    card.querySelector('.btn-delete').addEventListener('click', async ()=>{
      if(!confirm(`Delete account "${acct.name}"? This removes all its grid rows and history.`)) return;
      await apiDelete(`/api/accounts/${acct.id}`);
      await loadDashboard();
    });
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'acct-card add-new';
  addCard.innerHTML = `<div class="add-new-inner"><div class="add-new-circle">+</div>Connect a new account</div>`;
  addCard.addEventListener('click', openAccountModal);
  grid.appendChild(addCard);
}

const accountModal = document.getElementById('account-modal');
const accountForm = document.getElementById('account-form');
const accountNameInput = document.getElementById('account-name');
function closeAccountModal(){
  if(accountModal) accountModal.hidden = true;
}
function openAccountModal(){
  if(!accountModal) return;
  accountModal.hidden = false;
  accountNameInput?.focus();
}
document.getElementById('account-modal-close')?.addEventListener('click', closeAccountModal);
document.getElementById('account-cancel')?.addEventListener('click', closeAccountModal);
accountModal?.addEventListener('click', e=>{
  if(e.target === accountModal) closeAccountModal();
});
accountForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const formData = new FormData(accountForm);
  const name = String(formData.get('name') || '').trim();
  const broker = String(formData.get('broker_label') || 'MT5').trim() || 'MT5';
  if(!name) return;
  try{
    await apiPost('/api/accounts', { name, broker_label: broker });
    accountForm.reset();
    document.getElementById('account-broker').value = 'MT5';
    closeAccountModal();
    await loadDashboard();
  }catch(err){
    console.error(err);
    showToast('Could not connect account');
  }
});

const addAccountBtn = document.getElementById('btn-add-account');
if(addAccountBtn){
  addAccountBtn.addEventListener('click', openAccountModal);
}

function escapeHtml(s){
  return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

/* ================= ACCOUNT / GRID PAGE ================= */
const API = { accountId:null, symbol:null };
let SYMBOLS = []; // symbols with at least one row pushed, tracked client-side per session

function openAccount(acct){
  // If we're in single-page view, behave as before; otherwise navigate to account route
  if(document.getElementById('screen-account')){
    API.accountId = acct.id;
    document.getElementById('acct-page-name').textContent = acct.name;
    document.getElementById('acct-page-id').textContent = `ID ${acct.id} · ${acct.broker_label}`;
    initializeAccount(acct);
    return;
  }
  window.location.href = `/account/${acct.id}`;
}

async function initializeAccount(acct){
  try{
    SYMBOLS = await apiGet(`/api/accounts/${API.accountId}/symbols`);
  }catch(err){
    console.error('failed to load symbols', err);
    SYMBOLS = ['GOLDOCT'];
  }
  if(SYMBOLS.length === 0) SYMBOLS = ['GOLDOCT'];
  API.symbol = SYMBOLS[0];
  renderTabs();
  go('account');
  await syncFromServer();
}

const backToDash = document.getElementById('back-to-dash');
if(backToDash){
  backToDash.addEventListener('click', ()=>{
    go('dashboard');
  });
}
const tabAdd = document.getElementById('tab-add');
const symbolForm = document.getElementById('symbol-form');
const symbolInput = document.getElementById('symbol-input');
const symbolDeleteModal = document.getElementById('symbol-delete-modal');
let symbolPendingDelete = null;
function closeSymbolForm(){
  if(symbolForm) symbolForm.hidden = true;
  if(symbolInput) symbolInput.value = '';
  if(tabAdd) tabAdd.hidden = false;
}
if(tabAdd){
  tabAdd.addEventListener('click', ()=>{
    tabAdd.hidden = true;
    if(symbolForm) symbolForm.hidden = false;
    symbolInput?.focus();
  });
}
document.getElementById('symbol-form-cancel')?.addEventListener('click', closeSymbolForm);
symbolForm?.addEventListener('submit', async e=>{
  e.preventDefault();
  const symbol = symbolInput?.value.trim().toUpperCase();
  if(!symbol) return;
  if(SYMBOLS.includes(symbol)){
    API.symbol = symbol;
    closeSymbolForm();
    renderTabs();
    syncFromServer();
    return;
  }
  try{
    SYMBOLS = await apiPost(`/api/accounts/${API.accountId}/symbols`, { symbol });
    API.symbol = symbol;
    closeSymbolForm();
    renderTabs();
    syncFromServer();
  }catch(err){
    console.error(err);
    showToast('Could not add symbol');
  }
});

function renderTabs(){
  const strip = document.getElementById('tab-strip');
  strip.querySelectorAll('.sym-tab').forEach(t=>t.remove());
  const addBtn = document.getElementById('tab-add');
  SYMBOLS.forEach(sym=>{
    const tab = document.createElement('div');
    tab.className = 'sym-tab' + (sym===API.symbol ? ' active' : '');
    tab.innerHTML = `<div class="tab-dot" style="background:var(--buy)"></div><span>${escapeHtml(sym)}</span><button class="sym-tab-close" type="button" aria-label="Delete ${escapeHtml(sym)}">×</button>`;
    tab.addEventListener('click', e=>{
      if(e.target.closest('.sym-tab-close')) return;
      API.symbol = sym;
      renderTabs();
      syncFromServer();
    });
    tab.querySelector('.sym-tab-close').addEventListener('click', ()=> confirmDeleteSymbol(sym));
    strip.insertBefore(tab, addBtn);
  });
  document.getElementById('sheet-title-tag').textContent = API.symbol || '—';
}

function closeSymbolDeleteModal(){
  if(symbolDeleteModal) symbolDeleteModal.hidden = true;
  symbolPendingDelete = null;
}
function confirmDeleteSymbol(symbol){
  if(SYMBOLS.length <= 1){ showToast('Keep at least one symbol tab'); return; }
  symbolPendingDelete = symbol;
  const message = document.getElementById('symbol-delete-message');
  if(message) message.textContent = `All limits for ${symbol} will be canceled.`;
  if(symbolDeleteModal) symbolDeleteModal.hidden = false;
}
document.getElementById('symbol-delete-close')?.addEventListener('click', closeSymbolDeleteModal);
document.getElementById('symbol-delete-cancel')?.addEventListener('click', closeSymbolDeleteModal);
symbolDeleteModal?.addEventListener('click', e=>{
  if(e.target === symbolDeleteModal) closeSymbolDeleteModal();
});
document.getElementById('symbol-delete-confirm')?.addEventListener('click', async ()=>{
  const symbol = symbolPendingDelete;
  if(!symbol) return;
  closeSymbolDeleteModal();
  await deleteSymbol(symbol);
});

async function deleteSymbol(symbol){
  if(SYMBOLS.length <= 1){ showToast('Keep at least one symbol tab'); return; }
  try{
    await apiDelete(`/api/accounts/${API.accountId}/symbols/${encodeURIComponent(symbol)}`);
    SYMBOLS = SYMBOLS.filter(item=>item !== symbol);
    if(API.symbol === symbol) API.symbol = SYMBOLS[0];
    renderTabs();
    await syncFromServer();
    showToast(`${symbol} removed from this account`);
  }catch(err){
    console.error(err);
    showToast(`Could not remove ${symbol}`);
  }
}

const btnHistory = document.getElementById('btn-history');
if(btnHistory){
  btnHistory.addEventListener('click', ()=>{
    const historyAcct = document.getElementById('history-acct-id');
    const acctId = document.getElementById('acct-page-id');
    if(historyAcct && acctId){
      historyAcct.textContent = acctId.textContent;
      loadHistory();
      go('history');
      return;
    }
    go('history');
  });
}
const backToAccount = document.getElementById('back-to-account');
if(backToAccount){
  backToAccount.addEventListener('click', ()=> go('account'));
}

/* ================= FILL GRID ================= */
const GRID_ROWS = 30;
const gridData = [];
for(let r=0;r<GRID_ROWS;r++) gridData.push(['','','','']);
const pushState = new Array(GRID_ROWS).fill('idle');
const pushTime = new Array(GRID_ROWS).fill('');
const rowIds = new Array(GRID_ROWS).fill(null);

const tbody = document.getElementById('fillgrid-body');

function fmt(v){
  if(v===''||v===null||v===undefined||isNaN(v)) return '';
  return (Math.round(v*100)/100).toString();
}

function renderGrid(){
  if(!tbody) return;
  tbody.innerHTML = '';
  for(let r=0;r<GRID_ROWS;r++){
    const tr = document.createElement('tr');
    const rh = document.createElement('td');
    rh.className = 'rowhead';
    rh.textContent = r+1;
    tr.appendChild(rh);

    const locked = pushState[r] !== 'idle';

    for(let c=0;c<4;c++){
      const td = document.createElement('td');
      td.className = 'gcell' + (locked ? ' locked' : '');
      td.dataset.row = r; td.dataset.col = c;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = fmt(gridData[r][c]);
      input.dataset.row = r; input.dataset.col = c;
      if(locked) input.readOnly = true;
      input.addEventListener('input', e=>{
        const val = parseFloat(e.target.value);
        gridData[r][c] = e.target.value === '' || isNaN(val) ? '' : val;
      });
      td.appendChild(input);
      tr.appendChild(td);
    }

    const tdStatus = document.createElement('td');
    tdStatus.className = 'gcell readonly';
    const hasPrice = gridData[r][0] !== '' && gridData[r][2] !== '';
    let pillHtml;
    if(pushState[r]==='placed'){
      pillHtml = `<span class="status-pill-mini placed-buy"><span class="status-dot"></span>EA active</span>`;
    } else if(pushState[r]==='pending'){
      pillHtml = `<span class="status-pill-mini pending"><span class="status-dot"></span>Saved — awaiting EA</span>`;
    } else if(hasPrice){
      pillHtml = `<span class="status-pill-mini ready"><span class="status-dot"></span>Ready — not pushed</span>`;
    } else {
      pillHtml = `<span class="status-pill-mini"><span class="status-dot"></span>Empty</span>`;
    }
    const showRemove = pushState[r]==='placed' || pushState[r]==='pending';
    tdStatus.innerHTML = `<div class="status-cell-inner">${pillHtml}${showRemove ? `<button class="status-recall" data-row="${r}">Remove</button>` : ''}</div>`;
    tr.appendChild(tdStatus);

    const tdUpdate = document.createElement('td');
    tdUpdate.className = 'gcell readonly';
    tdUpdate.innerHTML = `<span class="last-update-cell">${pushTime[r] || (hasPrice ? '—' : '')}</span>`;
    tr.appendChild(tdUpdate);

    tbody.appendChild(tr);
  }
  applySelectionClasses();
}

/* ---- selection / fill-handle (same UX as the prototype) ---- */
const sel = { col:null, start:null, end:null, active:false };
const fillState = { active:false, previewEnd:null };

function applySelectionClasses(){
  tbody.querySelectorAll('td.gcell').forEach(td=>{
    td.classList.remove('cell-selected','cell-anchor','cell-preview');
    const handle = td.querySelector('.fill-handle');
    if(handle) handle.remove();
  });
  if(sel.col===null) return;
  const lo = Math.min(sel.start, sel.end), hi = Math.max(sel.start, sel.end);
  for(let r=lo;r<=hi;r++){
    const td = tbody.querySelector(`td.gcell[data-row="${r}"][data-col="${sel.col}"]`);
    if(td) td.classList.add('cell-selected');
  }
  if(fillState.active && fillState.previewEnd!==null && fillState.previewEnd>hi){
    for(let r=hi+1;r<=fillState.previewEnd;r++){
      const td = tbody.querySelector(`td.gcell[data-row="${r}"][data-col="${sel.col}"]`);
      if(td) td.classList.add('cell-preview');
    }
  }
  const handleRow = (fillState.active && fillState.previewEnd!==null) ? fillState.previewEnd : hi;
  const handleTd = tbody.querySelector(`td.gcell[data-row="${handleRow}"][data-col="${sel.col}"]`);
  if(handleTd && !fillState.active){
    const h = document.createElement('div');
    h.className = 'fill-handle';
    h.addEventListener('mousedown', onFillHandleDown);
    handleTd.appendChild(h);
  }
}

function rowFromPoint(x,y){
  const els = document.elementsFromPoint(x,y);
  const td = els.find(el=>el.classList && el.classList.contains('gcell'));
  if(!td) return null;
  return { row: parseInt(td.dataset.row), col: parseInt(td.dataset.col) };
}

if(tbody){
  tbody.addEventListener('mousedown', (e)=>{
    const td = e.target.closest('td.gcell');
    if(!td || e.target.classList.contains('fill-handle')) return;
    if(td.classList.contains('locked')) return;
    sel.col = parseInt(td.dataset.col); sel.start = parseInt(td.dataset.row); sel.end = sel.start; sel.active = true;
    applySelectionClasses();
  });
}
document.addEventListener('mousemove', (e)=>{
  if(sel.active){
    const hit = rowFromPoint(e.clientX, e.clientY);
    if(hit && hit.col===sel.col){ sel.end = hit.row; applySelectionClasses(); }
  }
  if(fillState.active){
    const hit = rowFromPoint(e.clientX, e.clientY);
    if(hit && hit.col===sel.col){
      fillState.previewEnd = Math.max(hit.row, Math.max(sel.start, sel.end));
      applySelectionClasses();
    }
  }
});
document.addEventListener('mouseup', ()=>{
  if(sel.active){ sel.active = false; applySelectionClasses(); }
  if(fillState.active){ commitFill(); fillState.active = false; fillState.previewEnd = null; applySelectionClasses(); }
});
function onFillHandleDown(e){
  e.stopPropagation(); e.preventDefault();
  fillState.active = true;
  fillState.previewEnd = Math.max(sel.start, sel.end);
}
function commitFill(){
  const lo = Math.min(sel.start, sel.end), hi = Math.max(sel.start, sel.end), col = sel.col;
  if(fillState.previewEnd===null || fillState.previewEnd<=hi) return;
  const vals = [];
  for(let r=lo;r<=hi;r++){ const v = gridData[r][col]; if(v!=='' && !isNaN(v)) vals.push(v); }
  let step = 0;
  if(vals.length>=2) step = vals[1]-vals[0];
  else if(vals.length===0) return;
  const base = vals[vals.length-1];
  let n = 1;
  for(let r=hi+1;r<=fillState.previewEnd;r++){
    if(pushState[r] !== 'idle') continue;
    gridData[r][col] = Math.round((base + step*n)*100)/100;
    n++;
  }
  sel.start = lo; sel.end = fillState.previewEnd;
  renderGrid();
}

renderGrid();

/* ================= SYNC WITH BACKEND ================= */
async function syncFromServer(){
  if(!API.accountId || !API.symbol) return;
  let rows;
  try{
    rows = await apiGet(`/api/accounts/${API.accountId}/limits?symbol=${encodeURIComponent(API.symbol)}`);
  }catch(err){ console.error('sync failed', err); return; }

  const localUnsavedRows = gridData.map((values, r)=>({
    values: [...values],
    row: r,
  })).filter(item=>pushState[item.row] === 'idle' && item.values.some(value=>value !== ''));

  for(let r=0;r<GRID_ROWS;r++){
    pushState[r] = 'idle'; pushTime[r] = ''; rowIds[r] = null;
    gridData[r] = ['','','',''];
  }
  localUnsavedRows.forEach(item=>{
    gridData[item.row] = item.values;
  });
  rows.forEach(row=>{
    const r = row.row_index - 1;
    if(r < 0 || r >= GRID_ROWS) return;
    rowIds[r] = row.id;
    pushState[r] = row.status;
    pushTime[r] = row.updated_at ? new Date(row.updated_at).toTimeString().slice(0,8) : '';
    gridData[r][0] = row.buy_price ?? '';
    gridData[r][1] = row.sell_qty ?? '';
    gridData[r][2] = row.sell_price ?? '';
    gridData[r][3] = row.buy_qty ?? '';
  });
  renderGrid();
}

const pushBtn = document.getElementById('push-btn');
if(pushBtn){
  pushBtn.addEventListener('click', async ()=>{
    const rowsToPush = [];
    for(let r=0;r<GRID_ROWS;r++){
      const hasBoth = gridData[r][0] !== '' && gridData[r][2] !== '';
      if(hasBoth && pushState[r]==='idle'){
        rowsToPush.push({
          row_index: r+1,
          buy_price: gridData[r][0],
          sell_qty: gridData[r][1]===''? null : gridData[r][1],
          sell_price: gridData[r][2],
          buy_qty: gridData[r][3]===''? null : gridData[r][3],
        });
      }
    }
    if(rowsToPush.length===0){ showToast('No new rows to push — fill both price columns first'); return; }
    try{
      const created = await apiPost(`/api/accounts/${API.accountId}/limits/push`, { symbol: API.symbol, rows: rowsToPush });
      showToast(`Saved ${created.length} row${created.length>1?'s':''} — waiting for EA`);
      await syncFromServer();
    }catch(err){
      console.error(err);
      showToast('Push failed — check the backend is running');
    }
  });
}

if(tbody){
  tbody.addEventListener('click', (e)=>{
    const btn = e.target.closest('.status-recall');
    if(!btn) return;
    requestRemove(parseInt(btn.dataset.row));
  });
}
async function requestRemove(r){
  const id = rowIds[r];
  if(!id) return;
  try{
    await apiPost(`/api/accounts/${API.accountId}/limits/remove`, { symbol: API.symbol, row_ids: [id] });
    showToast('Removed — EA will cancel any live order on its next sync');
    await syncFromServer();
  }catch(err){
    console.error(err);
    showToast('Remove failed');
  }
}
const removeAllBtn = document.getElementById('remove-all-btn');
if(removeAllBtn){
  removeAllBtn.addEventListener('click', async ()=>{
    if(!pushState.some(s => s !== 'idle')){ showToast('Nothing pushed yet — nothing to remove'); return; }
    try{
      await apiPost(`/api/accounts/${API.accountId}/limits/remove`, { symbol: API.symbol, all: true });
      showToast('Removing all active rows for this symbol');
      await syncFromServer();
    }catch(err){
      console.error(err);
      showToast('Remove failed');
    }
  });
}

/* ================= HISTORY ================= */
let HISTORY_ROWS = [];

function parseHistoryDate(value){
  if(!value) return null;
  const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if(match) return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}`);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function renderHistoryRows(rows){
  const tbodyH = document.getElementById('history-body');
  if(!tbodyH) return;
  if(rows.length===0){
    tbodyH.innerHTML = `<tr><td colspan="9" class="empty-state">No trades match these filters</td></tr>`;
    return;
  }
  tbodyH.innerHTML = rows.map(t=>{
    const typeClass = t.type === 'Sell' ? 'sell' : 'buy';
    const pnlClass = (t.profit ?? 0) >= 0 ? 'pnl-pos' : 'pnl-neg';
    const pnlStr = t.profit!=null ? (t.profit>=0?'+':'') + t.profit.toFixed(2) : '—';
    return `<tr>
      <td>${t.ticket}</td><td>${escapeHtml(t.symbol)}</td>
      <td><span class="type-pill ${typeClass}">${t.type}</span></td>
      <td>${t.open_time||'—'}</td><td>${t.open_price??'—'}</td>
      <td>${t.close_time||'—'}</td><td>${t.close_price??'—'}</td>
      <td>${t.qty??'—'}</td><td class="${pnlClass}">${pnlStr}</td>
    </tr>`;
  }).join('');
}

function applyHistoryFilters(){
  const symbol = document.querySelector('#history-filters .chip-filter.active')?.dataset.symbol || '';
  const type = document.getElementById('history-type')?.value || '';
  const fromValue = document.getElementById('history-from')?.value;
  const toValue = document.getElementById('history-to')?.value;
  const from = fromValue ? new Date(fromValue) : null;
  const to = toValue ? new Date(toValue) : null;
  const filtered = HISTORY_ROWS.filter(trade=>{
    if(symbol && trade.symbol !== symbol) return false;
    if(type && trade.type !== type) return false;
    const tradeDate = parseHistoryDate(trade.close_time || trade.open_time);
    if(from && (!tradeDate || tradeDate < from)) return false;
    if(to && (!tradeDate || tradeDate > to)) return false;
    return true;
  });
  renderHistoryRows(filtered);
}

async function loadHistory(symbol){
  const tbodyH = document.getElementById('history-body');
  if(!tbodyH) return;
  tbodyH.innerHTML = `<tr><td colspan="9" class="empty-state">Loading…</td></tr>`;
  let path = `/api/accounts/${API.accountId}/history`;
  if(symbol) path += `?symbol=${encodeURIComponent(symbol)}`;
  let rows;
  try{ rows = await apiGet(path); }
  catch(err){ tbodyH.innerHTML = `<tr><td colspan="9" class="empty-state">Could not load history</td></tr>`; return; }

  HISTORY_ROWS = rows;

  const filters = document.getElementById('history-filters');
  const symbols = [...new Set(rows.map(t=>t.symbol))];
  filters.innerHTML = `<div class="chip-filter active" data-symbol="">All symbols</div>` +
    symbols.map(s=>`<div class="chip-filter" data-symbol="${s}">${s}</div>`).join('');
  filters.querySelectorAll('.chip-filter').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      filters.querySelectorAll('.chip-filter').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      applyHistoryFilters();
    });
  });
  applyHistoryFilters();
}

['history-from','history-to','history-type'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', applyHistoryFilters);
});
document.getElementById('history-reset')?.addEventListener('click', ()=>{
  document.getElementById('history-from').value = '';
  document.getElementById('history-to').value = '';
  document.getElementById('history-type').value = '';
  document.querySelectorAll('#history-filters .chip-filter').forEach(chip=>chip.classList.remove('active'));
  document.querySelector('#history-filters .chip-filter[data-symbol=""]')?.classList.add('active');
  applyHistoryFilters();
});

/* ================= INIT ================= */
async function init(){
  if(!getToken()){ go('login'); return; }
  if(document.getElementById('history-body')){
    if(!window.APP || !window.APP.account_id){ go('dashboard'); return; }
    API.accountId = window.APP.account_id;
    try{
      const acct = await apiGet(`/api/accounts/${API.accountId}`);
      const historyAcct = document.getElementById('history-acct-id');
      if(historyAcct) historyAcct.textContent = `ID ${acct.id} · ${acct.broker_label}`;
      go('history');
      await loadHistory();
    }catch(err){
      console.error('failed to init history page', err);
      go('dashboard');
    }
    return;
  }
  // If this page was rendered with an account_id, initialize account page
  if(window.APP && window.APP.account_id){
    API.accountId = window.APP.account_id;
    try{
      const acct = await apiGet(`/api/accounts/${API.accountId}`);
      document.getElementById('acct-page-name').textContent = acct.name;
      document.getElementById('acct-page-id').textContent = `ID ${acct.id} · ${acct.broker_label}`;
      await initializeAccount(acct);
      return;
    }catch(err){ console.error('failed to init account page', err); go('dashboard'); return; }
  }
  // Default dashboard flow
  try{
    await loadDashboard();
    go('dashboard');
  }catch(err){
    go('login');
  }
}
init();
