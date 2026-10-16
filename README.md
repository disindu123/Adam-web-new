# DARK ADAM

A complete Express portfolio based on the supplied Dark Adam HTML, with Cloud Firestore, Firebase Authentication, a private management console and a maintenance switch.

The original black/neon-green design, matrix rain, custom cursor, skills, experience timeline, project filters and floating terminal are retained. The portfolio opens directly: the source file's hardcoded `Adam`/`Adam` visitor gate and simulated message sending have been replaced with real server behavior.

## Features

- Public portfolio with projects loaded from Firestore. Only published projects are returned by the public API.
- Contact form that stores messages in a private inbox. Success appears only after the database write succeeds.
- Management console: create/edit/delete projects, publish or keep drafts, choose category, add technology tags, link a project image, add live/source URLs, feature projects and set display order.
- Inbox: open messages, automatically mark them read, mark replied, archive, delete, search/filter loaded messages and load more messages. Replies open your email application; the site does not send email automatically.
- Maintenance: enable/disable from the console, customize the heading/message and display an optional expected return time. New public requests receive HTTP 503 with `Retry-After`; already-open tabs check for changes every 30 seconds. The console and login remain available.
- Firebase admin custom claims, verified HttpOnly session cookies, CSRF/origin checks, input validation, content security policy and request rate limits.

## URLs

| Route | Purpose |
| --- | --- |
| `/` or `/index.html` | Public portfolio, or maintenance page when enabled |
| `/login/index.html` | Private sign-in page |
| `/admin/` | Protected management console |
| `/?preview=1` | Portfolio preview during maintenance, for a signed-in admin |
| `/healthz` | Server/database readiness probe |

With the Express app deployed on **adamx.com**, sign-in is at **https://adamx.com/login/index.html**. There is no admin link or admin explanation on the public portfolio. Knowing a URL does not grant access: the server checks authorization for the page and every management API request.

## 1. Firebase setup

