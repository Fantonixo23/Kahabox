package com.kahabox.app;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KahaboxPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        pedirPermisos();
    }

    private void pedirPermisos() {
        List<String> permisos = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permisos.add(Manifest.permission.BLUETOOTH_CONNECT);
            permisos.add(Manifest.permission.BLUETOOTH_SCAN);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permisos.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!permisos.isEmpty()) {
            ActivityCompat.requestPermissions(
                    this, permisos.toArray(new String[0]), 4711);
        }
    }
}
