package com.kahabox.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Servicio en primer plano que mantiene viva la estación de impresión con la
 * pantalla apagada. La app web (WebView) sigue escuchando los trabajos; esto
 * solo evita que Android la mate.
 */
public class PrinterService extends Service {

    public static final String CANAL = "kahabox_impresora";

    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String titulo =
                intent != null ? intent.getStringExtra("titulo") : null;
        String texto = intent != null ? intent.getStringExtra("texto") : null;
        if (titulo == null) titulo = "Kahabox";
        if (texto == null) texto = "Impresora activa";

        crearCanal();
        startForeground(42, notificacion(titulo, texto));

        if (wakeLock == null) {
            PowerManager pm =
                    (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK, "kahabox:impresora");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        }
        return START_STICKY;
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

    @Override
    public void onDestroy() {
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
