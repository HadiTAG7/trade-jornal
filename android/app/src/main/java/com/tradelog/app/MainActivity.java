package com.tradelog.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_NOTIFICATIONS = 5001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Keeps the home-screen widget current while the app is closed, and warns
        // if the broker sync starts failing.
        WidgetRefreshWorker.schedule(getApplicationContext());
        requestNotificationPermissionIfNeeded();
    }

    /**
     * Android 13+ requires an explicit grant before anything can be posted. The
     * app works fine without it — only the sync-failure warning is lost — so a
     * refusal is not treated as an error.
     */
    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Refresh the home-screen calendar widget with the data the web app
        // just cached, so it's up to date the moment the user leaves the app.
        CalendarWidgetProvider.refreshAll(getApplicationContext());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // The activity handles orientation/fold changes itself (see
        // configChanges in the manifest), so the WebView keeps its old layout
        // width unless we ask it to re-measure. Without this the page can stay
        // laid out at the previous width, leaving empty space beside it.
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.requestLayout();
                webView.invalidate();
                webView.evaluateJavascript("window.dispatchEvent(new Event('resize'));", null);
            }
        });
    }
}
