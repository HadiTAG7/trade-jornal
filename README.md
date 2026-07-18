# TradeLog

A trading journal app to track, analyze and improve your trades.

## Tech stack

- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS
- Firebase (Authentication + Cloud Firestore)
- TanStack Query, React Router, Recharts

## Local development

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

The app runs at http://localhost:8080.

### Environment variables

Create `.env` with your Firebase web app config (Firebase Console → Project
settings → Your apps → Web app):

```sh
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="<project-id>.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="<project-id>"
VITE_FIREBASE_STORAGE_BUCKET="<project-id>.appspot.com"
VITE_FIREBASE_APP_ID="..."
```

These are Vite build-time variables (inlined into the client bundle). The
Firebase web config is safe to expose in the browser — access control is
enforced by Firestore security rules.

## Firebase setup (one time)

1. Create a project at https://console.firebase.google.com
2. **Authentication** → Get started → enable **Email/Password**.
3. **Firestore Database** → Create database (production mode).
4. **Rules** tab → paste the contents of [`firestore.rules`](./firestore.rules) → Publish.
5. Project settings → Your apps → add a **Web app** → copy the config into `.env`.

### Data model

All user data lives under `users/{uid}`:

```
users/{uid}                     profile document
users/{uid}/trades/{id}         trades (imported docs use stable_hash as id)
users/{uid}/strategies/{id}
users/{uid}/accounts/{id}
users/{uid}/tags/{id}
users/{uid}/mistakes/{id}
users/{uid}/journal_entries/{yyyy-MM-dd}
users/{uid}/imports/{id}
```

## Migrating data from the old Supabase backend

Export your data from the old app (Settings → Data → Export all data), then:

```sh
node scripts/migrate-to-firebase.mjs tradelog-export-YYYY-MM-DD.json you@email.com <password>
```

The script creates the Firebase Auth user if needed and writes everything to
Firestore in batches. It is idempotent — re-running overwrites the same
documents instead of duplicating them.

## Deploying to Vercel

1. Import this GitHub repository at https://vercel.com/new.
2. Vercel auto-detects Vite (`vercel.json` sets build command, output dir and SPA rewrites).
3. Add the five `VITE_FIREBASE_*` environment variables under Project → Settings → Environment Variables.
4. Deploy.
5. Add your Vercel domain to Firebase → Authentication → Settings → **Authorized domains**.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server on port 8080 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

## Daily broker sync

`api/sync-trades.js` runs daily (Vercel Cron, see `vercel.json`) to pull
closed trades from the connected Trading Helper service and write them into
Firestore. Configure these Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `RAILWAY_URL` | Base URL of the Trading Helper service |
| `RAILWAY_PASSWORD` | Login password for that service |
| `SYNC_FIREBASE_EMAIL` / `SYNC_FIREBASE_PASSWORD` | TradeLog account the sync writes as |
| `SYNC_DAYS` | Look-back window in days (default 45) |
| `CRON_SECRET` | Shared secret Vercel attaches to cron requests |

The sync is idempotent — trades are keyed by a stable hash, so re-runs never
create duplicates.
