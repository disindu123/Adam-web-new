import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { documentId, loginSchema, messageSchema, projectSchema, messageUpdateSchema, settingsSchema, parse } from './validation.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDir = join(root, 'public');
const privateDir = join(root, 'private');
const maintenanceTemplate = readFileSync(join(privateDir, 'maintenance.html'), 'utf8');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function createApp({ config, repository, authentication, logger = console, rateLimits = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      formAction: ["'self'"], baseUri: ["'self'"],
      upgradeInsecureRequests: config.production ? [] : null
    } },
    strictTransportSecurity: config.production ? undefined : false
  }));
  app.use(cookieParser(config.cookieSecret));
  app.use(express.json({ limit: '24kb', strict: true }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (/^\/(api|admin|login)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' };
  const csrfOptions = { ...cookieOptions, signed: true };

  app.get('/api/csrf', (req, res) => {
    const token = req.signedCookies[config.csrfCookie] || randomBytes(32).toString('hex');
    res.cookie(config.csrfCookie, token, csrfOptions).json({ token });
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const expected = req.signedCookies[config.csrfCookie];
    const actual = req.get('x-csrf-token');
    if ((origin && origin !== config.origin) || req.get('sec-fetch-site') === 'cross-site' || typeof expected !== 'string' || typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(actual) || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      return res.status(403).json({ error: 'Your request could not be verified. Refresh and try again.' });
    }
    if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'Send JSON data.' });
    next();
  });

  const requireAdmin = async (req, res, next) => {
    const user = await authentication.verify(req.cookies[config.sessionCookie]);
    if (!user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    req.user = user;
    next();
  };
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: rateLimits.login ?? 8, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
  const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: rateLimits.contact ?? 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Message limit reached. Please try again in an hour.' } });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const session = await authentication.login(email, password, config.sessionDuration);
    res.cookie(config.sessionCookie, session, { ...cookieOptions, maxAge: config.sessionDuration });
    res.json({ ok: true });
  });
  app.get('/api/auth/session', requireAdmin, (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/logout', async (req, res) => {
    const user = await authentication.verify(req.cookies[config.sessionCookie]);
    try { if (user) await authentication.logout(user.uid); }
    finally { res.clearCookie(config.sessionCookie, cookieOptions); }
    res.json({ ok: true });
  });

  app.get('/healthz', async (req, res) => {
    await repository.health();
    res.json({ status: 'ok' });
  });
  const statusPayload = settings => ({ maintenanceEnabled: settings.maintenanceEnabled, maintenanceTitle: settings.maintenanceTitle, maintenanceMessage: settings.maintenanceMessage, maintenanceUntil: settings.maintenanceUntil });
  app.get('/api/site-status', async (req, res) => res.json(statusPayload(await repository.getSettings())));

  app.use('/api/admin', requireAdmin);
  app.get('/api/admin/overview', async (req, res) => res.json(await repository.getStats()));
  app.get('/api/admin/projects', async (req, res) => res.json({ projects: await repository.listProjects() }));
  app.post('/api/admin/projects', async (req, res) => res.status(201).json({ project: await repository.createProject(parse(projectSchema, req.body), req.user.uid) }));
  app.put('/api/admin/projects/:id', async (req, res) => {
    const project = await repository.updateProject(parse(documentId, req.params.id), parse(projectSchema, req.body), req.user.uid);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ project });
  });
  app.delete('/api/admin/projects/:id', async (req, res) => {
    await repository.deleteProject(parse(documentId, req.params.id));
    res.status(204).end();
  });
  app.get('/api/admin/messages', async (req, res) => {
    const cursor = req.query.cursor === undefined ? undefined : parse(documentId, req.query.cursor);
    res.json(await repository.listMessages(cursor));
  });
  app.patch('/api/admin/messages/:id', async (req, res) => {
    const message = await repository.updateMessage(parse(documentId, req.params.id), parse(messageUpdateSchema, req.body).status);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    res.json({ message });
  });
  app.delete('/api/admin/messages/:id', async (req, res) => {
    await repository.deleteMessage(parse(documentId, req.params.id));
    res.status(204).end();
  });
  app.get('/api/admin/settings', async (req, res) => res.json(statusPayload(await repository.getSettings())));
  app.put('/api/admin/settings', async (req, res) => res.json(await repository.setSettings(parse(settingsSchema, req.body), req.user.uid)));

  app.get(['/login', '/login/'], (req, res) => res.redirect('/login/index.html'));
  app.get('/login/index.html', (req, res) => res.sendFile(join(privateDir, 'login.html')));
  app.get(['/admin', '/admin/', '/admin/index.html'], async (req, res) => {
    if (!await authentication.verify(req.cookies[config.sessionCookie])) return res.redirect('/login/index.html');
    res.sendFile(join(privateDir, 'admin.html'));
  });

  // Static assets remain available so the maintenance page can render its styles.
  app.use('/assets', express.static(join(publicDir, 'assets'), { index: false, maxAge: '1h', dotfiles: 'deny' }));
  app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /login/\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${config.origin}/sitemap.xml\n`));
  app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(config.origin)}/</loc></url></urlset>`));
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/') && !['/api/projects', '/api/messages'].includes(req.path)) return next();
    const settings = await repository.getSettings();
    if (!settings.maintenanceEnabled) return next();
    if (req.method === 'GET' && req.query.preview === '1' && await authentication.verify(req.cookies[config.sessionCookie])) return next();
    res.set('Retry-After', '300');
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'The site is temporarily under maintenance. Please try again shortly.' });
    let page = maintenanceTemplate;
    for (const [key, value] of Object.entries({ TITLE: settings.maintenanceTitle, MESSAGE: settings.maintenanceMessage, UNTIL: settings.maintenanceUntil })) {
      page = page.replaceAll(`{{${key}}}`, escapeHtml(value));
    }
    res.status(503).type('html').send(page);
  });
  app.get('/api/projects', async (req, res) => {
    const projects = await repository.listProjects(true);
    res.json({ projects: projects.map(({ id, title, description, category, technologies, imageUrl, liveUrl, codeUrl, featured, order }) => ({ id, title, description, category, technologies, imageUrl, liveUrl, codeUrl, featured, order })) });
  });
  app.post('/api/messages', contactLimiter, async (req, res) => {
    const { website, ...data } = parse(messageSchema, req.body);
    if (!website) await repository.createMessage(data);
    res.status(201).json({ ok: true, message: 'Your message has been received. Thank you for reaching out.' });
  });
  app.get(['/', '/index.html'], (req, res) => res.sendFile(join(publicDir, 'index.html')));
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint not found.' });
    res.status(404).sendFile(join(privateDir, '404.html'));
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && 'body' in error ? 400 : error.status || 500;
    if (status >= 500) logger.error('Request failed', { path: req.path, code: error.code || error.name });
    const message = status >= 500 ? 'The service is temporarily unavailable. Please try again shortly.' : status === 413 ? 'Your request is too large.' : status === 400 && error instanceof SyntaxError ? 'Invalid JSON.' : error.message;
    if (req.path.startsWith('/api/') || req.path === '/healthz') return res.status(status).json({ error: message });
    res.status(status).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dark Adam | Temporarily unavailable</title><link rel="stylesheet" href="/assets/system.css"><main class="status-card"><p class="eyebrow">DARK ADAM // CONNECTION INTERRUPTED</p><h1>Temporarily unavailable</h1><p>Please try again in a moment.</p><a class="button" href="/">Try again</a></main></html>');
  });
  return app;
}
