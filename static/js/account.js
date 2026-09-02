/* ================= ACCOUNT / GRID PAGE ================= */
const API = { accountId:null, symbol:null };
let SYMBOLS = []; // symbols with at least one row pushed, tracked client-side per session

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
  startPolling(); // fillgrid.js — keeps status/last-update cells live without a manual refresh
}

const backToDash = document.getElementById('back-to-dash');
if(backToDash){
  backToDash.addEventListener('click', ()=>{
    stopPolling(); // fillgrid.js — no point polling a screen the user just left
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