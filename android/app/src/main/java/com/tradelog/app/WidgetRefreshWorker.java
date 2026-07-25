package com.tradelog.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;

/**
 * Keeps the home-screen widget current without the app being opened.
 *
 * The widget already re-rendered every 30 minutes, but only ever from data the
 * web app had written, so a day of trading stayed invisible on the home screen
 * until TradeLog was launched. This fetches the numbers itself.
 *
 * It also raises a notification when the last broker sync failed — the same
 * information the Settings card shows, but without having to go and look.
 *
 * Deliberately no Firebase Cloud Messaging: that needs an Android app registered
 * in the Firebase console and a google-services.json in the repo, and WorkManager
 * covers the same need with nothing to set up. Samsung defers background work
 * aggressively, so treat the cadence as "a few times a day", not exact.
 */
public class WidgetRefreshWorker extends Worker {

    private static final String TAG = "WidgetRefresh";
    private static final String WORK_NAME = "tradelog-widget-refresh";
    private static final String CAPACITOR_PREFS = "CapacitorStorage";
    private static final String WIDGET_KEY = "widget_calendar_data";
    private static final String CHANNEL_ID = "sync_status";
    private static final int SYNC_FAILURE_NOTIFICATION = 4101;

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Registers the periodic job. Safe to call on every app start. */
    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        // 3 hours: often enough that the widget is never far behind the twice-daily
        // sync, rare enough not to matter for battery.
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                WidgetRefreshWorker.class, 3, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                // KEEP, so re-opening the app doesn't reset the schedule and
                // postpone the next run indefinitely.
                ExistingPeriodicWorkPolicy.KEEP,
                request);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE);

        String refreshToken = prefs.getString("widget_refresh_token", null);
        String apiBase = prefs.getString("widget_api_base", null);
        String apiKey = prefs.getString("widget_api_key", null);
        if (isBlank(refreshToken) || isBlank(apiBase) || isBlank(apiKey)) {
            // Nobody has signed in on this device yet; nothing to do, and no point
            // retrying until they have.
            return Result.success();
        }

        try {
            String idToken = exchangeRefreshToken(apiKey, refreshToken);
            if (idToken == null) {
                // A revoked or rotated token is permanent until the next sign-in.
                Log.w(TAG, "could not exchange refresh token");
                return Result.success();
            }

            JSONObject payload = fetchWidgetData(apiBase, idToken);
            if (payload == null) return Result.retry();

            JSONObject days = payload.optJSONObject("days");
            if (days != null) {
                mergeDays(prefs, days);
                CalendarWidgetProvider.refreshAll(getApplicationContext());
            }

            notifyIfSyncFailing(payload.optJSONObject("sync"));
            return Result.success();
        } catch (Exception e) {
            Log.w(TAG, "widget refresh failed: " + e.getMessage());
            return Result.retry();
        }
    }

    /**
     * Merges the fetched days into the cache the widget reads, leaving days
     * outside the fetched window alone — the same reason the web side merges
     * rather than replaces.
     */
    private void mergeDays(SharedPreferences prefs, JSONObject fetched) throws Exception {
        JSONObject days = new JSONObject();
        String existing = prefs.getString(WIDGET_KEY, null);
        if (existing != null) {
            // A cache we can't read is discarded rather than fatal. Letting the
            // parse throw here would fail the whole run and be retried forever,
            // so a corrupt cache would permanently block the fresh data.
            try {
                JSONObject parsed = new JSONObject(existing).optJSONObject("days");
                if (parsed != null) {
                    Iterator<String> keys = parsed.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        days.put(k, parsed.opt(k));
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "unreadable widget cache, rebuilding it");
            }
        }

        // Clear the fetched range first so a deleted trade's P&L doesn't linger.
        String from = null;
        String to = null;
        Iterator<String> incoming = fetched.keys();
        while (incoming.hasNext()) {
            String k = incoming.next();
            if (from == null || k.compareTo(from) < 0) from = k;
            if (to == null || k.compareTo(to) > 0) to = k;
        }
        if (from != null) {
            Iterator<String> cached = days.keys();
            while (cached.hasNext()) {
                String k = cached.next();
                if (k.compareTo(from) >= 0 && k.compareTo(to) <= 0) cached.remove();
            }
        }

        Iterator<String> add = fetched.keys();
        while (add.hasNext()) {
            String k = add.next();
            days.put(k, fetched.opt(k));
        }

        JSONObject out = new JSONObject();
        out.put("updated_at", payloadTimestamp());
        out.put("days", days);
        prefs.edit().putString(WIDGET_KEY, out.toString()).apply();
    }

    private String payloadTimestamp() {
        return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
                .format(new java.util.Date());
    }

    /** Same call the Firebase SDK makes; returns null when the token is no good. */
    private String exchangeRefreshToken(String apiKey, String refreshToken) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(
                "https://securetoken.googleapis.com/v1/token?key=" + apiKey).openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            String body = "grant_type=refresh_token&refresh_token="
                    + java.net.URLEncoder.encode(refreshToken, "UTF-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            if (conn.getResponseCode() != 200) return null;
            JSONObject json = new JSONObject(readAll(conn));
            String idToken = json.optString("id_token", null);
            return isBlank(idToken) ? null : idToken;
        } finally {
            conn.disconnect();
        }
    }

    private JSONObject fetchWidgetData(String apiBase, String idToken) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(apiBase + "/api/widget-data").openConnection();
        try {
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("Authorization", "Bearer " + idToken);
            if (conn.getResponseCode() != 200) {
                Log.w(TAG, "widget-data returned " + conn.getResponseCode());
                return null;
            }
            return new JSONObject(readAll(conn));
        } finally {
            conn.disconnect();
        }
    }

    private void notifyIfSyncFailing(JSONObject sync) {
        if (sync == null || sync.isNull("ok") || sync.optBoolean("ok", true)) {
            // Healthy again: clear any warning still on screen.
            NotificationManagerCompat.from(getApplicationContext()).cancel(SYNC_FAILURE_NOTIFICATION);
            return;
        }

        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Sync status", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Tells you when the broker sync stops working");
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String error = sync.optString("error", "");
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentTitle("Broker sync is failing")
                .setContentText(error.isEmpty() ? "Your trades may be out of date." : error)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        (error.isEmpty() ? "Your trades may be out of date." : error)
                                + "\nOpen TradeLog → Settings → Data to try again."))
                .setContentIntent(pending)
                .setAutoCancel(true);

        try {
            NotificationManagerCompat.from(context).notify(SYNC_FAILURE_NOTIFICATION, builder.build());
        } catch (SecurityException e) {
            // Notification permission not granted; the Settings card still shows it.
            Log.w(TAG, "notification not permitted");
        }
    }

    private static String readAll(HttpURLConnection conn) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
