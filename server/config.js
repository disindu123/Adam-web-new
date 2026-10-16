export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const siteUrl = new URL(env.SITE_URL || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(siteUrl.protocol)) throw new Error('SITE_URL must be an HTTP(S) URL.');
  if (production && siteUrl.protocol !== 'https:') throw new Error('Production SITE_URL must use HTTPS.');
  if (!env.COOKIE_SECRET || env.COOKIE_SECRET.length < 32 || env.COOKIE_SECRET.startsWith('replace-')) {
    throw new Error('Set COOKIE_SECRET to a random secret with at least 32 characters.');
  }
  if (!env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID === 'your-project-id' || !env.FIREBASE_WEB_API_KEY || env.FIREBASE_WEB_API_KEY === 'your-web-api-key') {
    throw new Error('Set FIREBASE_PROJECT_ID and FIREBASE_WEB_API_KEY in the server environment.');
  }
  const trustProxy = Number(env.TRUST_PROXY || 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5) throw new Error('TRUST_PROXY must be 0–5 trusted proxy hops.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535.');
  return {
    production, port, trustProxy, origin: siteUrl.origin,
    cookieSecret: env.COOKIE_SECRET,
    sessionCookie: production ? '__Host-adam-session' : 'adam-session',
    csrfCookie: production ? '__Host-adam-csrf' : 'adam-csrf',
    sessionDuration: 8 * 60 * 60 * 1000,
    projectId: env.FIREBASE_PROJECT_ID,
    webApiKey: env.FIREBASE_WEB_API_KEY
  };
}
