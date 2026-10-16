import test from 'node:test';
import assert from 'node:assert/strict';
import { FirebaseAuthentication } from '../server/auth.js';
import { loadConfig } from '../server/config.js';

function fixture() {
  let decoded = { uid: 'owner', admin: true, auth_time: Date.now() / 1000 }, user = { uid: 'owner', email: 'owner@example.com', customClaims: { admin: true }, disabled: false };
  const calls = [];
  const auth = {
    verifyIdToken: async (token, revoked) => { calls.push(['verify-id', token, revoked]); return decoded; },
    getUser: async () => user,
    createSessionCookie: async (token, options) => { calls.push(['create-session', token, options]); return 'signed-session'; },
    verifySessionCookie: async (token, revoked) => { calls.push(['verify-session', token, revoked]); return decoded; },
    revokeRefreshTokens: async uid => { calls.push(['revoke', uid]); }
  };
  const fetcher = async (url, options) => { calls.push(['fetch', url, options]); return { ok: true, json: async () => ({ idToken: 'verified-id-token' }) }; };
  return { service: new FirebaseAuthentication(auth, 'web-key', fetcher), auth, calls, setDecoded: value => { decoded = value; }, setUser: value => { user = value; } };
}

test('password sign-in is exchanged for a verified, privileged Firebase session', async () => {
  const { service, calls } = fixture();
  assert.equal(await service.login('owner@example.com', 'private-password', 28800000), 'signed-session');
  assert.equal(calls[0][0], 'fetch'); assert.match(calls[0][1], /accounts:signInWithPassword/);
  assert.equal(JSON.parse(calls[0][2].body).password, 'private-password');
  assert.deepEqual(calls[1], ['verify-id', 'verified-id-token', true]);
  assert.deepEqual(calls[2], ['create-session', 'verified-id-token', { expiresIn: 28800000 }]);
});

test('sign-in rejects unprivileged claims, disabled users and stale authentication', async () => {
  const f = fixture();
  f.setDecoded({ uid: 'owner', admin: false, auth_time: Date.now() / 1000 }); await assert.rejects(f.service.login('x', 'y', 28800000), { status: 403 });
  f.setDecoded({ uid: 'owner', admin: true, auth_time: Date.now() / 1000 - 301 }); await assert.rejects(f.service.login('x', 'y', 28800000), { status: 403 });
  f.setDecoded({ uid: 'owner', admin: true, auth_time: Date.now() / 1000 }); f.setUser({ uid: 'owner', customClaims: { admin: true }, disabled: true }); await assert.rejects(f.service.login('x', 'y', 28800000), { status: 403 });
  f.setUser({ uid: 'owner', customClaims: { admin: false }, disabled: false }); await assert.rejects(f.service.login('x', 'y', 28800000), { status: 403 });
});

test('Firebase credential failures return a generic sign-in failure', async () => {
  const f = fixture(); f.service.fetcher = async () => ({ ok: false });
  await assert.rejects(f.service.login('x', 'y', 28800000), { status: 401 });
});

test('session authorization rechecks current admin access and handles revoked sessions', async () => {
  const f = fixture(); assert.equal(await f.service.verify(undefined), null);
  assert.deepEqual(await f.service.verify('cookie'), { uid: 'owner', email: 'owner@example.com' });
  assert.deepEqual(f.calls[0], ['verify-session', 'cookie', true]);
  f.setUser({ uid: 'owner', customClaims: { admin: false }, disabled: false }); assert.equal(await f.service.verify('cookie'), null);
  f.auth.verifySessionCookie = async () => { throw new Error('auth/session-cookie-revoked'); }; assert.equal(await f.service.verify('cookie'), null);
  await f.service.logout('owner'); assert.deepEqual(f.calls.at(-1), ['revoke', 'owner']);
});

test('production configuration requires HTTPS and refuses placeholder credentials', () => {
  const env = { NODE_ENV: 'production', COOKIE_SECRET: 's'.repeat(48), SITE_URL: 'https://adamx.com', FIREBASE_PROJECT_ID: 'real-project', FIREBASE_WEB_API_KEY: 'real-key' };
  assert.equal(loadConfig(env).sessionCookie, '__Host-adam-session');
  assert.throws(() => loadConfig({ ...env, SITE_URL: 'http://adamx.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, COOKIE_SECRET: 'replace-with-a-random-secret-at-least-32-characters-long' }), /COOKIE_SECRET/);
  assert.throws(() => loadConfig({ ...env, FIREBASE_PROJECT_ID: 'your-project-id' }), /FIREBASE_PROJECT_ID/);
  assert.throws(() => loadConfig({ ...env, TRUST_PROXY: '-1' }), /TRUST_PROXY/);
});
