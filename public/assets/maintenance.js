import { api } from './api.js';
const node = document.getElementById('returnTime');
const date = new Date(node.dataset.until);
if (node.dataset.until && !Number.isNaN(date.getTime())) {
  node.textContent = `Expected return: ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
  node.hidden = false;
}
setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  try { if (!(await api('/api/site-status')).maintenanceEnabled) location.replace('/'); }
  catch { /* Try again on the next connection check. */ }
}, 30000);
