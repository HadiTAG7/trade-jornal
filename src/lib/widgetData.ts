import { Preferences } from '@capacitor/preferences';
import { Trade } from '@/types/trade';
import { calculateDailyStats } from '@/lib/calculations';

// Shared-storage bridge for the Android home-screen calendar widget.
// Capacitor Preferences persists to SharedPreferences ("CapacitorStorage"),
// which the native widget reads to render the current month's P&L grid.

export const WIDGET_DATA_KEY = 'widget_calendar_data';
const DAYS_KEPT = 120; // enough to cover the current + previous month

export async function syncWidgetData(trades: Trade[]): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAYS_KEPT);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const days: Record<string, number> = {};
    for (const stat of calculateDailyStats(trades)) {
      if (stat.date >= cutoffStr) {
        days[stat.date] = Math.round(stat.netPnL);
      }
    }

    await Preferences.set({
      key: WIDGET_DATA_KEY,
      value: JSON.stringify({ updated_at: new Date().toISOString(), days }),
    });
  } catch (error) {
    // Widget data is best-effort; never break the app for it.
    console.warn('widget data sync failed:', error);
  }
}
