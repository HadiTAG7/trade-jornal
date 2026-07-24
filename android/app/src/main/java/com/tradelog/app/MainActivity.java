package com.tradelog.app;

import android.content.res.Configuration;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
