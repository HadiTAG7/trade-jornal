import { Preferences } from '@capacitor/preferences';
import { Trade } from '@/types/trade';
import { calculateDailyStats } from '@/lib/calculations';
import { closedDayKey, closedTrades } from '@/lib/tradeStatus';

// Shared-storage bridge for the Android home-screen calendar widget.
// Capacitor Preferences persists to SharedPreferences ("CapacitorStorage"),
// which the native widget reads to render the current month's P&L grid.

export const WIDGET_DATA_KEY = 'widget_calendar_data';

/**
 * How much history the cache keeps. The widget can navigate months, so it needs
 * more than the current month — the old 120-day window meant scrolling the
 * widget back four months showed empty cells for days that did have trades.
 */
const MONTHS_BACK = 60;
const MONTHS_FORWARD = 12;

interface WidgetCache {
  updated_at: string;
  days: Record<string, number>;
}

function windowBounds(): { from: string; to: string } {
  const from = new Date();
  from.setMonth(from.getMonth() - MONTHS_BACK);
  const to = new Date();
  to.setMonth(to.getMonth() + MONTHS_FORWARD);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function readCache(): Promise<Record<string, number>> {
  try {
    const { value } = await Preferences.get({ key: WIDGET_DATA_KEY });
    if (!value) return {};
    const parsed = JSON.parse(value) as WidgetCache;
    return parsed && typeof parsed.days === 'object' && parsed.days ? parsed.days : {};
  } catch {
    return {};
  }
}

/**
 * Writes the day → net P&L map the widget renders from.
 *
 * Merges rather than replaces. The calendar page only loads the year it is
 * showing, so the previous version — which replaced the whole cache with
 * whatever the caller happened to be holding — emptied the widget the moment you
 * opened the calendar on a past year: none of those days fell inside its 120-day
 * window, so it wrote an empty map over good data.
 *
 * The incoming trades are still authoritative for the range they cover, so days
 * inside that range are cleared before the new values go in. Without that a
 * deleted trade would leave its P&L on the widget forever.
 */
export async function syncWidgetData(trades: Trade[]): Promise<void> {
  try {
    const { from, to } = windowBounds();
    const days = await readCache();

    // The span this call actually knows about.
    const covered = closedTrades(trades)
      .map((t) => closedDayKey(t))
      .filter((d): d is string => d !== null);
    if (covered.length > 0) {
      const first = covered.reduce((a, b) => (a < b ? a : b));
      const last = covered.reduce((a, b) => (a > b ? a : b));
      for (const key of Object.keys(days)) {
        if (key >= first && key <= last) delete days[key];
      }
    }

    for (const stat of calculateDailyStats(trades)) {
      days[stat.date] = Math.round(stat.netPnL);
    }

    // Drop anything the widget can no longer navigate to, so the cache can't
    // grow without bound.
    for (const key of Object.keys(days)) {
      if (key < from || key > to) delete days[key];
    }

    await Preferences.set({
      key: WIDGET_DATA_KEY,
      value: JSON.stringify({ updated_at: new Date().toISOString(), days } satisfies WidgetCache),
    });
  } catch (error) {
    // Widget data is best-effort; never break the app for it.
    console.warn('widget data sync failed:', error);
  }
}

/**
 * Stores the credentials the background widget refresh needs.
 *
 * The native worker runs when the app isn't, so it can't ask the Firebase SDK
 * for a token. It exchanges this refresh token for a short-lived ID token the
 * same way the SDK does. The token already lives in this app's sandbox — the web
 * SDK persists it in the WebView's IndexedDB — so copying it into the app's own
 * SharedPreferences doesn't widen who can reach it.
 */
export async function storeWidgetCredentials(refreshToken: string, uid: string): Promise<void> {
  try {
    await Preferences.set({ key: 'widget_refresh_token', value: refreshToken });
    await Preferences.set({ key: 'widget_uid', value: uid });
    // Passed through storage rather than baked into the APK at build time, so the
    // native side needs no gradle config and picks up a changed deployment on the
    // next sign-in. Both values are public by design: the Firebase web API key is
    // meant to ship in clients, and the API base is just the site's own origin.
    await Preferences.set({ key: 'widget_api_base', value: apiBase() });
    await Preferences.set({
      key: 'widget_api_key',
      value: String(import.meta.env.VITE_FIREBASE_API_KEY || ''),
    });
  } catch (error) {
    console.warn('could not store widget credentials:', error);
  }
}

/** Where the serverless functions live; see `syncTrades.ts` for the same choice. */
function apiBase(): string {
  const configured = import.meta.env.VITE_SYNC_API_BASE;
  if (configured) return String(configured);
  if (typeof window !== 'undefined' && /^https?:\/\/[^/]*vercel\.app/.test(window.location.origin)) {
    return window.location.origin;
  }
  return 'https://trade-jornal-swart.vercel.app';
}

export async function clearWidgetCredentials(): Promise<void> {
  try {
    await Preferences.remove({ key: 'widget_refresh_token' });
    await Preferences.remove({ key: 'widget_uid' });
  } catch {
    // Nothing to do; a stale token simply fails to exchange.
  }
}
