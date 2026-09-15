# Kahabox — Plan: caja 100% desde el celular

Objetivo: que un vendedor pueda abrir Kahabox en su teléfono (Android o iPhone), escanear productos con la cámara, cobrar, imprimir el ticket y cargar productos nuevos — sin necesitar una computadora en el local. Este plan complementa `plan-stack-saas-multitenant.md` y se enfoca solo en la parte "caja de bolsillo".

Estado de partida (lo que ya existe en el repo):
- `BarcodeScanner.tsx` — escaneo por cámara con ZXing, ya funciona en cualquier navegador móvil moderno.
- `useKeyboardScanner.ts` — soporte para lector físico USB/Bluetooth que emula teclado (útil si el local también tiene mostrador fijo).
- `escaneoRemoto.ts` + `EscaneadorPage.tsx` — hoy el celular actúa como *escáner remoto* de una caja en otra pantalla (vía WebSocket relay). Este plan lo reconvierte: el celular deja de ser un periférico y pasa a ser la caja completa.
- `vite-plugin-pwa` ya está en `web/package.json` — la base de instalación como PWA ya está.
- Falta: impresión de tickets.

---

## 1. Alcance por fases

### Fase 1 — La caja anda bien en pantalla de celular (UI)
No es solo "que entre en la pantalla", es que sea cómoda de usar con el pulgar, parada, con poca luz, y con una sola mano libre (la otra sostiene el producto).

- [ ] Revisar `CajaPage.tsx` con el viewport de un celular real (375–430px de ancho), no solo con el navegador achicado. Layout mobile-first: carrito y cobro apilados verticalmente, no en columnas lado a lado.
- [ ] Botón de escanear grande y fijo (sticky) en la parte inferior — accesible con el pulgar sin estirar la mano.
- [ ] Botones de cantidad (+/-) y de "cobrar" con área táctil mínima de 44×44px (estándar de accesibilidad táctil).
- [ ] Feedback fuerte al escanear: vibración corta (`navigator.vibrate`), sonido y flash visual — porque en el mostrador no siempre se mira la pantalla dos veces para confirmar.
- [ ] Modo "una mano": que el flujo completo (escanear → confirmar cantidad → cobrar) no requiera nunca dos toques simultáneos.

### Fase 2 — Alta de productos desde el celular (ya arrancado, hay que completarlo)
- [ ] Fusionar el flujo de `EscaneadorPage.tsx` (crear producto nuevo al escanear un código desconocido) directamente dentro de `CajaPage.tsx`, para que no haga falta ir a otra pantalla ni depender de la sala WebSocket remota.
- [ ] Autocompletar desde el catálogo maestro compartido (mencionado en `plan-stack-saas-multitenant.md`) cuando el código de barras ya fue cargado por otro tenant — así la carga en el mostrador es de 2 toques, no un formulario completo.
- [ ] Guardar fotos de producto con la cámara del mismo celular (`<input type="file" accept="image/*" capture="environment">` o reusar el stream de ZXing) y subir a Supabase Storage.
- [ ] Cola offline para altas de producto: si no hay señal, el producto se guarda en IndexedDB local y se sincroniza cuando vuelve la conexión (mismo patrón que las ventas `pendiente_sync`).

### Fase 3 — Impresión de tickets desde el celular
Ver detalle completo en la sección 2. Resumen:
- [ ] Tabla `configuracion_impresora` por tenant (WiFi directo vs. puente local).
- [ ] Generador de ticket en formato ePOS-Print (XML) para impresoras WiFi Epson/Star.
- [ ] Puente local (servidor Node liviano) para impresoras Bluetooth/USB, con protocolo HTTP simple hacia el celular.
- [ ] Pantalla de configuración de impresora dentro de Kahabox (una vez por local, no por venta).
- [ ] Reintento y cola de impresión si el ticket falla (falla de red hacia la impresora, no hacia Supabase).

### Fase 4 — PWA instalable de verdad
- [ ] Ícono y `manifest.json` con nombre corto "Kahabox Caja", para que quede como un ícono más en el home del celular, no como una pestaña de navegador.
- [ ] `display: standalone` para que abra sin barra de direcciones — se siente como app nativa.
- [ ] Pantalla de login optimizada para PWA instalada (sin depender de que el usuario recuerde la URL).
- [ ] Service worker cacheando el shell de la app para que abra rápido incluso con mala señal (no confundir con los datos, que van por la cola offline de Fase 2).
- [ ] Mantener bloqueo de pantalla y orientación vertical fija durante el flujo de cobro (evitar rotaciones accidentales a mitad de venta).

### Fase 5 (opcional, más adelante) — App nativa con Capacitor
Solo si hace falta Bluetooth clásico nativo (impresoras muy viejas sin WiFi ni ePOS-Print) o si el negocio quiere estar en las stores. No es necesario para el MVP — todo lo de arriba funciona como PWA pura.

