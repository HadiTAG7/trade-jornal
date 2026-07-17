package com.tradelog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Home-screen widget: renders the current month's daily P&L calendar from
 * data the web app caches in Capacitor's SharedPreferences ("CapacitorStorage",
 * key "widget_calendar_data"). The bitmap is rendered at the widget's real
 * pixel size so it stays crisp, and the design mirrors the in-app calendar.
 */
public class CalendarWidgetProvider extends AppWidgetProvider {

    // In-app dark palette
    private static final int BG = Color.parseColor("#0D1425");
    private static final int CELL = Color.parseColor("#151D31");
    private static final int CELL_PROFIT = Color.parseColor("#11382E");
    private static final int CELL_LOSS = Color.parseColor("#42232A");
    private static final int TEXT = Color.parseColor("#F1F5F9");
    private static final int TEXT_DIM = Color.parseColor("#5B6B84");
    private static final int GREEN = Color.parseColor("#2DD4BF");
    private static final int GREEN_SOFT = Color.parseColor("#34D399");
    private static final int RED_SOFT = Color.parseColor("#F87171");

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            updateOne(context, manager, id);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int widgetId, Bundle newOptions) {
        updateOne(context, manager, widgetId);
    }

    private void updateOne(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);

        int[] size = widgetPixelSize(context, manager, id);
        views.setImageViewBitmap(R.id.widget_image, renderCalendar(context, size[0], size[1]));

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            PendingIntent pi = PendingIntent.getActivity(
                    context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pi);
        }
        manager.updateAppWidget(id, views);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
        if (ids.length > 0) {
            new CalendarWidgetProvider().onUpdate(context, manager, ids);
        }
    }

    private static int[] widgetPixelSize(Context context, AppWidgetManager manager, int id) {
        float density = context.getResources().getDisplayMetrics().density;
        Bundle opts = manager.getAppWidgetOptions(id);
        int wDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        int hDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
        int w = Math.round(wDp * density);
        int h = Math.round(hDp * density);
        if (w < 200) w = 900;
        if (h < 200) h = 700;
        // Cap to keep RemoteViews bitmaps well under the transport limit
        float cap = 1300f / Math.max(w, h);
        if (cap < 1f) { w = Math.round(w * cap); h = Math.round(h * cap); }
        return new int[]{w, h};
    }

    private Bitmap renderCalendar(Context context, int w, int h) {
        JSONObject days = loadDays(context);

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        float pad = w * 0.045f;
        float corner = Math.min(w, h) * 0.055f;

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(BG);
        c.drawRoundRect(new RectF(0, 0, w, h), corner, corner, bg);

        Calendar cal = Calendar.getInstance();
        int year = cal.get(Calendar.YEAR);
        int month = cal.get(Calendar.MONTH);
        int today = cal.get(Calendar.DAY_OF_MONTH);

        Calendar first = Calendar.getInstance();
        first.set(year, month, 1);
        int firstDow = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY; // 0..6
        int daysInMonth = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rows = (int) Math.ceil((firstDow + daysInMonth) / 7.0);

        // ---- layout metrics ----
        float titleH = h * 0.135f;
        float dowH = h * 0.075f;
        float gridTop = pad * 0.4f + titleH + dowH;
        float gridBottom = h - pad;
        float gridLeft = pad;
        float gridRight = w - pad;
        float colW = (gridRight - gridLeft) / 7f;
        float rowH = (gridBottom - gridTop) / rows;
        float gap = Math.min(colW, rowH) * 0.06f;
        float cellR = Math.min(colW, rowH) * 0.16f;

        // ---- title + monthly total ----
        String[] monthNames = {"January","February","March","April","May","June",
                "July","August","September","October","November","December"};
        float titleSize = titleH * 0.52f;
        Paint title = textPaint(TEXT, titleSize, true);
        float titleBaseline = pad * 0.4f + titleH * 0.62f;
        c.drawText(monthNames[month] + " " + year, gridLeft, titleBaseline, title);

        long monthTotal = 0;
        boolean hasData = false;
        for (int d = 1; d <= daysInMonth; d++) {
            Long v = dayValue(days, year, month, d);
            if (v != null) { monthTotal += v; hasData = true; }
        }
        if (hasData) {
            Paint totalPaint = textPaint(monthTotal >= 0 ? GREEN : RED_SOFT, titleSize * 0.9f, true);
            String totalStr = (monthTotal >= 0 ? "+" : "") + compact(monthTotal);
            c.drawText(totalStr, gridRight - totalPaint.measureText(totalStr), titleBaseline, totalPaint);
        }

        // ---- weekday header ----
        String[] dow = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
        Paint dowPaint = textPaint(TEXT_DIM, dowH * 0.42f, false);
        for (int i = 0; i < 7; i++) {
            float cx = gridLeft + colW * i + colW / 2 - dowPaint.measureText(dow[i]) / 2;
            c.drawText(dow[i], cx, gridTop - dowH * 0.3f, dowPaint);
        }

        // ---- day cells ----
        float dayNumSize = Math.min(colW, rowH) * 0.30f;
        float pnlSize = Math.min(colW, rowH) * 0.24f;

        Paint cellPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint dayNum = textPaint(TEXT, dayNumSize, true);
        Paint dayNumDim = textPaint(TEXT_DIM, dayNumSize, false);
        Paint pnlGreen = textPaint(GREEN_SOFT, pnlSize, true);
        Paint pnlRed = textPaint(RED_SOFT, pnlSize, true);
        Paint todayRing = new Paint(Paint.ANTI_ALIAS_FLAG);
        todayRing.setStyle(Paint.Style.STROKE);
        todayRing.setStrokeWidth(Math.max(2.5f, Math.min(colW, rowH) * 0.045f));
        todayRing.setColor(GREEN);

        for (int d = 1; d <= daysInMonth; d++) {
            int slot = firstDow + d - 1;
            int row = slot / 7, col = slot % 7;
            float l = gridLeft + col * colW + gap;
            float t = gridTop + row * rowH + gap;
            float r = gridLeft + (col + 1) * colW - gap;
            float b = gridTop + (row + 1) * rowH - gap;
            RectF rect = new RectF(l, t, r, b);

            Long v = dayValue(days, year, month, d);
            if (v == null) cellPaint.setColor(CELL);
            else if (v >= 0) cellPaint.setColor(CELL_PROFIT);
            else cellPaint.setColor(CELL_LOSS);
            c.drawRoundRect(rect, cellR, cellR, cellPaint);

            float half = todayRing.getStrokeWidth() / 2;
            if (d == today) {
                RectF ringRect = new RectF(rect.left + half, rect.top + half, rect.right - half, rect.bottom - half);
                c.drawRoundRect(ringRect, cellR - half, cellR - half, todayRing);
            }

            String ds = String.valueOf(d);
            if (v == null) {
                Paint np = d == today ? dayNum : dayNumDim;
                float baseline = rect.centerY() - (np.ascent() + np.descent()) / 2;
                c.drawText(ds, rect.centerX() - np.measureText(ds) / 2, baseline, np);
            } else {
                float numBaseline = rect.centerY() - rect.height() * 0.10f;
                c.drawText(ds, rect.centerX() - dayNum.measureText(ds) / 2, numBaseline, dayNum);
                String ps = (v >= 0 ? "+" : "") + compact(v);
                Paint pp = v >= 0 ? pnlGreen : pnlRed;
                float pnlBaseline = rect.centerY() + rect.height() * 0.28f;
                c.drawText(ps, rect.centerX() - pp.measureText(ps) / 2, pnlBaseline, pp);
            }
        }
        return bmp;
    }

    private static String compact(long v) {
        long a = Math.abs(v);
        String sign = v < 0 ? "-" : "";
        if (a >= 1_000_000) return sign + trimZero(a / 1_000_000.0) + "m";
        if (a >= 10_000) return sign + Math.round(a / 1000.0) + "k";
        if (a >= 1_000) return sign + trimZero(a / 1000.0) + "k";
        return sign + a;
    }

    private static String trimZero(double d) {
        String s = String.format(Locale.US, "%.1f", Math.abs(d));
        if (s.endsWith(".0")) s = s.substring(0, s.length() - 2);
        return s;
    }

    private static Paint textPaint(int color, float size, boolean bold) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setTextSize(size);
        p.setTypeface(Typeface.create(Typeface.SANS_SERIF, bold ? Typeface.BOLD : Typeface.NORMAL));
        return p;
    }

    private static Long dayValue(JSONObject days, int year, int month0, int day) {
        if (days == null) return null;
        String key = String.format(Locale.US, "%04d-%02d-%02d", year, month0 + 1, day);
        if (!days.has(key)) return null;
        return days.optLong(key);
    }

    private static JSONObject loadDays(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String raw = prefs.getString("widget_calendar_data", null);
            if (raw == null) return null;
            return new JSONObject(raw).optJSONObject("days");
        } catch (Exception e) {
            return null;
        }
    }
}
