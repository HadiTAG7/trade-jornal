import { auth } from '@/integrations/firebase/client';

export interface SyncResult {
  ok: boolean;
  rows?: number;
  written?: number;
  error?: string;
}

// Triggers the server-side broker sync (api/sync-trades) as the signed-in
// user. The function verifies the Firebase ID token server-side, so no
// secret is shipped in the client bundle.
export async function syncTradesNow(): Promise<SyncResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const idToken = await user.getIdToken();
  const res = await fetch('/api/sync-trades', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as SyncResult;
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `Sync failed (${res.status})` };
  }
  return data;
}
