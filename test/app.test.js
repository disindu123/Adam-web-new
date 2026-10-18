import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { defaultSettings, defaultSocialLinks } from '../server/validation.js';

const project = { title: 'Secure portfolio', description: 'A real project with a working backend.', category: 'web', technologies: ['Express', 'Firebase'], imageUrl: '', liveUrl: 'https://example.com', codeUrl: 'https://github.com/disindu123/Adam-web-new', published: false, featured: false, order: 0 };
const message = { name: 'Visitor', email: 'visitor@example.com', subject: 'Project inquiry', message: 'I would like to discuss a new website.', website: '' };
function fixture(options = {}) {
  const config = { production: false, trustProxy: 0, origin: 'http://localhost:3000', cookieSecret: 'a'.repeat(48), sessionCookie: 'adam-session', csrfCookie: 'adam-csrf', sessionDuration: 28800000, ...options.config };
  let settings = { ...defaultSettings }, socialLinks = { ...defaultSocialLinks }, projects = [], messages = [], sequence = 0;
  const repository = {
    health: async () => {}, getSettings: async () => ({ ...settings }), setSettings: async value => (settings = { ...value }),
    getSocialLinks: async () => ({ ...socialLinks }), setSocialLinks: async value => (socialLinks = { ...value }),
    listProjects: async publicOnly => projects.filter(p => !publicOnly || p.published),
    createProject: async data => { const item = { ...data, id: `p${++sequence}`, createdBy: 'secret-admin', createdAt: '2026-10-16T12:00:00Z' }; projects.push(item); return item; },
    updateProject: async (id, data) => { const index = projects.findIndex(p => p.id === id); if (index < 0) return null; return projects[index] = { ...projects[index], ...data }; },
    deleteProject: async id => { projects = projects.filter(p => p.id !== id); },
    createMessage: async data => { const id = `m${++sequence}`; messages.unshift({ ...data, id, status: 'unread', createdAt: '2026-10-16T12:00:00Z' }); return id; },
    listMessages: async () => ({ messages, nextCursor: null }),
    updateMessage: async (id, status) => { const item = messages.find(m => m.id === id); if (!item) return null; item.status = status; return item; },
    deleteMessage: async id => { messages = messages.filter(m => m.id !== id); },
    getStats: async () => ({ projects: projects.length, published: projects.filter(p => p.published).length, messages: messages.length, unread: messages.filter(m => m.status === 'unread').length })
  };
  let revoked = false;
  const authentication = {
    login: async (email, password) => {
      if (email !== 'admin@example.com' || password !== 'correct-password') { const error = new Error('Invalid credentials.'); error.status = 401; throw error; }
      revoked = false; return 'firebase-session';
    },
    verify: async cookie => cookie === 'firebase-session' && !revoked ? { uid: 'admin', email: 'admin@example.com' } : null,
    logout: async () => { revoked = true; }
  };
  const app = createApp({ config, repository, authentication, logger: { error() {} }, rateLimits: options.rateLimits });
  return { app, repository, authentication, getMessages: () => messages, getProjects: () => projects };
}
async function client(app, admin = false) {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/csrf').expect(200);
  const send = (method, path, data) => {
    const req = agent[method](path).set('Origin', 'http://localhost:3000').set('X-CSRF-Token', body.token);
    return data === undefined ? req : req.send(data);
  };
  if (admin) await send('post', '/api/auth/login', { email: 'admin@example.com', password: 'correct-password' }).expect(200);
  return { agent, send, token: body.token };
}

