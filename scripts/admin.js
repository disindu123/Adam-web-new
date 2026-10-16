import { connectFirebase } from '../server/firebase.js';

const [action, email] = process.argv.slice(2);
if (!['grant', 'revoke'].includes(action) || !email || !email.includes('@')) {
  console.error('Usage: npm run admin:grant -- your@email.com (or admin:revoke)');
  process.exitCode = 1;
} else {
  try {
    const { auth } = connectFirebase();
    const user = await auth.getUserByEmail(email);
    const claims = { ...user.customClaims };
    if (action === 'grant') claims.admin = true;
    else delete claims.admin;
    await auth.setCustomUserClaims(user.uid, claims);
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Admin access ${action === 'grant' ? 'granted' : 'revoked'} for ${email}. Sign in again for the change to take effect.`);
  } catch (error) {
    console.error(`Admin access change failed (${error.code || error.name}). Check the user and Firebase credentials.`);
    process.exitCode = 1;
  }
}
