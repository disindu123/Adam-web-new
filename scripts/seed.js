import { readFile } from 'node:fs/promises';
import { FieldValue } from 'firebase-admin/firestore';
import { connectFirebase } from '../server/firebase.js';
import { defaultSettings, parse, projectSchema } from '../server/validation.js';

try {
  const { db } = connectFirebase();
  const projects = JSON.parse(await readFile(new URL('./sample-projects.json', import.meta.url), 'utf8'));
  let added = 0;
  // A transaction per document makes repeated/concurrent seeding safe and never
  // overwrites changes made in the console, including an active maintenance flag.
  for (const { id, ...project } of projects) {
    const data = parse(projectSchema, project);
    const created = await db.runTransaction(async transaction => {
      const ref = db.doc(`projects/${id}`);
      if (!(await transaction.get(ref)).exists) {
        transaction.create(ref, { ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        return true;
      }
      return false;
    });
    if (created) added++;
  }
  await db.runTransaction(async transaction => {
    const ref = db.doc('settings/site');
    if (!(await transaction.get(ref)).exists) transaction.create(ref, { ...defaultSettings, updatedAt: FieldValue.serverTimestamp() });
  });
  console.log(`Added ${added} original design projects. Existing projects and settings were preserved.`);
} catch (error) {
  console.error(`Seeding failed (${error.code || error.name}). Check your Firestore database, project ID and server credentials.`);
  process.exitCode = 1;
}
