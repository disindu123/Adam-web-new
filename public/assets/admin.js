import { api, element } from './api.js';
const $ = id => document.getElementById(id);
let view = 'overview', projects = [], messages = [], cursor = null, selectedMessage = null;
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Just received';
function notify(message, error = false) { $('globalStatus').textContent = message; $('globalStatus').className = `global-status${error ? ' error' : ''}`; }
async function request(path, options) {
  try { return await api(path, options); }
  catch (error) { if (error.status === 401) location.replace('/login/index.html'); throw error; }
}
function report(error) { notify(error.message || 'Unable to load data. Try refreshing.', true); }
function updateBadge(enabled) { $('siteBadge').textContent = enabled ? 'MAINTENANCE ON' : 'SITE ONLINE'; $('siteBadge').classList.toggle('warning', enabled); }
async function overview() {
  const stats = await request('/api/admin/overview');
  for (const [id, key] of [['statProjects', 'projects'], ['statPublished', 'published'], ['statMessages', 'messages'], ['statUnread', 'unread']]) $(id).textContent = stats[key];
  $('unreadBadge').textContent = stats.unread;
}
async function loadSettings() {
  const settings = await request('/api/admin/settings');
  $('maintenanceEnabled').checked = settings.maintenanceEnabled;
  $('maintenanceTitle').value = settings.maintenanceTitle;
  $('maintenanceMessage').value = settings.maintenanceMessage;
  const date = new Date(settings.maintenanceUntil);
  $('maintenanceUntil').value = settings.maintenanceUntil && !Number.isNaN(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  updateBadge(settings.maintenanceEnabled);
}
async function switchView(next) {
  if (!['overview', 'messages', 'projects', 'social', 'maintenance'].includes(next)) return;
  view = next;
  for (const node of document.querySelectorAll('.admin-view')) node.hidden = node.id !== `view-${view}`;
  for (const button of document.querySelectorAll('[data-view]')) { const current = button.dataset.view === view; button.classList.toggle('active', current); button.setAttribute('aria-current', current ? 'page' : 'false'); }
  $('pageHeading').textContent = { overview: 'Overview', messages: 'Messages', projects: 'Projects', social: 'Social links', maintenance: 'Maintenance' }[view];
  notify('');
  try {
    if (view === 'overview') await Promise.all([overview(), loadSettings()]);
    if (view === 'messages') await loadMessages();
    if (view === 'projects') await loadProjects();
    if (view === 'social') await loadSocialLinks();
    if (view === 'maintenance') await loadSettings();
  } catch (error) { report(error); }
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.openView)));
$('refresh').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; await switchView(view); button.disabled = false; });
$('signOut').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await request('/api/auth/logout', { method: 'POST', body: {} }); location.replace('/login/index.html'); }
  catch (error) { report(error); button.disabled = false; }
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));

