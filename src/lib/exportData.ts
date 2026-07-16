import { supabase } from '@/integrations/supabase/client';

// Every table in the database, with a stable column to paginate on.
// RLS scopes all reads to the signed-in user, so a plain select returns
// only the current user's rows.
const TABLES: { name: string; orderBy: string }[] = [
  { name: 'profiles', orderBy: 'id' },
  { name: 'accounts', orderBy: 'id' },
  { name: 'strategies', orderBy: 'id' },
  { name: 'tags', orderBy: 'id' },
  { name: 'mistakes', orderBy: 'id' },
  { name: 'trades', orderBy: 'id' },
  { name: 'trade_targets', orderBy: 'id' },
  { name: 'trade_tags', orderBy: 'trade_id' },
  { name: 'trade_mistakes', orderBy: 'trade_id' },
  { name: 'attachments', orderBy: 'id' },
  { name: 'checklist_templates', orderBy: 'id' },
  { name: 'checklist_items', orderBy: 'id' },
  { name: 'trade_checklist_responses', orderBy: 'id' },
  { name: 'journal_entries', orderBy: 'id' },
  { name: 'import_mapping_templates', orderBy: 'id' },
  { name: 'imports', orderBy: 'id' },
  { name: 'reports', orderBy: 'id' },
  { name: 'filter_presets', orderBy: 'id' },
];

const PAGE_SIZE = 1000;

export interface DataExport {
  format: 'tradelog-export';
  version: 1;
  exported_at: string;
  user_id: string;
  user_email: string | null;
  source: { provider: 'supabase'; project_id: string | undefined };
  row_counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

async function fetchAllRows(table: string, orderBy: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table as never)
      .select('*')
      .order(orderBy as never, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to export "${table}": ${error.message}`);
    rows.push(...((data as unknown[]) ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function exportAllData(
  userId: string,
  userEmail: string | null,
  onProgress?: (table: string, done: number, total: number) => void,
): Promise<DataExport> {
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};

  for (let i = 0; i < TABLES.length; i++) {
    const { name, orderBy } = TABLES[i];
    onProgress?.(name, i, TABLES.length);
    const rows = await fetchAllRows(name, orderBy);
    tables[name] = rows;
    rowCounts[name] = rows.length;
  }
  onProgress?.('done', TABLES.length, TABLES.length);

  return {
    format: 'tradelog-export',
    version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    user_email: userEmail,
    source: {
      provider: 'supabase',
      project_id: import.meta.env.VITE_SUPABASE_PROJECT_ID,
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
