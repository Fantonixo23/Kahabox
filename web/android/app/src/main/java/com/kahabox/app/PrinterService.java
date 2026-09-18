package com.kahabox.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Estación de impresión en primer plano (pantalla apagada).
 *
 * Este servicio es 100% nativo: NO depende del WebView ni del JavaScript, que
 * Android pausa cuando la pantalla se apaga. Con su propio hilo (HandlerThread),
 * un wakelock y la notificación en primer plano, consulta la cola de trabajos de
 * Supabase por HTTP, y cuando hay trabajo imprime por Bluetooth SPP.
 *
 * Mantiene viva la sesión refrescando el access token cuando el servidor
 * responde 401.
 */
public class PrinterService extends Service {

    public static final String CANAL = "kahabox_impresora";
    private static final long INTERVALO_MS = 3000;

    private static volatile boolean corriendo;
    private static volatile boolean conectada;
    private static volatile int impresos;
    private static volatile String ultimoError;

    private PowerManager.WakeLock wakeLock;
    private HandlerThread hilo;
    private Handler handler;
    private boolean bloqueoEnProceso;

    private String supabaseUrl;
    private String apikey;
    private String accessToken;
    private String refreshToken;
    private String dispositivoId;
    private String sucursalId;
    private String direccion;
    private String titulo;

    private BluetoothSocket socket;

    public static boolean enServicio() {
        return corriendo;
    }

    public static boolean btConectada() {
        return conectada;
    }

    public static int impresos() {
        return impresos;
    }

    public static String ultimoError() {
        return ultimoError;
    }

    private final Runnable ciclo = new Runnable() {
        @Override
        public void run() {
            if (!corriendo) return;
            try {
                procesar();
            } catch (Throwable ignorado) {
                // Un error nunca debe matar el ciclo de la estación.
            }
            if (corriendo && handler != null) {
                handler.postDelayed(ciclo, INTERVALO_MS);
            }
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            supabaseUrl = intent.getStringExtra("supabaseUrl");
            apikey = intent.getStringExtra("supabaseKey");
            accessToken = intent.getStringExtra("accessToken");
            refreshToken = intent.getStringExtra("refreshToken");
            dispositivoId = intent.getStringExtra("dispositivoId");
            sucursalId = intent.getStringExtra("sucursalId");
            direccion = intent.getStringExtra("impresoraDireccion");
            titulo = intent.getStringExtra("titulo");
            if (apikey == null) apikey = "";
            if (accessToken == null) accessToken = "";
            if (refreshToken == null) refreshToken = "";
        }

        crearCanal();
        startForeground(
                42,
                notificacion(
                        supuestoTitulo(),
                        direccion == null || direccion.isEmpty()
                                ? "Esperando impresora…"
                                : "Escuchando trabajos…"));

        asegurarWakelock();

        if (handler == null || hilo == null) {
            corriendo = true;
            conectada = false;
            hilo = new HandlerThread("kahabox-impresora");
            hilo.start();
            handler = new Handler(hilo.getLooper());
            handler.postDelayed(ciclo, 2500);
        } else {
            corriendo = true;
        }
        return START_STICKY;
    }

    private String supuestoTitulo() {
        if (titulo == null || titulo.isEmpty()) return "Kahabox · Impresora activa";
        return titulo;
    }

