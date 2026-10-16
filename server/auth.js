export class FirebaseAuthentication {
  constructor(auth, webApiKey, fetcher = fetch) {
    this.auth = auth;
    this.webApiKey = webApiKey;
    this.fetcher = fetcher;
  }

  async login(email, password, duration) {
    const response = await this.fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(this.webApiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      const error = new Error('Unable to sign in. Check your credentials and access.');
      error.status = 401;
      throw error;
    }
    const { idToken } = await response.json();
    const decoded = await this.auth.verifyIdToken(idToken, true);
    const user = await this.auth.getUser(decoded.uid);
    if (decoded.admin !== true || user.customClaims?.admin !== true || user.disabled || Date.now() / 1000 - decoded.auth_time > 300) {
      const error = new Error('Unable to sign in. Check your credentials and access.');
      error.status = 403;
      throw error;
    }
    return this.auth.createSessionCookie(idToken, { expiresIn: duration });
  }

  async verify(cookie) {
    if (!cookie) return null;
    try {
      const decoded = await this.auth.verifySessionCookie(cookie, true);
      if (decoded.admin !== true) return null;
      const user = await this.auth.getUser(decoded.uid);
      if (user.disabled || user.customClaims?.admin !== true) return null;
      return { uid: user.uid, email: user.email };
    } catch { return null; }
  }

  async logout(uid) { await this.auth.revokeRefreshTokens(uid); }
}
