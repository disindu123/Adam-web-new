import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function connectFirebase(projectId = process.env.FIREBASE_PROJECT_ID) {
  let app = getApps()[0];
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let account;
    if (raw) {
      try { account = JSON.parse(raw); }
      catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.'); }
    }
    const credential = account ? cert(account) : applicationDefault();
    app = initializeApp({ projectId, credential });
  }
  return { auth: getAuth(app), db: getFirestore(app) };
}