1. Create/select a project in the [Firebase console](https://console.firebase.google.com/).
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create your account under **Authentication → Users → Add user**. There is no public registration page and no default admin password.
4. Create a **Cloud Firestore** database in **Native mode**. This app uses Firestore, rather than Realtime Database.
5. Under **Project settings → General**, copy your project ID and Web API key. If necessary, register a web app to obtain the key. Do not apply browser-referrer restrictions to this key: the Express server calls the Auth API. Use API restrictions for the Firebase Authentication/Identity Toolkit API if restricting it.
6. Under **Project settings → Service accounts**, generate a private key for the server, or use Application Default Credentials on Google Cloud. Keep the service account private and outside `public/`.
7. Publish `firestore.rules` through the console. For the rules and optional index exemptions together, use the Firebase CLI from this directory:

   ```sh
   firebase deploy --only firestore --project YOUR_PROJECT_ID
   ```

The rules deny all browser access. Express accesses Firestore with its Admin SDK credentials; admin authorization is enforced by the application. The server service account needs Firestore read/write access and Firebase Authentication user/session management permissions. Firebase's generated Admin SDK service account has the needed permissions by default; organizations with custom IAM policies may need to grant them explicitly.

## 2. Run locally

Use **Node.js 22 or 24** and npm. There is no frontend build step.

```sh
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Edit `.env` with the generated `COOKIE_SECRET`, your Firebase project ID and Web API key. Choose one server-credential method:

- `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/private-service-account.json`; or
- `FIREBASE_SERVICE_ACCOUNT_JSON` containing the service-account JSON as a single line. In a local `.env`, enclose the complete single-line JSON in single quotes so the key's literal `\n` sequences survive parsing. In a hosting dashboard, paste the raw JSON value without surrounding shell quotes.

Leave `SITE_URL=http://localhost:3000`, `NODE_ENV=development` and `TRUST_PROXY=0` for local use. Set the same origin you use in your browser, including port.

Grant your existing Firebase user admin access and load the original project's cards:

```sh
npm run admin:grant -- your-admin-email@example.com
npm run seed
npm run dev
```

Open `http://localhost:3000`, then sign in separately at `http://localhost:3000/login/index.html` with your Firebase account. The six seed cards, profile image, biography, skills, stats and experience text come from the supplied design. Replace illustrative content with your real work. Seed cards have no fabricated live/source links: add the actual URLs in the console. `seed` creates only missing documents and preserves edited projects and maintenance settings.

No configuration is embedded in frontend code and no Firebase service-account secret belongs in Git. The server intentionally refuses to start with placeholder configuration.

To revoke admin access:

```sh
npm run admin:revoke -- your-admin-email@example.com
```

The script removes the claim and revokes sessions. Each privileged request also checks the account's current admin claim and disabled status. Sessions last eight hours; signing out revokes that user's Firebase sessions and clears the browser cookie.

## 3. Deploy on adamx.com

Use a Node-capable host, such as Render, Cloud Run or your own VPS. GitHub Pages and static-only hosting cannot run this Express backend.

### Render

1. Create a Render Web Service connected to this repository, or use the included `render.yaml` Blueprint. The supplied Blueprint selects a paid Starter instance; review the host's plan choice before creating it.
2. Use `npm ci --omit=dev` as the build command and `npm start` as the start command. `/healthz` checks Firestore connectivity.
3. Set these environment variables in the hosting dashboard:

   | Variable | Production value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `SITE_URL` | `https://adamx.com` |
   | `COOKIE_SECRET` | A unique random secret, at least 32 characters |
   | `FIREBASE_PROJECT_ID` | Your Firebase project ID |
   | `FIREBASE_WEB_API_KEY` | Your Firebase Web API key |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | The private service-account JSON, as one line |
   | `TRUST_PROXY` | `1` for Render's single trusted proxy |

   Render provides `PORT` automatically. Before connecting your domain, set `SITE_URL` to the service's actual HTTPS URL to test it; change it to `https://adamx.com` when the domain is active. Using the wrong origin causes write requests to fail origin verification.

4. Add `adamx.com` as a custom domain in the host. Point its DNS to the records the host supplies and wait for HTTPS activation. If using `www`, redirect it to the chosen canonical domain so cookies and origin checks stay consistent.
5. Run the grant and seed commands once from a trusted local machine with the same Firebase project credentials if you have not already done so. They are not run automatically on every deployment.
6. Verify the public page, send a test contact message and read it in the console. Add/publish a project, enable maintenance in a separate signed-out window, verify that login remains reachable, then disable maintenance.

`adamx.com` is the requested domain. The repository does not register the domain, change DNS or create a Firebase project for you. Publishing these source files alone does not make the domain live.

### Docker / VPS

```sh
docker build -t dark-adam .
docker run --env-file /secure/path/adam-production.env -p 3000:3000 dark-adam
```

The container runs as the unprivileged `node` user. Put an HTTPS reverse proxy in front of it, set the matching `SITE_URL`, and configure `TRUST_PROXY` to the actual number of trusted hops. Keep the application port private behind the proxy. To bind a different local port, also set `PORT` and update the port mapping.

## Maintenance behavior

In the console, open **Maintenance**, edit the visitor text, enable the switch and select **Save settings**. The switch changes availability only after a successful save. To restore the portfolio, sign in at `/login/index.html`, turn the switch off and save again. The return time is informational and does not automatically disable maintenance.

The setting is read from Firestore on each public request, so it works across restarts and multiple app instances. Static styles/images, the health probe, sign-in and authorized management routes remain available. The anonymous projects API and contact submission are also blocked during maintenance. The signed-in **View site** link uses an authenticated preview; its query string cannot bypass maintenance for visitors.

## Data model

| Collection/document | Data |
| --- | --- |
| `projects/{id}` | Title, description, category, technologies, image/live/code URLs, published/featured flags, order, timestamps and actor IDs |
| `messages/{id}` | Name, email, subject, message, status and timestamps |
| `settings/site` | Maintenance enabled flag, heading, visitor message, expected return and update metadata |
| Firebase Auth user | Email/password identity and the server-managed `admin: true` claim |

Projects use HTTPS image URLs, so no Storage bucket is required. Supported images are PNG/JPEG/WebP/GIF/AVIF links, plus the original Picsum and Unsplash image endpoints. Missing/failed images use the included local Dark Adam cover. The source's four missing MP3 files are not requested, so there are no broken audio dependencies. The contact email and other profile content remain from the supplied design; the website address and GitHub link use `adamx.com` and `disindu123`.

Message listing is paginated in groups of 50. Search/status filters operate on the messages currently loaded. There is no automatic message deletion or automatic email response. Export/retention decisions remain with the owner.

Contact submissions are limited to five per IP per hour; failed sign-ins to eight per IP per 15 minutes. The included rate-limit store is per server process. For multi-instance deployments requiring a global limit, configure a shared rate-limit store. Firestore data and maintenance state are already shared.

## Validation

```sh
npm run check
npm test
npm audit --omit=dev
```

The checks verify JavaScript syntax, duplicate HTML IDs, local asset links and separation of private access details from the public page. Automated tests cover authorization, session-cookie flags/logout, current Firebase admin claims, CSRF/origin protection, contact persistence/failure handling, rate limiting, project publication, inbox actions and maintenance recovery/preview.

Tests use injected repository/Auth doubles and a simulated Firebase Auth response. They do not use a production Firebase project or real credentials. Live Firebase connectivity, a browser visual check and the deployed domain must be verified after configuring your deployment. No browser visual check was available in the implementation environment.

## Project layout

```text
server/             Express routes, Firebase connection, Auth and Firestore adapter
public/index.html   Supplied portfolio adapted to real API data
public/assets/      Original styling, frontend scripts, private console styling
private/            Login, protected console, maintenance and 404 templates
scripts/            Admin grants/revocations, safe seed and source checks
test/               Server behavior and Auth tests
firestore.rules     Deny direct browser database access
render.yaml         Node service deployment configuration
Dockerfile          Production container
```

The application serves only the intended public files. It never mounts the repository root as a static directory.
