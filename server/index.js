import { loadConfig } from './config.js';
import { connectFirebase } from './firebase.js';
import { FirestoreRepository } from './repository.js';
import { FirebaseAuthentication } from './auth.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  const { db, auth } = connectFirebase(config.projectId);
  const app = createApp({ config, repository: new FirestoreRepository(db), authentication: new FirebaseAuthentication(auth, config.webApiKey) });
  const server = app.listen(config.port, () => console.log(`Dark Adam is listening on port ${config.port}.`));
  server.requestTimeout = 20000;
  server.headersTimeout = 15000;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
}