    private void crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANAL) != null) return;
        NotificationChannel canal = new NotificationChannel(
                CANAL, "Impresora", NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Estación de impresión activa");
        nm.createNotificationChannel(canal);
    }

    private Notification notificacion(String titulo, String texto) {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int banderas = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            banderas |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(this, 0, abrir, banderas);
        return new NotificationCompat.Builder(this, CANAL)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void asegurarWakelock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "kahabox:impresora");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    // ---------------------------------------------------------------------
    // Ciclo de trabajo
    // ---------------------------------------------------------------------

    private void procesar() {
        if (bloqueoEnProceso) return;
        if (direccion == null || direccion.isEmpty()) return;
        if (supabaseUrl == null || supabaseUrl.isEmpty()
                || apikey == null || apikey.isEmpty()) return;

        bloqueoEnProceso = true;
        try {
            // Drena la cola hasta 20 trabajos por ciclo.
            for (int i = 0; i < 20; i++) {
                JSONObject trabajo = tomarTrabajo();
                if (trabajo == null) break;
                String id = trabajo.optString("id");
                String payload = trabajo.optString("payload");
                String error = null;
                boolean ok = false;
                try {
                    conectarSiHaceFalta();
                    imprimirPayload(payload);
                    ok = true;
                } catch (Exception e) {
                    cerrarSocket();
                    error = e.getMessage();
                }
                finalizar(id, ok, error);
                if (!ok) {
                    // Sin impresora disponible: esperar al próximo ciclo.
                    break;
                }
            }
        } finally {
            bloqueoEnProceso = false;
        }
    }

    private JSONObject tomarTrabajo() {
        String sucursalJson =
                (sucursalId == null || sucursalId.isEmpty())
                        ? "null"
                        : "\"" + escaparJson(sucursalId) + "\"";
        String body = "{\"p_estacion\":\"" + escaparJson(dispositivoId)
                + "\",\"p_sucursal\":" + sucursalJson + "}";
        for (int intento = 0; intento < 2; intento++) {
            RespuestaHttp r = postRpc("tomar_trabajo_impresion", body);
            if (r.codigo == 0) {
                // Sin conexión: ultimoError ya quedó descriptivo.
                return null;
            }
            if (r.codigo == 401 && refrescarToken()) {
                continue;
            }
            if (r.codigo < 200 || r.codigo >= 300) {
                ultimoError = "Servidor respondió " + r.codigo;
                return null;
            }
            String texto = r.cuerpo == null ? "" : r.cuerpo.trim();
            if (texto.isEmpty() || "null".equals(texto)) {
                ultimoError = null;
                return null;
            }
            try {
                return new JSONObject(texto);
            } catch (Exception e) {
                ultimoError = "Respuesta inválida del servidor";
                return null;
            }
        }
        return null;
    }

    private void finalizar(String id, boolean ok, String error) {
        StringBuilder body = new StringBuilder();
        body.append("{\"p_id\":\"").append(escaparJson(id))
                .append("\",\"p_ok\":").append(ok ? "true" : "false");
        if (error != null && !error.isEmpty()) {
            body.append(",\"p_error\":\"").append(escaparJson(error)).append("\"");
        }
        body.append("}");
        RespuestaHttp r = postRpc("finalizar_trabajo_impresion", body.toString());
        if (r.codigo == 401) {
            refrescarToken();
        }
        if (ok) {
            impresos += 1;
            conectada = true;
            ultimoError = null;
        } else {
            conectada = false;
            ultimoError = error;
        }
    }

    // ---------------------------------------------------------------------
    // Bluetooth
    // ---------------------------------------------------------------------

    private void conectarSiHaceFalta() throws Exception {
        if (socket != null && socket.isConnected()) return;
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            throw new Exception("El Bluetooth está apagado.");
        }
        cerrarSocket();
        BluetoothDevice device = adapter.getRemoteDevice(direccion);
        BluetoothSocket nuevo =
                device.createRfcommSocketToServiceRecord(
                        UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"));
        nuevo.connect();
        socket = nuevo;
        conectada = true;
    }

    private void imprimirPayload(String base64) throws Exception {
        if (socket == null || !socket.isConnected()) {
            throw new Exception("La impresora no está conectada.");
        }
        byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
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
    }

    private void cerrarSocket() {
        conectada = false;
        if (socket != null) {
            try {
                socket.close();
            } catch (Exception ignorado) {
            }
            socket = null;
        }
    }

    // ---------------------------------------------------------------------
    // Supabase (REST)
    // ---------------------------------------------------------------------

    private static class RespuestaHttp {
        final int codigo;
        final String cuerpo;

        RespuestaHttp(int codigo, String cuerpo) {
            this.codigo = codigo;
            this.cuerpo = cuerpo;
        }
    }

    private RespuestaHttp postRpc(String rpc, String body) {
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/rpc/" + rpc);
            HttpURLConnection con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(30000);
            con.setDoOutput(true);
            con.setRequestProperty("apikey", apikey);
            con.setRequestProperty("Authorization", "Bearer " + accessToken);
            con.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = con.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int codigo = con.getResponseCode();
            InputStream stream =
                    codigo >= 400 ? con.getErrorStream() : con.getInputStream();
            String cuerpo = leerStream(stream);
            con.disconnect();
            return new RespuestaHttp(codigo, cuerpo);
        } catch (Exception e) {
            ultimoError = "Sin conexión: " + e.getMessage();
            return new RespuestaHttp(0, null);
        }
    }

    private boolean refrescarToken() {
        if (supabaseUrl == null || refreshToken == null
                || refreshToken.isEmpty()) {
            return false;
        }
        try {
            URL url = new URL(supabaseUrl + "/auth/v1/token");
            HttpURLConnection con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(15000);
            con.setReadTimeout(30000);
            con.setDoOutput(true);
            con.setRequestProperty("apikey", apikey);
            con.setRequestProperty("Content-Type", "application/json");
            String body = "{\"grant_type\":\"refresh_token\",\"refresh_token\":\""
                    + escaparJson(refreshToken) + "\"}";
            try (OutputStream out = con.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int codigo = con.getResponseCode();
            if (codigo >= 200 && codigo < 300) {
                JSONObject o = new JSONObject(leerStream(con.getInputStream()));
                String nuevo = o.optString("access_token", "");
                if (!nuevo.isEmpty()) accessToken = nuevo;
                String nuevoRefresh = o.optString("refresh_token", "");
                if (!nuevoRefresh.isEmpty()) refreshToken = nuevoRefresh;
                ultimoError = null;
                return true;
            }
        } catch (Exception ignorado) {
        }
        return false;
    }

    private String leerStream(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int leidos;
        while ((leidos = in.read(buf)) != -1) {
            out.write(buf, 0, leidos);
        }
        in.close();
        return out.toString("UTF-8");
    }

    private static String escaparJson(String valor) {
        if (valor == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < valor.length(); i++) {
            char c = valor.charAt(i);
            if (c == '"' || c == '\\') {
                sb.append('\\');
            }
            sb.append(c);
        }
        return sb.toString();
    }

    @Override
    public void onDestroy() {
        corriendo = false;
        cerrarSocket();
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        if (hilo != null) {
            hilo.quitSafely();
        }
        handler = null;
        hilo = null;
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}