test('portfolio preserves the source content without advertising private access', async () => {
  const { app } = fixture();
  const response = await request(app).get('/').expect(200);
  assert.match(response.text, /DARK ADAM/); assert.match(response.text, /EXPERIENCE/);
  assert.doesNotMatch(response.text, /\/admin|\/login|loginForm|setTimeout\(.*MESSAGE SENT/i);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(response.headers['cache-control'], 'no-store');
  await request(app).get('/assets/portfolio.css').expect(200);
  await request(app).get('/assets/favicon.svg').expect(200);
  await request(app).get('/private/admin.html').expect(404);
  await request(app).get('/server/firebase.js').expect(404);
  await request(app).get('/.env').expect(404);
});

test('private page and every management endpoint require an authenticated session', async () => {
  const { app } = fixture(), { agent, send } = await client(app);
  await agent.get('/admin/').expect(302).expect('Location', '/login/index.html');
  const login = await agent.get('/login/index.html').expect(200);
  assert.match(login.headers['x-robots-tag'], /noindex/);
  for (const path of ['overview', 'projects', 'messages', 'settings']) await agent.get(`/api/admin/${path}`).expect(401);
  await send('post', '/api/admin/projects', project).expect(401);
  await send('put', '/api/admin/projects/nope', project).expect(401);
  await send('delete', '/api/admin/projects/nope').expect(401);
  await send('patch', '/api/admin/messages/nope', { status: 'read' }).expect(401);
  await send('delete', '/api/admin/messages/nope').expect(401);
  await send('put', '/api/admin/settings', defaultSettings).expect(401);
});

test('CSRF and origin protections reject forged requests, including malformed tokens', async () => {
  const { app } = fixture(), { agent, token } = await client(app);
  await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct-password' }).expect(403);
  await agent.post('/api/messages').set('X-CSRF-Token', token).set('Origin', 'https://attacker.example').send(message).expect(403);
  await agent.post('/api/messages').set('X-CSRF-Token', token).set('Sec-Fetch-Site', 'cross-site').send(message).expect(403);
  await agent.post('/api/messages').set('X-CSRF-Token', 'é'.repeat(64)).send(message).expect(403);
  await request(app).post('/api/messages').set('X-CSRF-Token', token).send(message).expect(403);
  await agent.post('/api/messages').set('X-CSRF-Token', token).set('Content-Type', 'text/plain').send('{}').expect(415);
});

test('contact submissions are stored as unread and validate before acknowledging success', async () => {
  const { app, getMessages, repository } = fixture({ rateLimits: { contact: 20 } }), { send } = await client(app);
  await send('post', '/api/messages', message).expect(201);
  assert.equal(getMessages().length, 1); assert.equal(getMessages()[0].status, 'unread');
  assert.equal(getMessages()[0].email, message.email); assert.equal(getMessages()[0].website, undefined);
  await send('post', '/api/messages', { ...message, email: 'invalid' }).expect(400);
  await send('post', '/api/messages', { ...message, message: 'short' }).expect(400);
  await send('post', '/api/messages', { ...message, admin: true }).expect(400);
  await send('post', '/api/messages', { ...message, website: 'spam.example' }).expect(201);
  assert.equal(getMessages().length, 1);
  repository.createMessage = async () => { throw new Error('private database credentials'); };
  const failed = await send('post', '/api/messages', message).expect(500);
  assert.doesNotMatch(failed.body.error, /credentials/);
});

test('admin login cookie is HttpOnly, SameSite Strict, and logout revokes access', async () => {
  const { app } = fixture(), { agent, send } = await client(app);
  await send('post', '/api/auth/login', { email: 'admin@example.com', password: 'incorrect' }).expect(401);
  const login = await send('post', '/api/auth/login', { email: 'admin@example.com', password: 'correct-password' }).expect(200);
  const cookie = login.headers['set-cookie'].find(value => value.startsWith('adam-session='));
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Max-Age=28800/);
  await agent.get('/admin/').expect(200); await agent.get('/api/auth/session').expect(200);
  await send('post', '/api/auth/logout', {}).expect(200);
  await agent.get('/api/auth/session').expect(401);
  await agent.get('/admin/').expect(302);
});

test('projects can be added as drafts, edited, published and deleted', async () => {
  const { app } = fixture(), { agent, send } = await client(app, true);
  const created = (await send('post', '/api/admin/projects', project).expect(201)).body.project;
  assert.equal((await agent.get('/api/projects').expect(200)).body.projects.length, 0);
  assert.equal((await agent.get('/api/admin/projects').expect(200)).body.projects.length, 1);
  await send('put', `/api/admin/projects/${created.id}`, { ...project, title: 'Updated project', published: true }).expect(200);
  const published = (await agent.get('/api/projects').expect(200)).body.projects[0];
  assert.equal(published.title, 'Updated project'); assert.equal(published.createdBy, undefined); assert.equal(published.createdAt, undefined);
  await send('post', '/api/admin/projects', { ...project, codeUrl: 'javascript:alert(1)' }).expect(400);
  await send('post', '/api/admin/projects', { ...project, liveUrl: 'http://example.com' }).expect(400);
  await send('post', '/api/admin/projects', { ...project, imageUrl: 'https://example.com/not-an-image.html' }).expect(400);
  await send('put', '/api/admin/projects/missing', project).expect(404);
  await send('delete', `/api/admin/projects/${created.id}`).expect(204);
  assert.equal((await agent.get('/api/projects').expect(200)).body.projects.length, 0);
});

