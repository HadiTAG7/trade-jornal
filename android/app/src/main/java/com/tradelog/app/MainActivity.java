package com.tradelog.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onPause() {
        super.onPause();
        // Refresh the home-screen calendar widget with the data the web app
        // just cached, so it's up to date the moment the user leaves the app.
        CalendarWidgetProvider.refreshAll(getApplicationContext());
    }
}
