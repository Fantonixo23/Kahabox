# Kahabox — Plan Android (compilar, publicar e instalar la app)

Objetivo: compilar el APK de la app Android (Capacitor) desde GitHub, publicarlo
en una URL fija (`https://kahabox-web.vercel.app/kahabox-caja.apk`) e instalarlo en
el celular/tablet que va a imprimir los tickets por Bluetooth.

Todo se hace desde el navegador. No hace falta Android Studio ni instalar nada
en la PC del local.

---

## Estado actual (ya hecho)

- [x] Web con impresión ESC/POS, cola en Supabase y estación de impresión.
- [x] Proyecto Android en `web/android/` con el plugin nativo `KahaboxPrinter`
      (Bluetooth Classic SPP) y el servicio en primer plano `PrinterService`.
- [x] Workflow `.github/workflows/android.yml` que compila el APK y lo publica
      en un Release.
- [x] Redirección en `vercel.json`: `/kahabox-caja.apk` → último Release.
- [x] Migración `supabase/migrations/20260917170000_trabajos_impresion.sql`
      aplicada en el proyecto remoto.

## Falta (estos pasos)

- [ ] Cargar los 2 secrets en GitHub.
- [ ] Correr el workflow **APK Android**.
- [ ] Instalar el APK en el dispositivo.
- [ ] Configurarlo como estación de impresión.

---

## Paso 1 — Cargar los secrets en GitHub

Los valores están en `web/.env` (no se versiona):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

1. Abrir https://github.com/Fantonixo23/Kahabox
2. Arriba a la derecha: **Settings** (si no aparece, no sos admin del repo).
3. Columna izquierda: **Secrets and variables → Actions**.
4. Botón verde **New repository secret**:
   - Name: `VITE_SUPABASE_URL` — Secret: `https://ilqykdffuwezwhvdjopd.supabase.co`
   - **Add secret**
5. Repetir **New repository secret**:
   - Name: `VITE_SUPABASE_ANON_KEY` — Secret: el valor `eyJ...` de `web/.env`
   - **Add secret**

> La `anon key` es pública (ya viaja dentro de la web que se sirve al navegador),
> así que no es un secreto crítico. Igual se guarda como secret para no tenerla
> escrita en el repo.

## Paso 2 — Correr el workflow

1. En el repo: pestaña **Actions**.
2. En la lista de la izquierda: **APK Android**.
3. Botón **Run workflow** (derecha) → rama `main` → **Run workflow** verde.
4. Recargar: aparece una fila con círculo amarillo. Tarda ~3-5 min.
5. Al terminar (palomita verde) se crea el Release **"Kahabox Caja (APK)"**.

También se puede disparar con un tag:

```
git tag apk-v1 && git push origin apk-v1
```

## Paso 3 — Verificar la descarga

Abrir en el navegador:

```
https://kahabox-web.vercel.app/kahabox-caja.apk
```

Debe descargar el APK (Vercel redirige al último Release). En el sitio, la
sección **Instalar app** (al pie del sidebar) muestra el QR y el botón de
descarga.

## Paso 4 — Instalar en el celular/tablet

1. Escanear el QR de **Instalar app** con la cámara, o abrir el enlace.
2. Descargar `kahabox-caja.apk`.
3. Android va a pedir permitir **"Instalar apps de origen desconocido"** para
   Chrome (o el navegador que uses). Aceptar.
4. Abrir **Kahabox Caja** e iniciar sesión con el usuario de siempre.
5. Aceptar los permisos de **Bluetooth** y **Notificaciones**.

## Paso 5 — Configurar la estación de impresión (en el celular)

1. Ajustes de Android → Bluetooth: vincular (emparejar) la impresora térmica.
2. En Kahabox: **Configuración → Impresión del ticket → Configurar impresora**.
3. Elegir la impresora de la lista y tocar **Imprimir ticket de prueba**.
4. Activar **"Usar este dispositivo como estación de impresión"**.
5. Dejar el celular enchufado y la app abierta; con la pantalla apagada sigue
   escuchando los tickets (servicio en primer plano).

## Paso 6 — Usar desde la PC

1. En la PC: **Configuración → Método de impresión = Estación de impresión**.
2. Al cobrar en la Caja, el ticket se envía solo y se imprime en el celular.
3. Para reimprimir: **Ventas → Imprimir** (aparece el botón "Imprimir estación").

---

## Actualizaciones

El APK lleva la web **adentro** (no la carga del sitio), así que cada vez que
cambie la web hay que volver a correr el workflow (**Paso 2**) y reinstalar el
APK en el dispositivo. Vercel sirve siempre el último Release.

## Problemas comunes

- **No aparece "APK Android" en Actions**: esperar un minuto y recargar; GitHub
  tarda en listar workflows nuevos.
- **El workflow falla en "Compilar web"**: faltan los secrets (Paso 1).
- **La app abre pero no conecta**: se compiló sin los secrets; corregirlos y
  volver a correr el workflow.
- **No imprime**: revisar que la impresora esté emparejada, que el permiso de
  Bluetooth esté dado y que la estación esté activada en el dispositivo.
- **No veo Settings en GitHub**: no tenés permisos de admin en el repo.

## Archivos relacionados

- `.github/workflows/android.yml` — compila y publica el APK.
- `vercel.json` — redirección `/kahabox-caja.apk`.
- `web/android/` — proyecto Android (plugin `KahaboxPrinter` + `PrinterService`).
- `web/src/pages/InstalarPage.tsx` — página "Instalar app" con el QR.
- `web/src/lib/impresion/` — `escpos.ts`, `ticket.ts`, `nativo.ts`, `estacion.ts`.
- `supabase/migrations/20260917170000_trabajos_impresion.sql` — cola de impresión.
- `plan-caja-movil.md` — plan original de la caja desde el celular.