---

## 2. Impresión: detalle técnico

Dos caminos según qué impresora tenga cada local (ver diagrama conversado antes). La clave es que el celular *siempre* hace un `fetch()` HTTP — nunca habla Bluetooth directo — así Android e iPhone se comportan igual.

### Camino A — Impresora WiFi (recomendado, sin hardware extra)
Impresoras Epson (ePOS-Print) o Star (WebPRNT) reciben el ticket por HTTP POST directo desde el navegador.

```
web/src/lib/impresion/
  epos.ts          // arma el XML ePOS-Print a partir del carrito
  imprimir.ts       // decide camino A o B según configuracion_impresora
```

- El ticket se arma como XML con el logo del negocio (opcional), ítems, totales, forma de pago y QR/código de referencia si aplica.
- `fetch(ipImpresora, { method: 'POST', body: xmlTicket })` directo desde el celular — sin backend intermedio, sin CORS (las impresoras ePOS-Print no imponen CORS típicamente; si algún modelo lo impone, se resuelve con una Edge Function de Supabase como proxy).

### Camino B — Impresora Bluetooth o USB (puente local)
Para impresoras térmicas genéricas (58mm/80mm chinas, muy comunes y baratas) que no tienen WiFi.

```
bridge/
  server.js         // Express/Fastify liviano, corre en una Raspberry Pi / mini PC / tablet vieja en la red del local
  escpos.js          // arma los comandos ESC/POS en crudo a partir del JSON del ticket
```

- El celular manda un POST con el JSON del ticket a la IP local del puente (ej. `http://192.168.1.50:4000/imprimir`).
- El puente traduce a comandos ESC/POS y los manda a la impresora por Bluetooth clásico (librería tipo `node-bluetooth-serial-port` o `node-thermal-printer`) o USB.
- El puente no necesita internet ni tocar Supabase — solo vive en la red WiFi del local.
- Instalación: un script único (`npm install && npm start`, o un ejecutable empaquetado) que corre una sola vez por local, no por celular. Documentar esto como un paso de "alta de tenant nuevo".

### Config por tenant

```sql
create table configuracion_impresora (
  tenant_id uuid primary key references tenants(id),
  tipo text not null check (tipo in ('wifi_directo', 'puente_local', 'sin_impresora')),
  endpoint text,              -- IP de la impresora o del puente
  nombre_impresora text,      -- referencia humana, ej. "Epson mostrador"
  activo boolean default true
);
```

- Pantalla nueva en Kahabox (`ConfiguracionImpresoraPage.tsx` o una sección dentro de `EquipoPage.tsx`) para que cada local cargue su `endpoint` una sola vez.
- Botón "Probar impresión" que manda un ticket de prueba, para validar la config sin tener que cerrar una venta real.

### Manejo de fallos
- Si `fetch()` al endpoint de impresión falla (impresora apagada, sin papel, puente caído), la venta **igual se confirma** — la impresión nunca debe bloquear el cobro. Se muestra un aviso y un botón "Reimprimir" para reintentar manualmente.
- Guardar el último ticket armado (XML o JSON) en memoria/IndexedDB por unos minutos, para que "Reimprimir" no dependa de reconstruir la venta.

---

## 3. Qué falta decidir con el usuario antes de programar

- [ ] ¿La demo/piloto arranca con impresoras WiFi (Epson/Star) o hay que soportar Bluetooth genérico desde el día uno? Cambia si Fase 3 empieza por el Camino A o el B.
- [ ] ¿Quién instala y mantiene el puente local en cada tienda (Camino B)? Si es el propio dueño del local, el instalador tiene que ser a prueba de errores (un solo comando, o un ejecutable con doble clic).
- [ ] Tamaño de papel a soportar (58mm vs 80mm) — cambia el ancho de columnas del ticket.
- [ ] Si además de imprimir se quiere mandar el ticket por WhatsApp/email como alternativa sin hardware (útil como fallback universal, no reemplaza impresión física pero sirve de respaldo).

---

## 4. Orden de implementación sugerido

1. Fase 1 (UI mobile-first de `CajaPage`) — impacto inmediato, sin dependencias externas.
2. Fase 2 (alta de producto integrada) — reusa código que ya existe en `EscaneadorPage.tsx`.
3. Fase 3, Camino A (impresión WiFi) — la ruta más simple técnicamente, sirve de validación end-to-end del flujo de impresión.
4. Fase 3, Camino B (puente local) — se agrega cuando aparezca el primer cliente real con impresora Bluetooth/USB.
5. Fase 4 (PWA instalable) — en paralelo a cualquiera de las anteriores, es principalmente configuración.