test('inbox exposes real messages only to admins, supports statuses and deletion', async () => {
  const { app } = fixture(), visitor = await client(app), admin = await client(app, true);
  await visitor.send('post', '/api/messages', message).expect(201);
  await visitor.agent.get('/api/admin/messages').expect(401);
  const inbox = (await admin.agent.get('/api/admin/messages').expect(200)).body;
  assert.equal(inbox.messages.length, 1); const id = inbox.messages[0].id;
  assert.equal((await admin.agent.get('/api/admin/overview').expect(200)).body.unread, 1);
  for (const status of ['read', 'replied', 'archived']) await admin.send('patch', `/api/admin/messages/${id}`, { status }).expect(200);
  assert.equal((await admin.agent.get('/api/admin/overview').expect(200)).body.unread, 0);
  await admin.send('patch', `/api/admin/messages/${id}`, { status: 'bad' }).expect(400);
  await admin.send('patch', '/api/admin/messages/missing', { status: 'read' }).expect(404);
  await admin.send('delete', `/api/admin/messages/${id}`).expect(204);
  assert.equal((await admin.agent.get('/api/admin/messages').expect(200)).body.messages.length, 0);
});

test('maintenance switch blocks public pages and writes while preserving admin recovery', async () => {
  const { app } = fixture(), admin = await client(app, true), visitor = await client(app);
  const settings = { ...defaultSettings, maintenanceEnabled: true, maintenanceTitle: 'UPGRADING <script>alert(1)</script>', maintenanceMessage: 'Back soon & better than ever.', maintenanceUntil: '2026-10-17T12:00:00Z' };
  await admin.send('put', '/api/admin/settings', settings).expect(200);
  for (const path of ['/', '/index.html', '/?preview=1']) {
    const response = await visitor.agent.get(path).expect(503); assert.equal(response.headers['retry-after'], '300');
    assert.match(response.text, /&lt;script&gt;/); assert.doesNotMatch(response.text, /<script>alert/); assert.doesNotMatch(response.text, /\/admin|\/login/);
  }
  await visitor.agent.get('/api/projects').expect(503); await visitor.send('post', '/api/messages', message).expect(503);
  await visitor.agent.get('/login/index.html').expect(200); await admin.agent.get('/admin/').expect(200);
  await visitor.agent.get('/assets/system.css').expect(200); await visitor.agent.get('/healthz').expect(200);
  await admin.agent.get('/?preview=1').expect(200); await admin.agent.get('/api/projects?preview=1').expect(200);
  assert.equal((await visitor.agent.get('/api/site-status').expect(200)).body.maintenanceEnabled, true);
  await admin.send('put', '/api/admin/settings', { ...settings, maintenanceEnabled: false }).expect(200);
  await visitor.agent.get('/').expect(200); await visitor.send('post', '/api/messages', message).expect(201);
});

test('login and contact throttles reject excessive requests', async () => {
  const { app } = fixture({ rateLimits: { contact: 2, login: 2 } }), { send } = await client(app);
  await send('post', '/api/messages', message).expect(201); await send('post', '/api/messages', message).expect(201);
  await send('post', '/api/messages', message).expect(429);
  for (let i = 0; i < 2; i++) await send('post', '/api/auth/login', { email: 'admin@example.com', password: 'wrong' }).expect(401);
  await send('post', '/api/auth/login', { email: 'admin@example.com', password: 'wrong' }).expect(429);
});

