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