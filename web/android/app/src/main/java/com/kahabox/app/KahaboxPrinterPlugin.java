package com.kahabox.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * Impresión ESC/POS por Bluetooth Classic (SPP) y servicio en primer plano para
 * que la estación de impresión siga viva con la pantalla apagada.
 */
@CapacitorPlugin(name = "KahaboxPrinter")
public class KahaboxPrinterPlugin extends Plugin {

    private static final UUID SPP_UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothSocket socket;
    private String address;

    private boolean tienePermiso() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.BLUETOOTH_CONNECT)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void pedirPermiso() {
        if (tienePermiso()) return;
        ActivityCompat.requestPermissions(
                getActivity(),
                new String[] {
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                },
                4711);
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (!tienePermiso()) {
            pedirPermiso();
            call.reject("Falta el permiso de Bluetooth.");
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Este dispositivo no tiene Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("El Bluetooth está apagado.");
            return;
        }
        Set<BluetoothDevice> devices = adapter.getBondedDevices();
        JSArray lista = new JSArray();
        for (BluetoothDevice d : devices) {
            JSObject obj = new JSObject();
            obj.put("name", d.getName() == null ? "" : d.getName());
            obj.put("address", d.getAddress());
            obj.put("type", tipo(d.getType()));
            lista.put(obj);
        }
        JSObject ret = new JSObject();
        ret.put("devices", lista);
        call.resolve(ret);
    }

    private String tipo(int t) {
        switch (t) {
            case BluetoothDevice.DEVICE_TYPE_CLASSIC:
                return "classic";
            case BluetoothDevice.DEVICE_TYPE_LE:
                return "le";
            case BluetoothDevice.DEVICE_TYPE_DUAL:
                return "dual";
            default:
                return "unknown";
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String addr = call.getString("address");
        if (addr == null || addr.isEmpty()) {
            call.reject("Falta la dirección de la impresora.");
            return;
        }
        if (!tienePermiso()) {
            pedirPermiso();
            call.reject("Falta el permiso de Bluetooth.");
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("El Bluetooth está apagado.");
            return;
        }
        try {
            cerrar();
            adapter.cancelDiscovery();
            BluetoothDevice device = adapter.getRemoteDevice(addr);
            BluetoothSocket nuevo =
                    device.createRfcommSocketToServiceRecord(SPP_UUID);
            nuevo.connect();
            socket = nuevo;
            address = addr;
            call.resolve();
        } catch (Exception e) {
            cerrar();
            call.reject("No se pudo conectar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void print(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("No hay datos para imprimir.");
            return;
        }
        if (socket == null || !socket.isConnected()) {
            call.reject("La impresora no está conectada.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            OutputStream out = socket.getOutputStream();
            int chunk = 256;
            for (int i = 0; i < bytes.length; i += chunk) {
                int len = Math.min(chunk, bytes.length - i);
                out.write(bytes, i, len);
                out.flush();
                try {
                    Thread.sleep(20);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo imprimir: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        cerrar();
        call.resolve();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", socket != null && socket.isConnected());
        ret.put("address", address);
        call.resolve(ret);
    }

    @PluginMethod
    public void startService(PluginCall call) {
        String titulo = call.getString("titulo", "Kahabox");
        String texto = call.getString("texto", "Impresora activa");
        Intent intent = new Intent(getContext(), PrinterService.class);
        intent.putExtra("titulo", titulo);
        intent.putExtra("texto", texto);
        intent.putExtra("supabaseUrl", call.getString("supabaseUrl", ""));
        intent.putExtra("supabaseKey", call.getString("supabaseKey", ""));
        intent.putExtra("accessToken", call.getString("accessToken", ""));
        intent.putExtra("refreshToken", call.getString("refreshToken", ""));
        intent.putExtra("dispositivoId", call.getString("dispositivoId", ""));
        intent.putExtra("sucursalId", call.getString("sucursalId", ""));
        intent.putExtra(
                "impresoraDireccion", call.getString("impresoraDireccion", ""));
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Intent intent = new Intent(getContext(), PrinterService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @PluginMethod
    public void estadoServicio(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("corriendo", PrinterService.enServicio());
        ret.put("conectada", PrinterService.btConectada());
        ret.put("impresos", PrinterService.impresos());
        ret.put("ultimoError", PrinterService.ultimoError());
        call.resolve(ret);
    }

    @PluginMethod
    public void version(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("build", BuildConfig.VERSION_CODE);
        ret.put("version", BuildConfig.VERSION_NAME);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL del APK.");
            return;
        }
        new Thread(() -> {
            try {
                java.net.HttpURLConnection con = (java.net.HttpURLConnection)
                        new java.net.URL(url).openConnection();
                con.setInstanceFollowRedirects(true);
                con.setConnectTimeout(15000);
                con.setReadTimeout(60000);
                con.setRequestProperty("User-Agent", "Kahabox");
                int estado = con.getResponseCode();
                if (estado < 200 || estado >= 300) {
                    call.reject("El servidor respondió " + estado + ".");
                    return;
                }
                java.io.File dir = getContext().getExternalCacheDir();
                if (dir == null) dir = getContext().getCacheDir();
                java.io.File apk = new java.io.File(dir, "kahabox-caja.apk");
                try (java.io.InputStream in = con.getInputStream();
                        java.io.FileOutputStream out = new java.io.FileOutputStream(apk)) {
                    byte[] buf = new byte[8192];
                    int leidos;
                    while ((leidos = in.read(buf)) != -1) {
                        out.write(buf, 0, leidos);
                    }
                }
                con.disconnect();
                if (!apk.exists() || apk.length() == 0) {
                    call.reject("El APK descargado está vacío.");
                    return;
                }
                com.getcapacitor.Bridge bridge = getBridge();
                if (bridge != null) {
                    bridge.executeOnMainThread(() -> {
                        try {
                        android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(
                                getContext(),
                                getContext().getPackageName() + ".fileprovider",
                                apk);
                        Intent instalar = new Intent(Intent.ACTION_VIEW);
                        instalar.setDataAndType(uri, "application/vnd.android.package-archive");
                        instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        instalar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(instalar);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("No se pudo abrir el instalador: " + e.getMessage());
                    }
                });
                }
            } catch (Exception e) {
                call.reject("No se pudo descargar el APK: " + e.getMessage());
            }
        }, "kahabox-actualizar").start();
    }

    private void cerrar() {
        address = null;
        if (socket != null) {
            try {
                socket.close();
            } catch (Exception ignored) {
            }
            socket = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        cerrar();
        super.handleOnDestroy();
    }
}