// Project publishing and editing.
async function loadProjects() {
  try {
    projects = (await request('/api/admin/projects')).projects;
    const grid = $('projectList'); grid.replaceChildren();
    if (!projects.length) return grid.append(element('p', 'empty-state', 'No projects yet. Add your first project to get started.'));
    projects.forEach(project => {
      const card = element('article', 'admin-project'), image = document.createElement('img');
      image.src = project.imageUrl || '/assets/project-fallback.svg'; image.alt = project.title; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.src = '/assets/project-fallback.svg'; }, { once: true });
      const body = element('div', 'admin-project-content'), meta = element('div', 'project-meta');
      meta.append(element('span', project.published ? 'badge' : 'badge draft', project.published ? 'PUBLISHED' : 'DRAFT'), element('span', 'muted', `#${project.order} · ${project.category}`));
      if (project.featured) meta.append(element('span', 'badge', 'FEATURED'));
      const actions = element('div', 'form-actions'), edit = element('button', 'button', 'EDIT ↗'), remove = element('button', 'button danger', 'DELETE');
      edit.type = remove.type = 'button';
      edit.addEventListener('click', () => openProject(project));
      remove.addEventListener('click', async () => {
        if (!confirm(`Delete “${project.title}”? This removes it from your portfolio.`)) return;
        remove.disabled = true;
        try { await request(`/api/admin/projects/${project.id}`, { method: 'DELETE' }); await Promise.all([loadProjects(), overview()]); notify('Project deleted.'); }
        catch (error) { report(error); remove.disabled = false; }
      });
      actions.append(edit, remove); body.append(meta, element('h3', '', project.title), element('p', '', project.description), actions); card.append(image, body); grid.append(card);
    });
  } catch (error) { $('projectList').replaceChildren(element('p', 'empty-state', 'Unable to load projects. Use refresh to try again.')); throw error; }
}
function openProject(project) {
  $('projectForm').reset(); $('projectStatus').textContent = ''; $('projectId').value = project?.id || '';
  $('projectDialogTitle').textContent = project ? 'Edit project' : 'Add project';
  $('projectTitle').value = project?.title || ''; $('projectDescription').value = project?.description || '';
  $('projectCategory').value = project?.category || 'web'; $('projectOrder').value = project?.order ?? projects.length;
  $('projectTechnologies').value = project?.technologies?.join(', ') || ''; $('projectImage').value = project?.imageUrl || '';
  $('projectLive').value = project?.liveUrl || ''; $('projectCode').value = project?.codeUrl || '';
  $('projectPublished').checked = project?.published ?? false; $('projectFeatured').checked = project?.featured ?? false;
  $('projectDialog').showModal();
}
$('addProject').addEventListener('click', () => openProject());
$('quickAddProject').addEventListener('click', async () => { await switchView('projects'); openProject(); });
$('projectForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!$('projectForm').reportValidity() || $('saveProject').disabled) return;
  const id = $('projectId').value;
  const body = { title: $('projectTitle').value.trim(), description: $('projectDescription').value.trim(), category: $('projectCategory').value, technologies: $('projectTechnologies').value.split(',').map(value => value.trim()).filter(Boolean), order: Number($('projectOrder').value), imageUrl: $('projectImage').value.trim(), liveUrl: $('projectLive').value.trim(), codeUrl: $('projectCode').value.trim(), published: $('projectPublished').checked, featured: $('projectFeatured').checked };
  $('saveProject').disabled = true; $('projectStatus').textContent = 'Saving project...'; $('projectStatus').className = 'form-status';
  try {
    await request(`/api/admin/projects${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body });
    $('projectDialog').close(); notify(id ? 'Project updated.' : 'Project created.');
    try { await Promise.all([loadProjects(), overview()]); } catch (error) { report(error); }
  } catch (error) { $('projectStatus').textContent = error.message; $('projectStatus').className = 'form-status error'; }
  finally { $('saveProject').disabled = false; }
});

// Inbox uses the saved records; message content is always rendered as plain text.
async function loadMessages(append = false) {
  try {
    const result = await request(`/api/admin/messages${append && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    messages = append ? [...messages, ...result.messages.filter(message => !messages.some(existing => existing.id === message.id))] : result.messages;
    cursor = result.nextCursor; $('loadMore').hidden = !cursor; renderMessages();
  } catch (error) { if (!append) $('messagesList').replaceChildren(element('p', 'empty-state', 'Unable to load your inbox. Use refresh to try again.')); throw error; }
}
function renderMessages() {
  const search = $('messageSearch').value.trim().toLowerCase(), status = $('messageFilter').value;
  const filtered = messages.filter(m => (status === 'all' || m.status === status) && `${m.name} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search));
  const list = $('messagesList'); list.replaceChildren();
  if (!filtered.length) list.append(element('p', 'empty-state', messages.length ? 'No loaded messages match this filter.' : 'Your inbox is clear. New contact messages will appear here.'));
  filtered.forEach(message => {
    const row = element('button', `message-row${message.status === 'unread' ? ' unread' : ''}`); row.type = 'button';
    const main = element('div'), meta = element('div', 'message-meta');
    main.append(element('strong', '', message.subject || 'No subject'), element('small', '', `${message.name} · ${message.email}`));
    meta.append(element('span', 'badge', message.status.toUpperCase()), element('small', '', dateLabel(message.createdAt)));
    row.append(main, meta); row.addEventListener('click', () => openMessage(message)); list.append(row);
  });
}
$('messageSearch').addEventListener('input', renderMessages); $('messageFilter').addEventListener('change', renderMessages);
$('loadMore').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; try { await loadMessages(true); } catch (error) { report(error); } finally { button.disabled = false; } });
async function setMessageStatus(status, id = selectedMessage?.id) {
  if (!id) return;
  const { message } = await request(`/api/admin/messages/${id}`, { method: 'PATCH', body: { status } });
  messages = messages.map(item => item.id === message.id ? message : item);
  if (selectedMessage?.id === message.id) selectedMessage = message;
  renderMessages(); await overview();
}
async function openMessage(message) {
  selectedMessage = message;
  $('messageSubject').textContent = message.subject || 'No subject'; $('messageSender').textContent = `${message.name} <${message.email}>`; $('messageDate').textContent = dateLabel(message.createdAt); $('messageBody').textContent = message.message;
  $('replyLink').href = `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(`Re: ${message.subject || 'Your message to Dark Adam'}`)}`;
  $('messageDialog').showModal();
  if (message.status === 'unread') { try { await setMessageStatus('read', message.id); } catch (error) { report(error); } }
}
for (const [id, status] of [['markReplied', 'replied'], ['archiveMessage', 'archived']]) $(id).addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await setMessageStatus(status); $('messageDialog').close(); notify(`Message marked ${status}.`); } catch (error) { report(error); } finally { button.disabled = false; }
});
$('deleteMessage').addEventListener('click', async event => {
  if (!selectedMessage || !confirm('Permanently delete this message?')) return;
  const button = event.currentTarget; button.disabled = true;
  try { await request(`/api/admin/messages/${selectedMessage.id}`, { method: 'DELETE' }); $('messageDialog').close(); selectedMessage = null; await Promise.all([loadMessages(), overview()]); notify('Message deleted.'); }
  catch (error) { report(error); } finally { button.disabled = false; }
});

const socialKeys = ['github', 'linkedin', 'discord', 'instagram', 'telegram', 'whatsapp'];
async function loadSocialLinks() {
  $('socialFields').disabled = true;
  $('socialStatus').textContent = 'Loading social links...'; $('socialStatus').className = 'form-status';
  try {
    const { links } = await request('/api/admin/social-links');
    socialKeys.forEach(key => { $(`social-${key}`).value = links[key] || ''; });
    $('socialFields').disabled = false; $('socialStatus').textContent = '';
  } catch (error) {
    $('socialStatus').textContent = 'Unable to load links. Use refresh to try again.';
    $('socialStatus').className = 'form-status error'; throw error;
  }
}
$('socialForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!$('socialForm').reportValidity() || $('saveSocialLinks').disabled || $('socialFields').disabled) return;
  const body = Object.fromEntries(socialKeys.map(key => [key, $(`social-${key}`).value.trim()]));
  $('socialFields').disabled = true; $('socialStatus').textContent = 'Saving...'; $('socialStatus').className = 'form-status';
  try {
    await request('/api/admin/social-links', { method: 'PUT', body });
    $('socialStatus').textContent = 'Social links saved. Reload your portfolio to use the updated links.';
  } catch (error) { $('socialStatus').textContent = error.message; $('socialStatus').className = 'form-status error'; }
  finally { $('socialFields').disabled = false; }
});

$('settingsForm').addEventListener('submit', async event => {
  event.preventDefault(); if (!$('settingsForm').reportValidity() || $('saveSettings').disabled) return;
  $('saveSettings').disabled = true; $('settingsStatus').textContent = 'Saving...'; $('settingsStatus').className = 'form-status';
  try {
    const localReturn = $('maintenanceUntil').value;
    const settings = await request('/api/admin/settings', { method: 'PUT', body: { maintenanceEnabled: $('maintenanceEnabled').checked, maintenanceTitle: $('maintenanceTitle').value.trim(), maintenanceMessage: $('maintenanceMessage').value.trim(), maintenanceUntil: localReturn ? new Date(localReturn).toISOString() : '' } });
    updateBadge(settings.maintenanceEnabled); $('settingsStatus').textContent = settings.maintenanceEnabled ? 'Maintenance enabled. Visitors now see the maintenance page.' : 'Settings saved. Your portfolio is online.';
  } catch (error) { $('settingsStatus').textContent = error.message; $('settingsStatus').className = 'form-status error'; }
  finally { $('saveSettings').disabled = false; }
});
try {
  const { user } = await request('/api/auth/session'); $('sessionEmail').textContent = user.email;
  await switchView('overview');
} catch (error) { report(error); }

