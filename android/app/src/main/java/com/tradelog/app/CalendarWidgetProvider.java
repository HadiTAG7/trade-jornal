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

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Home-screen widget: the trading month as a weekday-only P&L grid (Mon–Fri)
 * plus a weekly total column, with arrows to move between months. Data comes
 * from what the web app caches in Capacitor's SharedPreferences
 * ("CapacitorStorage", key "widget_calendar_data").
 */
public class CalendarWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_PREV = "com.tradelog.app.WIDGET_PREV_MONTH";
    private static final String ACTION_NEXT = "com.tradelog.app.WIDGET_NEXT_MONTH";
    private static final String PREFS = "tradelog_widget";
    private static final String KEY_OFFSET = "month_offset_";

    // In-app dark palette
    private static final int BG = Color.parseColor("#0D1425");
    private static final int CELL = Color.parseColor("#151D31");
    private static final int CELL_PROFIT = Color.parseColor("#11382E");
    private static final int CELL_LOSS = Color.parseColor("#42232A");
    private static final int WEEK_CELL = Color.parseColor("#101828");
    private static final int WEEK_BORDER = Color.parseColor("#22304A");
    private static final int TEXT = Color.parseColor("#F1F5F9");
    private static final int TEXT_DIM = Color.parseColor("#5B6B84");
    private static final int GREEN = Color.parseColor("#2DD4BF");
    private static final int GREEN_SOFT = Color.parseColor("#34D399");
    private static final int RED_SOFT = Color.parseColor("#F87171");

    @Override
    public void onReceive(Context context, Intent intent) {
        final String action = intent.getAction();
        if (ACTION_PREV.equals(action) || ACTION_NEXT.equals(action)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                int offset = prefs.getInt(KEY_OFFSET + id, 0) + (ACTION_NEXT.equals(action) ? 1 : -1);
                // Keep navigation within a sensible range.
                if (offset > 12) offset = 12;
                if (offset < -60) offset = -60;
                prefs.edit().putInt(KEY_OFFSET + id, offset).apply();
                updateOne(context, AppWidgetManager.getInstance(context), id);
            }
            return;
        }
        super.onReceive(context, intent);
    }

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

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        SharedPreferences.Editor e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : widgetIds) e.remove(KEY_OFFSET + id);
        e.apply();
    }

    private void updateOne(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);

        int monthOffset = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getInt(KEY_OFFSET + id, 0);
        int[] size = widgetPixelSize(context, manager, id);
        views.setImageViewBitmap(R.id.widget_image, renderCalendar(context, size[0], size[1], monthOffset));

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            views.setOnClickPendingIntent(R.id.widget_image, PendingIntent.getActivity(
                    context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        views.setOnClickPendingIntent(R.id.widget_prev, navIntent(context, id, ACTION_PREV));
        views.setOnClickPendingIntent(R.id.widget_next, navIntent(context, id, ACTION_NEXT));

        manager.updateAppWidget(id, views);
    }

    private PendingIntent navIntent(Context context, int widgetId, String action) {
        Intent intent = new Intent(context, CalendarWidgetProvider.class);
        intent.setAction(action);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        int requestCode = widgetId * 10 + (ACTION_NEXT.equals(action) ? 1 : 2);
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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
        int w = Math.round(opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) * density);
        int h = Math.round(opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) * density);
        if (w < 200) w = 900;
        if (h < 200) h = 700;
        float cap = 1300f / Math.max(w, h);
        if (cap < 1f) { w = Math.round(w * cap); h = Math.round(h * cap); }
        return new int[]{w, h};
    }

    /** One Mon–Fri row: day numbers (0 when outside the month) and their P&L. */
    private static class Week {
        final int[] days = new int[5];
        final Long[] values = new Long[5];
        boolean hasData;
        long total;
    }

    private static List<Week> buildWeeks(JSONObject data, int year, int month) {
        Calendar cal = Calendar.getInstance();
        cal.clear();
        cal.set(year, month, 1);
        int daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH);

        // Step back to the Monday of the week containing the 1st.
        int dow = cal.get(Calendar.DAY_OF_WEEK);
        int toMonday = (dow == Calendar.SUNDAY) ? -6 : (Calendar.MONDAY - dow);
        cal.add(Calendar.DAY_OF_MONTH, toMonday);

        List<Week> weeks = new ArrayList<>();
        while (true) {
            Week week = new Week();
            boolean anyInMonth = false;
            Calendar day = (Calendar) cal.clone();
            for (int i = 0; i < 5; i++) { // Mon..Fri
                boolean inMonth = day.get(Calendar.MONTH) == month && day.get(Calendar.YEAR) == year;
                if (inMonth) {
                    int d = day.get(Calendar.DAY_OF_MONTH);
                    week.days[i] = d;
                    Long v = dayValue(data, year, month, d);
                    week.values[i] = v;
                    if (v != null) {
                        week.hasData = true;
                        week.total += v;
                    }
                    anyInMonth = true;
                }
                day.add(Calendar.DAY_OF_MONTH, 1);
            }
            if (anyInMonth) weeks.add(week);

            cal.add(Calendar.DAY_OF_MONTH, 7);
            // Stop once the week's Monday is past the end of the month.
            Calendar monthEnd = Calendar.getInstance();
            monthEnd.clear();
            monthEnd.set(year, month, daysInMonth);
            if (cal.after(monthEnd)) break;
        }
        return weeks;
    }

    private Bitmap renderCalendar(Context context, int w, int h, int monthOffset) {
        JSONObject data = loadDays(context);

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        float pad = w * 0.045f;
        float corner = Math.min(w, h) * 0.055f;
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(BG);
        c.drawRoundRect(new RectF(0, 0, w, h), corner, corner, bg);

        Calendar now = Calendar.getInstance();
        int todayDay = now.get(Calendar.DAY_OF_MONTH);
        int todayMonth = now.get(Calendar.MONTH);
        int todayYear = now.get(Calendar.YEAR);

        Calendar shown = Calendar.getInstance();
        shown.add(Calendar.MONTH, monthOffset);
        int year = shown.get(Calendar.YEAR);
        int month = shown.get(Calendar.MONTH);
        boolean isCurrentMonth = (month == todayMonth && year == todayYear);

        List<Week> weeks = buildWeeks(data, year, month);
        int rows = Math.max(1, weeks.size());

        // ---- layout metrics ----
        float titleH = h * 0.135f;
        float dowH = h * 0.075f;
        float gridTop = pad * 0.4f + titleH + dowH;
        float gridBottom = h - pad;
        float gridLeft = pad;
        float gridRight = w - pad;
        int cols = 6; // Mon–Fri + Week
        float colW = (gridRight - gridLeft) / cols;
        float rowH = (gridBottom - gridTop) / rows;
        float gap = Math.min(colW, rowH) * 0.06f;
        float cellR = Math.min(colW, rowH) * 0.16f;

        // ---- title + monthly total (arrows are overlaid on the right) ----
        String[] monthNames = {"January","February","March","April","May","June",
                "July","August","September","October","November","December"};
        float titleSize = titleH * 0.52f;
        Paint title = textPaint(TEXT, titleSize, true);
        float titleBaseline = pad * 0.4f + titleH * 0.62f;
        c.drawText(monthNames[month] + " " + year, gridLeft, titleBaseline, title);

        long monthTotal = 0;
        boolean hasData = false;
        for (Week week : weeks) {
            if (week.hasData) { hasData = true; monthTotal += week.total; }
        }
        if (hasData) {
            Paint totalPaint = textPaint(monthTotal >= 0 ? GREEN : RED_SOFT, titleSize * 0.9f, true);
            String totalStr = (monthTotal >= 0 ? "+" : "") + compact(monthTotal);
            // Reserve the top-right corner for the month arrows.
            float arrowsZone = Math.max(w * 0.2f, 150f);
            c.drawText(totalStr, gridRight - arrowsZone - totalPaint.measureText(totalStr), titleBaseline, totalPaint);
        }

        // ---- column header ----
        String[] heads = {"Mon", "Tue", "Wed", "Thu", "Fri", "Week"};
        Paint dowPaint = textPaint(TEXT_DIM, dowH * 0.42f, false);
        for (int i = 0; i < cols; i++) {
            float cx = gridLeft + colW * i + colW / 2 - dowPaint.measureText(heads[i]) / 2;
            c.drawText(heads[i], cx, gridTop - dowH * 0.3f, dowPaint);
        }

        // ---- cells ----
        float dayNumSize = Math.min(colW, rowH) * 0.30f;
        float pnlSize = Math.min(colW, rowH) * 0.24f;
        Paint cellPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint weekBorder = new Paint(Paint.ANTI_ALIAS_FLAG);
        weekBorder.setStyle(Paint.Style.STROKE);
        weekBorder.setStrokeWidth(Math.max(1.5f, Math.min(colW, rowH) * 0.02f));
        weekBorder.setColor(WEEK_BORDER);
        Paint dayNum = textPaint(TEXT, dayNumSize, true);
        Paint dayNumDim = textPaint(TEXT_DIM, dayNumSize, false);
        Paint pnlGreen = textPaint(GREEN_SOFT, pnlSize, true);
        Paint pnlRed = textPaint(RED_SOFT, pnlSize, true);
        Paint weekLabel = textPaint(TEXT_DIM, pnlSize * 0.85f, false);
        Paint todayRing = new Paint(Paint.ANTI_ALIAS_FLAG);
        todayRing.setStyle(Paint.Style.STROKE);
        todayRing.setStrokeWidth(Math.max(2.5f, Math.min(colW, rowH) * 0.045f));
        todayRing.setColor(GREEN);

        for (int r = 0; r < weeks.size(); r++) {
            Week week = weeks.get(r);
            for (int i = 0; i < 5; i++) {
                if (week.days[i] == 0) continue; // day outside this month
                RectF rect = cellRect(gridLeft, gridTop, colW, rowH, i, r, gap);
                Long v = week.values[i];
                cellPaint.setColor(v == null ? CELL : (v >= 0 ? CELL_PROFIT : CELL_LOSS));
                c.drawRoundRect(rect, cellR, cellR, cellPaint);

                boolean isToday = isCurrentMonth && week.days[i] == todayDay;
                if (isToday) {
                    float half = todayRing.getStrokeWidth() / 2;
                    c.drawRoundRect(new RectF(rect.left + half, rect.top + half,
                            rect.right - half, rect.bottom - half), cellR - half, cellR - half, todayRing);
                }

                String ds = String.valueOf(week.days[i]);
                if (v == null) {
                    Paint np = isToday ? dayNum : dayNumDim;
                    float baseline = rect.centerY() - (np.ascent() + np.descent()) / 2;
                    c.drawText(ds, rect.centerX() - np.measureText(ds) / 2, baseline, np);
                } else {
                    c.drawText(ds, rect.centerX() - dayNum.measureText(ds) / 2,
                            rect.centerY() - rect.height() * 0.10f, dayNum);
                    String ps = (v >= 0 ? "+" : "") + compact(v);
                    Paint pp = v >= 0 ? pnlGreen : pnlRed;
                    c.drawText(ps, rect.centerX() - pp.measureText(ps) / 2,
                            rect.centerY() + rect.height() * 0.28f, pp);
                }
            }

            // weekly total column
            RectF wr = cellRect(gridLeft, gridTop, colW, rowH, 5, r, gap);
            cellPaint.setColor(WEEK_CELL);
            c.drawRoundRect(wr, cellR, cellR, cellPaint);
            c.drawRoundRect(wr, cellR, cellR, weekBorder);
            if (week.hasData) {
                String lbl = "Total";
                c.drawText(lbl, wr.centerX() - weekLabel.measureText(lbl) / 2,
                        wr.centerY() - wr.height() * 0.12f, weekLabel);
                String ws = (week.total >= 0 ? "+" : "") + compact(week.total);
                Paint wp = week.total >= 0 ? pnlGreen : pnlRed;
                c.drawText(ws, wr.centerX() - wp.measureText(ws) / 2,
                        wr.centerY() + wr.height() * 0.26f, wp);
            } else {
                String dash = "–";
                float baseline = wr.centerY() - (dayNumDim.ascent() + dayNumDim.descent()) / 2;
                c.drawText(dash, wr.centerX() - dayNumDim.measureText(dash) / 2, baseline, dayNumDim);
            }
        }
        return bmp;
    }

    private static RectF cellRect(float gridLeft, float gridTop, float colW, float rowH,
                                  int col, int row, float gap) {
        return new RectF(
                gridLeft + col * colW + gap,
                gridTop + row * rowH + gap,
                gridLeft + (col + 1) * colW - gap,
                gridTop + (row + 1) * rowH - gap);
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
