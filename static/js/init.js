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