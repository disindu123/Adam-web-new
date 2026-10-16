let csrf;
async function token() {
  if (!csrf) {
    const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Unable to connect. Please try again.');
    csrf = (await response.json()).token;
  }
  return csrf;
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (!['GET', 'HEAD'].includes(method)) {
    headers['X-CSRF-Token'] = await token();
    if (method !== 'DELETE') headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, { method, headers, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(20000) });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed. Please try again.');
    error.status = response.status;
    if (response.status === 403) csrf = undefined;
    throw error;
  }
  return data;
}
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
