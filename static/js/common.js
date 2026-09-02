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

/* ================= HELPERS ================= */
function escapeHtml(s){
  return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}