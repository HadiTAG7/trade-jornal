# TradeLog

A trading journal app to track, analyze and improve your trades.

## Tech stack

- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS
- Supabase (auth + database)
- TanStack Query, React Router, Recharts

## Local development

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

The app runs at http://localhost:8080.

### Environment variables

Copy `.env` (or create it) with your Supabase project values:

```sh
VITE_SUPABASE_URL="https://<project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon-public-key>"
VITE_SUPABASE_PROJECT_ID="<project-id>"
```

These are Vite build-time variables (inlined into the client bundle). The
publishable/anon key is safe to expose in the browser.

## Deploying to Vercel

1. Import this GitHub repository at https://vercel.com/new.
2. Vercel auto-detects Vite. Build command: `npm run build`, output directory: `dist` (already configured in `vercel.json`).
3. Add the three `VITE_SUPABASE_*` environment variables under Project → Settings → Environment Variables.
4. Deploy. Client-side routing is handled by the rewrite rule in `vercel.json`.

### Supabase auth redirect

After the first deploy, add your Vercel domain (e.g. `https://<project>.vercel.app`)
to Supabase → Authentication → URL Configuration (Site URL / Redirect URLs) so
email confirmation links point to the deployed app.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server on port 8080 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

## Database

Supabase migrations live in `supabase/migrations/`. Apply them with the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase db push
```
