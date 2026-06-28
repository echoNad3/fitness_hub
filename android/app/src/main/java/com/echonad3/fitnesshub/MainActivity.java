package com.echonad3.fitnesshub;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RestAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
