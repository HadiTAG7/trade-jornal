import { toast } from '@/hooks/use-toast';

/**
 * Loads a list and says so when it fails, instead of quietly showing nothing.
 *
 * Every call site used `.catch(() => [])`, so a permissions error or a dropped
 * connection looked exactly like "you have no strategies yet": the filter
 * dropdowns came up empty with nothing to explain why, and a trade could be
 * saved against a strategy list that had silently failed to load.
 *
 * The empty array is still returned so the page renders — the difference is that
 * the failure is now visible.
 */
export async function loadList<T>(what: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (error) {
    console.error(`failed to load ${what}:`, error);
    toast({
      title: `Could not load your ${what}`,
      description: error instanceof Error ? error.message : 'Please try again.',
      variant: 'destructive',
    });
    return [];
  }
}
