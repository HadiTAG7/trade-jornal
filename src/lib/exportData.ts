import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/integrations/firebase/client';
import { fetchAll } from '@/lib/db';

// Every user collection in Firestore. Reads are structurally scoped to the
// signed-in user because data lives under users/{uid}/.
const COLLECTIONS = [
  'accounts',
  'strategies',
  'tags',
  'mistakes',
  'trades',
  'journal_entries',
  'imports',
] as const;

export interface DataExport {
  format: 'tradelog-export';
  version: 2;
  exported_at: string;
  user_id: string;
  user_email: string | null;
  source: { provider: 'firebase'; project_id: string | undefined };
  row_counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

export async function exportAllData(
  userId: string,
  userEmail: string | null,
  onProgress?: (table: string, done: number, total: number) => void,
): Promise<DataExport> {
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  const total = COLLECTIONS.length + 1;

  // Profile document
  onProgress?.('profile', 0, total);
  const profileSnap = await getDoc(doc(db, 'users', userId));
  tables['profiles'] = profileSnap.exists() ? [{ id: profileSnap.id, ...profileSnap.data() }] : [];
  rowCounts['profiles'] = tables['profiles'].length;

  for (let i = 0; i < COLLECTIONS.length; i++) {
    const name = COLLECTIONS[i];
    onProgress?.(name, i + 1, total);
    const rows = await fetchAll<unknown>(userId, name);
    tables[name] = rows;
    rowCounts[name] = rows.length;
  }
  onProgress?.('done', total, total);

  return {
    format: 'tradelog-export',
    version: 2,
    exported_at: new Date().toISOString(),
    user_id: userId,
    user_email: userEmail,
    source: {
      provider: 'firebase',
      project_id: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    },
    row_counts: rowCounts,
    tables,
  };
}

export function downloadAsJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
