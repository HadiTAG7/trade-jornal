import { auth } from '@/integrations/firebase/client';

export interface SyncResult {
  ok: boolean;
  rows?: number;
  written?: number;
  error?: string;
}

// The API lives on Vercel. In the browser (served from Vercel) a relative
// path works, but inside the Android app the WebView is served from
// localhost, so we must call the deployed origin absolutely.
const API_BASE =
  import.meta.env.VITE_SYNC_API_BASE ||
  (typeof window !== 'undefined' && /^https?:\/\/[^/]*vercel\.app/.test(window.location.origin)
    ? window.location.origin
    : 'https://trade-jornal-swart.vercel.app');

// Triggers the server-side broker sync (api/sync-trades) as the signed-in
// user. The function verifies the Firebase ID token server-side, so no
// secret is shipped in the client bundle.
export async function syncTradesNow(): Promise<SyncResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const idToken = await user.getIdToken();
  const res = await fetch(`${API_BASE}/api/sync-trades`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as SyncResult;
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `Sync failed (${res.status})` };
  }
  return data;
}
