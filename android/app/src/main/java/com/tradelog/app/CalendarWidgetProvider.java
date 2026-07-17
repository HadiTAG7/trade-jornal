package com.tradelog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Home-screen widget: renders the current month's daily P&L calendar from
 * data the web app caches in Capacitor's SharedPreferences ("CapacitorStorage",
 * key "widget_calendar_data"). Colors mirror the in-app calendar.
 */
public class CalendarWidgetProvider extends AppWidgetProvider {

    // App palette (dark theme)
    private static final int BG = Color.parseColor("#0B1120");
    private static final int CELL = Color.parseColor("#141C2E");
    private static final int CELL_PROFIT = Color.parseColor("#123F33");
    private static final int CELL_LOSS = Color.parseColor("#4A2328");
    private static final int TEXT = Color.parseColor("#E5E7EB");
    private static final int TEXT_DIM = Color.parseColor("#64748B");
    private static final int GREEN = Color.parseColor("#2DD4BF");
    private static final int RED = Color.parseColor("#F87171");

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);
            views.setImageViewBitmap(R.id.widget_image, renderCalendar(context));

            Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (open != null) {
                PendingIntent pi = PendingIntent.getActivity(
                        context, 0, open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_root, pi);
            }
            manager.updateAppWidget(id, views);
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new android.content.ComponentName(context, CalendarWidgetProvider.class));
        if (ids.length > 0) {
            new CalendarWidgetProvider().onUpdate(context, manager, ids);
        }
    }

    private Bitmap renderCalendar(Context context) {
        JSONObject days = loadDays(context);

        int w = 840, h = 640;
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        Paint bg = new Paint();
        bg.setColor(BG);
        c.drawRoundRect(new RectF(0, 0, w, h), 36, 36, bg);

        Calendar cal = Calendar.getInstance();
        int year = cal.get(Calendar.YEAR);
        int month = cal.get(Calendar.MONTH); // 0-based
        int today = cal.get(Calendar.DAY_OF_MONTH);

        String[] monthNames = {"January","February","March","April","May","June",
                "July","August","September","October","November","December"};

        Paint title = textPaint(TEXT, 44, true);
        c.drawText(monthNames[month] + " " + year, 32, 64, title);

        // Monthly total (top-right)
        long monthTotal = 0;
        boolean hasData = false;
        Calendar probe = (Calendar) cal.clone();
        int daysInMonth = probe.getActualMaximum(Calendar.DAY_OF_MONTH);
        for (int d = 1; d <= daysInMonth; d++) {
            Long v = dayValue(days, year, month, d);
            if (v != null) { monthTotal += v; hasData = true; }
        }
        if (hasData) {
            Paint totalPaint = textPaint(monthTotal >= 0 ? GREEN : RED, 40, true);
            String totalStr = (monthTotal >= 0 ? "+" : "") + monthTotal;
            c.drawText(totalStr, w - 32 - totalPaint.measureText(totalStr), 64, totalPaint);
        }

        // Weekday header (Sun-first, like the app)
        String[] dow = {"S", "M", "T", "W", "T", "F", "S"};
        float gridTop = 100, gridLeft = 24, gridRight = w - 24, gridBottom = h - 24;
        float colW = (gridRight - gridLeft) / 7f;
        Paint dowPaint = textPaint(TEXT_DIM, 26, false);
        for (int i = 0; i < 7; i++) {
            float cx = gridLeft + colW * i + colW / 2 - dowPaint.measureText(dow[i]) / 2;
            c.drawText(dow[i], cx, gridTop + 26, dowPaint);
        }

        // Day cells
        Calendar first = Calendar.getInstance();
        first.set(year, month, 1);
        int firstDow = first.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY; // 0..6
        int rows = (int) Math.ceil((firstDow + daysInMonth) / 7.0);
        float cellsTop = gridTop + 44;
        float rowH = (gridBottom - cellsTop) / rows;
        float pad = 5;

        Paint cellPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint dayNum = textPaint(TEXT, 28, true);
        Paint dayNumDim = textPaint(TEXT_DIM, 28, false);
        Paint pnlGreen = textPaint(GREEN, 24, false);
        Paint pnlRed = textPaint(RED, 24, false);
        Paint todayRing = new Paint(Paint.ANTI_ALIAS_FLAG);
        todayRing.setStyle(Paint.Style.STROKE);
        todayRing.setStrokeWidth(4);
        todayRing.setColor(GREEN);

        for (int d = 1; d <= daysInMonth; d++) {
            int slot = firstDow + d - 1;
            int row = slot / 7, col = slot % 7;
            float l = gridLeft + col * colW + pad;
            float t = cellsTop + row * rowH + pad;
            float r = gridLeft + (col + 1) * colW - pad;
            float b = cellsTop + (row + 1) * rowH - pad;
            RectF rect = new RectF(l, t, r, b);

            Long v = dayValue(days, year, month, d);
            if (v == null) cellPaint.setColor(CELL);
            else if (v >= 0) cellPaint.setColor(CELL_PROFIT);
            else cellPaint.setColor(CELL_LOSS);
            c.drawRoundRect(rect, 14, 14, cellPaint);

            if (d == today) c.drawRoundRect(rect, 14, 14, todayRing);

            String ds = String.valueOf(d);
            Paint np = (v == null && d != today) ? dayNumDim : dayNum;
            c.drawText(ds, rect.centerX() - np.measureText(ds) / 2,
                    v == null ? rect.centerY() + 10 : rect.centerY() - 4, np);

            if (v != null) {
                String ps = (v >= 0 ? "+" : "") + v;
                Paint pp = v >= 0 ? pnlGreen : pnlRed;
                c.drawText(ps, rect.centerX() - pp.measureText(ps) / 2, rect.centerY() + 26, pp);
            }
        }
        return bmp;
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
