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

// openAccount() navigates to the account page (or switches in-page view for
// the single-page-app case) — defined here since the dashboard is what
// triggers it, but it also needs API/initializeAccount from account.js, so
// account.js must load on any page that also loads dashboard.js if both
// screens live in one document.
function openAccount(acct){
  if(document.getElementById('screen-account')){
    API.accountId = acct.id;
    document.getElementById('acct-page-name').textContent = acct.name;
    document.getElementById('acct-page-id').textContent = `ID ${acct.id} · ${acct.broker_label}`;
    initializeAccount(acct);
    return;
  }
  window.location.href = `/account/${acct.id}`;
}