test('JSON and request size failures are handled without leaking internals', async () => {
  const { app } = fixture(), { agent, token } = await client(app);
  await agent.post('/api/messages').set('X-CSRF-Token', token).set('Content-Type', 'application/json').send('{not-json').expect(400);
  await agent.post('/api/messages').set('X-CSRF-Token', token).send({ ...message, message: 'x'.repeat(30000) }).expect(413);
  await agent.get('/api/no-such-endpoint').expect(404);
});

test('production cookies use the Secure flag and host-scoped names', async () => {
  const { app } = fixture({ config: { production: true, sessionCookie: '__Host-adam-session', csrfCookie: '__Host-adam-csrf' } });
  const csrfResponse = await request(app).get('/api/csrf').expect(200);
  assert.match(csrfResponse.headers['set-cookie'][0], /__Host-adam-csrf=/); assert.match(csrfResponse.headers['set-cookie'][0], /Secure/);
  const cookie = csrfResponse.headers['set-cookie'][0].split(';')[0];
  const login = await request(app).post('/api/auth/login').set('Cookie', cookie).set('X-CSRF-Token', csrfResponse.body.token).send({ email: 'admin@example.com', password: 'correct-password' }).expect(200);
  assert.match(login.headers['set-cookie'][0], /__Host-adam-session=/); assert.match(login.headers['set-cookie'][0], /Secure/);
});


test('social links are editable only by admins and published to the portfolio', async () => {
  const { app } = fixture(), visitor = await client(app), admin = await client(app, true);
  await visitor.agent.get('/api/admin/social-links').expect(401);
  await visitor.send('put', '/api/admin/social-links', defaultSocialLinks).expect(401);
  const links = { github: 'https://github.com/disindu123', linkedin: 'https://www.linkedin.com/in/example/', discord: 'https://discord.gg/example', instagram: 'https://www.instagram.com/example/', telegram: 'https://t.me/example', whatsapp: 'https://wa.me/94770000000' };
  const saved = await admin.send('put', '/api/admin/social-links', links).expect(200);
  assert.deepEqual(saved.body.links, links);
  assert.deepEqual((await admin.agent.get('/api/admin/social-links').expect(200)).body.links, links);
  assert.deepEqual((await visitor.agent.get('/api/social-links').expect(200)).body.links, links);
  const publicHtml = (await visitor.agent.get('/').expect(200)).text;
  for (const key of Object.keys(links)) assert.match(publicHtml, new RegExp(`data-social="${key}"`));
  await visitor.agent.get('/assets/social-icons.svg').expect(200).expect('Content-Type', /svg/);
  // Saving maintenance settings never erases links stored in their separate document.
  await admin.send('put', '/api/admin/settings', defaultSettings).expect(200);
  assert.deepEqual((await visitor.agent.get('/api/social-links').expect(200)).body.links, links);
  await admin.send('put', '/api/admin/social-links', { ...links, whatsapp: '' }).expect(200);
  assert.equal((await visitor.agent.get('/api/social-links').expect(200)).body.links.whatsapp, '');
});

test('social link validation rejects unsafe URLs and wrong platform domains', async () => {
  const { app } = fixture(), admin = await client(app, true);
  const invalid = [
    { linkedin: 'javascript:alert(1)' }, { discord: 'http://discord.gg/example' },
    { instagram: 'https://instagram.com.attacker.example/profile' },
    { telegram: 'https://example.com/' }, { whatsapp: 'https://wa.me@attacker.example/' },
    { github: 'https://user:password@github.com/example' }, { unsupported: 'https://example.com' }
  ];
  for (const bad of invalid) await admin.send('put', '/api/admin/social-links', { ...defaultSocialLinks, ...bad }).expect(400);
  assert.deepEqual((await admin.agent.get('/api/admin/social-links').expect(200)).body.links, defaultSocialLinks);
});

test('social profile links follow maintenance gating and authenticated previews', async () => {
  const { app } = fixture(), visitor = await client(app), admin = await client(app, true);
  await admin.send('put', '/api/admin/settings', { ...defaultSettings, maintenanceEnabled: true }).expect(200);
  await visitor.agent.get('/api/social-links').expect(503);
  await visitor.agent.get('/api/social-links?preview=1').expect(503);
  await admin.agent.get('/api/social-links?preview=1').expect(200);
  await admin.agent.get('/api/admin/social-links').expect(200);
});
