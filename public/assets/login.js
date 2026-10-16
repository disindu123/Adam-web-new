import { api } from './api.js';
const form = document.getElementById('signInForm');
const status = document.getElementById('loginStatus');
api('/api/auth/session').then(() => location.replace('/admin/')).catch(error => { if (error.status !== 401) status.textContent = 'Connection unavailable. You can try signing in again.'; });
document.getElementById('togglePassword').addEventListener('click', event => {
  const input = document.getElementById('password'), show = input.type === 'password';
  input.type = show ? 'text' : 'password'; event.currentTarget.textContent = show ? 'HIDE' : 'SHOW'; event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); event.currentTarget.setAttribute('aria-pressed', String(show));
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('signInButton');
  if (button.disabled || !form.reportValidity()) return;
  button.disabled = true; button.textContent = 'VERIFYING...'; status.textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: { email: document.getElementById('email').value.trim(), password: document.getElementById('password').value } });
    document.getElementById('password').value = '';
    location.replace('/admin/');
  } catch (error) { status.textContent = error.message; status.className = 'form-status error'; }
  finally { button.disabled = false; button.textContent = 'AUTHENTICATE ↗'; }
});
