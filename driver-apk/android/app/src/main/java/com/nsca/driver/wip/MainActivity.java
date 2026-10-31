package com.nsca.driver.wip;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriverFilesPlugin.class);
        registerPlugin(DriverUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
