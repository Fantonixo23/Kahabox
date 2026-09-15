# Kahabox — Plan de stack del SaaS multi-tenant de gestión de stock

Arquitectura: **schema compartido + `tenant_id` + Row Level Security (RLS)** sobre Supabase/Postgres, frontend offline-first, pensado para escalar de 1 a 100 PYMES revendedoras de Ciudad del Este sin cambiar de arquitectura en el camino.

---

## 0. La idea — qué es Kahabox y por qué construirlo

**El problema.** En Ciudad del Este hay una enorme cantidad de comercios revendedores — de electrónica, indumentaria, cosmética, accesorios, prácticamente cualquier rubro de reventa — que todavía llevan el control de stock en Excel, en cuaderno, o directamente de memoria. Eso genera errores típicos: vender algo que ya no hay, no saber cuánto queda de una variante específica (color, talle, capacidad), y que el vendedor en el piso no tenga forma rápida de confirmar disponibilidad sin llamar o ir a preguntar.

**La oportunidad.** Es un dolor real y recurrente, en un mercado enorme (el comercio de reventa es el corazón económico de CDE) que el fundador conoce de primera mano. No hace falta convencer a nadie de que el problema existe — hace falta un sistema simple, barato y que funcione con la conectividad imperfecta típica del microcentro.

**La solución: Kahabox.** Un SaaS multi-tenant: una sola plataforma en la nube que le vende una suscripción mensual a cada tienda (modelo SaaS clásico), en vez de instalar un sistema distinto por cliente. Cada tienda entra con su propio usuario y ve solo sus datos (aislados por `tenant_id` + RLS), pero todas corren sobre la misma base de código y la misma infraestructura — así una mejora o un arreglo llega a los 100 clientes al mismo tiempo, sin tener que ir tienda por tienda.

**Alcance de rubros.** Kahabox no está atado a un solo nicho: un dron, una tarjeta gráfica, un iPhone, un trapo, una campera — todo lo que se vende por unidad (con o sin variante de color/talle/capacidad) entra en el mismo modelo de datos. El único caso que queda fuera del alcance inicial es la venta por peso/granel (una verdulería, por ejemplo), que requeriría un modo de producto distinto y no es el foco de Kahabox.

**Por qué offline-first.** El internet en las galerías del microcentro se corta o se satura en horas pico. Si el sistema dependiera 100% de la conexión, un corte de 10 minutos significaría no poder vender. Por eso el diseño guarda los datos localmente en el dispositivo y sincroniza solo cuando vuelve la señal.

**El diferencial a mediano plazo — catálogo maestro compartido.** Cuando una tienda escanea un producto por primera vez, lo carga una única vez a un catálogo compartido entre todos los tenants (marca, nombre, foto). La siguiente tienda que escanee ese mismo código de barras ya lo encuentra cargado. Cuantas más tiendas usan Kahabox, menos trabajo manual tiene que hacer cada tienda nueva — un efecto de red real que ninguna planilla de Excel puede ofrecer. Este efecto es más fuerte en rubros con código de barras de fábrica estable (electrónica, perfumería, importados en general) y más débil en indumentaria suelta sin código estandarizado — cada tienda de ropa probablemente igual tenga que cargar sus propias prendas, aunque el control de stock le sirva igual.

**Hacia dónde puede crecer (fase futura, no del MVP).** Si el negocio valida bien como herramienta interna de stock, el paso natural es convertir ese catálogo en algo que también use el cliente final: un buscador donde alguien busca un producto puntual y ve qué tiendas de qué galería lo tienen en stock. Eso ya no es solo un software de gestión — es una capa de descubrimiento para todo el comercio de CDE. Pero es una ambición de fase 5, no algo para construir antes de validar el dolor principal con los primeros clientes reales.

---

## 1. Arquitectura general

```
PWA (Vite + React)
      │
Sync offline (RxDB / IndexedDB)
      │
Supabase
 ├─ Auth (login + JWT con tenant_id y rol)
 ├─ Postgres (tablas con tenant_id + políticas RLS)
 ├─ Storage (fotos de productos)
 ├─ Realtime (stock en vivo entre dispositivos)
 └─ Edge Functions (lógica sensible: cierre de venta, invitaciones, webhooks)
      │
Servicios externos: Bancard (cobros) · SIFEN (facturación electrónica) · Barcode lookup API · Hosting (Netlify)
```

Regla de oro del modelo: **todas las tablas operativas llevan `tenant_id`**, excepto el catálogo maestro de productos, que es compartido entre todos los tenants (de solo lectura para ellos).

---

## 2. Modelo de datos

### 2.1 Tablas núcleo

**`tenants`**
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| nombre_comercial | text | |
| estado | text | `activo`, `suspendido`, `trial` |
| plan | text | para futura segmentación de precios |
| created_at | timestamptz | |

**`usuarios_tenant`** (relación usuario ↔ tenant ↔ rol)
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → `auth.users` | |
| tenant_id | uuid FK → `tenants` | |
| rol | text | `dueño`, `vendedor` |
| created_at | timestamptz | |

> Un mismo `user_id` puede tener filas en varios tenants distintos solo si vos como plataforma lo permitís explícitamente (por ejemplo, un contador que atiende a 3 clientes). Por defecto, 1 usuario = 1 tenant.

**`productos_maestro`** (compartido entre todos los tenants, sin `tenant_id`)
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| codigo_barras | text UNIQUE | clave de búsqueda al escanear |
| nombre | text | |
| marca | text | |
| categoria | text | libre por tenant: electrónica, indumentaria, perfumería, accesorios... |
| foto_url | text | Supabase Storage |
| creado_por_tenant_id | uuid | referencia informativa, no filtra acceso |
| created_at | timestamptz | |

**`sucursales`** (por tenant — preparado desde ya para clientes con más de un local, aunque la UI multi-sucursal se construya en una fase posterior)
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → `tenants` | |
| nombre | text | ej. "Sucursal Jebai", "Sucursal Mona Lisa" |
| direccion | text | |
| created_at | timestamptz | |

> Cada tenant nuevo arranca con una sola fila en `sucursales` ("Sucursal principal"), creada automáticamente al dar de alta el tenant — así el modelo funciona igual para un local único que para una cadena, sin rama de código distinta.

**`stock_tienda`** (por tenant)
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → `tenants` | |
| sucursal_id | uuid FK → `sucursales`, nullable | qué local tiene ese stock; nullable al principio, se completa con la sucursal principal por defecto |
| producto_id | uuid FK → `productos_maestro` | |
| sku | text | código interno propio de la tienda, para productos sin código de barras de fábrica (nullable) |
| variante | text | color, talle, capacidad, tono, lote — lo que aplique según el producto (nullable) |
| precio | numeric | |
| costo | numeric | solo visible para rol `dueño` |
| moneda | text | `'PYG'` o `'USD'`, default `'PYG'` — CDE opera en ambas; se decide ahora, no se migra tenants reales sin esto |
| cantidad | integer | |
| updated_at | timestamptz | |

> **Índice único por línea de stock**: un mismo producto+variante+sucursal dentro del tenant no puede existir dos veces (evita duplicados por doble carga). Como `sku` y `variante` son nullable, se usa un índice único parcial con `COALESCE`:
>
> ```sql
> create unique index stock_tienda_unico on stock_tienda
>   (tenant_id, coalesce(sucursal_id, tenant_id), producto_id, coalesce(sku, ''), coalesce(variante, ''));
> ```
>
> Nota: `sucursal_id` también se cubre con `COALESCE(sucursal_id, tenant_id)`. En Fase 0 la sucursal es `NULL` (un solo local) y Postgres trata NULLs como distintos en índices únicos — sin el coalesce, el mismo producto+variante podría duplicarse al no tener sucursal asignada. El id del propio tenant actúa de valor centinela y nunca choca con una sucursal real.

**`ventas`** (por tenant)
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK → `tenants` | |
| sucursal_id | uuid FK → `sucursales`, nullable | en qué local se hizo la venta |
| vendedor_id | uuid FK → `usuarios_tenant` | |
| total | numeric | |
| estado | text | `pendiente_sync`, `confirmada`, `anulada` |
| created_at | timestamptz | |

**`venta_items`**
| columna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| venta_id | uuid FK → `ventas` | |
| stock_tienda_id | uuid FK → `stock_tienda` | |
| tenant_id | uuid FK → `tenants` | denormalizada — no confiar en join con `ventas` para la policy RLS; misma `tenant_isolation` que las demás tablas |
| cantidad | integer | |
| precio_unitario | numeric | |

### 2.2 Políticas RLS (patrón base, en pseudo-SQL)

```sql
-- Habilitar RLS en cada tabla con tenant_id
alter table stock_tienda enable row level security;

-- Política de lectura/escritura: solo filas del propio tenant
create policy tenant_isolation on stock_tienda
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Columna costo: ocultarla a rol vendedor vía vista, no vía RLS
-- (RLS filtra filas, no columnas — para eso se usa una vista sin la columna costo
--  que el rol vendedor consulta en vez de la tabla directa)
-- No alcanza con crear la vista: hay que revocar el acceso directo a la tabla base
-- para el rol vendedor, si no RLS igual deja pasar el SELECT con la columna costo.
-- Como el dueño de la vista (postgres) ignora RLS por defecto, la vista además debe
-- filtrar explícitamente por tenant_id del JWT:
create or replace view stock_tienda_vendedor as
  select id, tenant_id, producto_id, variante, precio, cantidad, updated_at
  from stock_tienda
  where tenant_id = (auth.jwt() ->> 'tenant_id')::uuid;

revoke select on stock_tienda from rol_vendedor;
grant select on stock_tienda_vendedor to rol_vendedor;

-- productos_maestro: lectura abierta a cualquier usuario autenticado, escritura controlada
alter table productos_maestro enable row level security;
create policy lectura_publica on productos_maestro for select using (true);
create policy escritura_autenticada on productos_maestro for insert
  with check (auth.role() = 'authenticated');
```

Puntos clave a no olvidar:
- El `tenant_id` va **dentro del JWT** (custom claim), no se confía en un campo que mande el cliente desde el frontend — si no, cualquiera podría falsificarlo. **Detalle de Supabase**: el claim se guarda en `auth.users.raw_app_meta_data` (no `raw_user_meta_data`, que el propio usuario puede editar) y en el token queda bajo `app_metadata`. Por eso la expresión real no es `auth.jwt() ->> 'tenant_id'` sino `((select auth.jwt()) -> 'app_metadata' ->> 'tenant_id')::uuid`. La migración expone el helper `public.tenant_id_activo()` y las políticas lo usan.
- RLS filtra **filas**, no columnas. Para ocultar `costo` al rol vendedor se usa una vista o una función `security definer`, no una política RLS.
- Cada tabla nueva que agregues de acá en adelante: primer reflejo, ¿lleva `tenant_id`? ¿tiene su política RLS? Convenirte esto en checklist de PR.
- **Búsqueda parcial en el buscador de productos**: una consulta exacta (`nombre = 'iphone'`) no sirve para "buscás 'ipho' y te aparecen todos los iPhones". Usar `ILIKE '%texto%'` para el buscador básico; si más adelante se necesita tolerancia a errores de tipeo, sumar `pg_trgm` + índice GIN para búsqueda full-text.
- **Sucursales**: el campo `sucursal_id` va nullable desde el día uno en `stock_tienda` y `ventas`. La UI de selector de sucursal y reportes comparativos entre locales se construye recién cuando aparezca el primer cliente con más de un local — el dato ya está listo para no tener que migrar tenants en producción cuando eso pase.

---

## 3. Frontend

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Vite + React | liviano, rápido de iterar con IA, buen soporte de librerías offline |
| Estilos | Tailwind + shadcn/ui | componentes listos, consistentes, poco tiempo de diseño |
| Formato | PWA (installable, responsive) | mismo código para celular del dueño y tablet del vendedor |
| Escaneo de código de barras | listener de teclado (lector físico USB/BT) + `BarcodeDetector` API como fallback de cámara | cobertura amplia sin dependencias pesadas |
| Estado / datos locales | RxDB sobre IndexedDB | réplica local + sincronización con Postgres/Supabase |

---

## 4. Capa offline-first

- RxDB mantiene una copia local de `stock_tienda` y encola las `ventas` creadas sin conexión con estado `pendiente_sync`.
- Al recuperar conexión, sincroniza contra Supabase; los conflictos (dos ventas del mismo ítem sin stock suficiente) se resuelven en el backend con una función que valida stock disponible al confirmar, no al crear localmente — así nunca se vende "en negativo" por una carrera entre dos tablets.
- **La confirmación de venta se hace con un `UPDATE` atómico, nunca con read-check-write** (leer → chequear → escribir deja una ventana de carrera entre dos tablets). La Edge Function de confirmación (Fase 2) decrementa stock con condición:

  ```sql
  update stock_tienda set cantidad = cantidad - :n
    where id = :id and cantidad >= :n;
  -- si rowCount = 0, no había stock suficiente → rechazar la venta
  ```

  Esto queda documentado como implementación exigida, no como intención.
- Supabase Realtime empuja los cambios de `stock_tienda` a todas las tablets conectadas en el momento, para que el número visible esté lo más actualizado posible cuando sí hay señal.

---

## 5. Backend / Supabase

- **Auth**: email+password o magic link para el dueño; usuarios de vendedor creados por el dueño desde el panel (no auto-registro).
  - **Piloto (Fase 0) — registro del dueño habilitado con verificación por email**: un trigger en `auth.users` (`migrations/20260915020000_registro_auto.sql`) crea el tenant (`trial`), la sucursal principal, el rol `dueño` y los claims `tenant_id`/`rol` al registrarse. El email requiere confirmación (link) y el "olvidé mi contraseña" reusa el flujo de recuperación de Supabase. Revisión Fase 3: reemplazar el alta automática por una Edge Function de onboarding/invitación con cobro y dar de baja del trigger.
  - **Backlog Fase 1+ (no bloqueante del MVP)**: OTP por WhatsApp para la **invitación del vendedor** (no para el login del dueño). Supabase no lo soporta nativo — SMS sí vía Twilio; WhatsApp Business API es un servicio aparte con costo por mensaje. Backlog, no arquitectura.
- **Barcode lookup API**: **opcional / enriquecimiento**, no dependencia. El flujo principal es el del plan (sección 0): el primer tenant que escanea un producto lo carga una única vez al catálogo maestro; la API externa solo auto-completa nombre/marca "cuando pegue" (tip de Search). No se integra en Fase 0.
- **Escaneo por cámara**: `BarcodeDetector` no existe en Safari/iOS. El lector físico USB/BT (listener de teclado) es el camino principal y cubre el MVP. Si en algún momento el fallback de cámara de celular es una dependencia real (no solo tablet con lector), se integra **ZXing-js/Quagga2 desde el arranque de esa feature**, no como parche posterior.
- **Edge Functions** para lógica que no debe vivir en el cliente: confirmar una venta validando stock real, generar la invitación de un nuevo vendedor, disparar el webhook de facturación.
- **Storage**: bucket `productos` con política de que cada tenant solo pueda subir a su propia carpeta, pero cualquiera pueda leer (las fotos del catálogo maestro son compartidas).
- **Migraciones versionadas** con Supabase CLI (`supabase migration new ...`), nunca cambios manuales en el dashboard para producción.

---

## 6. Panel de superadministrador (tuyo, no del cliente)

Una sección aparte (o app chica separada) para vos:
- Listado de los 100 tenants, estado de pago, fecha de alta.
- Activar/suspender cuenta.
- Métricas agregadas de uso (ventas totales, tenants activos últimos 7 días).
- Acceso de "impersonar" un tenant en modo lectura para dar soporte sin pedirle contraseña al cliente.

---

## 7. Cobros y suscripción

- Fase 1 (validación, primeros 10-20 clientes): cobro manual — mandás el link o factura mensual, marcás la cuenta como activa a mano en el panel de superadmin.
- Fase 2 (escala): integrar Bancard para cobro recurrente automático; evaluar un agregador (ej. dLocal) si el volumen lo justifica.
- Campo `plan` y `estado` en `tenants` ya preparados desde el modelo de datos para soportar esto sin migraciones grandes después.

---

## 8. Facturación electrónica (SIFEN)

- Tratarlo como sub-proyecto aparte, no como una función más.
- Evaluar primero un proveedor intermediario de facturación electrónica paraguayo antes de integrar directo contra los servidores de la DNIT — ahorra semanas de trabajo de certificados, firma XML y manejo de contingencias.
- Se conecta al flujo de `ventas`: al confirmarse una venta, se dispara una Edge Function que arma el comprobante y lo manda al proveedor/SIFEN.

---

## 9. Infraestructura y despliegue

- **Repo único** (monorepo): frontend + Edge Functions + migraciones.
- **Hosting frontend**: **Netlify** — deploy automático en cada push a `main`. Se eligió sobre Vercel porque el plan gratuito de Vercel no permite uso comercial (solo proyectos personales/de aprendizaje), mientras que Netlify sí permite cobrar a clientes en su plan free. Render no aplica acá: es para backends con servidor persistente (Node/Python/Docker), y ese rol ya lo cubre Supabase.
- **Supabase**: un solo proyecto para todos los tenants (no un proyecto por cliente).
- **Monitoreo de errores**: Sentry (o similar) conectado al frontend y a las Edge Functions.
- **Backups**: los automáticos de Supabase + verificación manual periódica mientras la base sea chica.

### Costos por fase

| Fase | Supabase | Netlify | Costo total aprox. |
|---|---|---|---|
| Piloto sin cobrar (1-2 clientes de prueba) | Free | Free | $0/mes |
| Primeros 5 clientes pagando | Free (mientras no se acerque a 500MB de DB) | Free | $0/mes |
| Producción estable, ya facturando en serio | Pro ($25/mes) — evita la pausa por inactividad del plan free | Free (sigue permitiendo uso comercial) | ~$25/mes |

El gatillo para pasar a Supabase Pro no es la cantidad de clientes, es querer eliminar el riesgo de que el proyecto se pause por inactividad, o acercarse al límite de 500MB de base de datos — lo que ocurra primero.

---

## 10. Criterios de UI/UX — simple, tipo Odoo

El frontend se diseña priorizando velocidad de uso diario y facilidad de encontrar cosas, no estética elaborada. Referencia explícita: Odoo (funcional antes que decorativo).

- **Navegación por módulos en una barra lateral simple**: Stock, Ventas, Mi equipo, Reportes. Sin dashboard cargado de widgets decorativos en la pantalla principal — solo lo que ayuda a tomar una decisión (ej. "3 productos con stock bajo").
- **Vista de lista como pantalla por defecto** en cada módulo: tabla con columnas claras (nombre, SKU, variante, cantidad, precio), buscador arriba con búsqueda parcial (`ILIKE`, ver sección 2.2), filtros simples al costado. Es la pantalla que un vendedor mira decenas de veces por día — tiene que cargar rápido y no distraer.
- **Formularios lineales**, un campo debajo del otro, sin wizards de varios pasos para acciones simples como cargar o editar un producto. Cargar stock tiene que sentirse tan simple como llenar una planilla, porque eso es justo lo que reemplaza.
- **Paleta neutra**: blanco/gris con un solo color de acento para botones primarios y estados (ej. "stock bajo" en un color de alerta). Nada de gradientes ni identidad visual cargada — también acelera el desarrollo.
- **Breadcrumbs y "volver" predecibles** en todo momento, pensando en usuarios no nativos digitales (el caso de Marcos, María, Pepito).
- **Componentes de shadcn/ui usados en su versión más simple** (tablas, formularios, sidebar) — son minimalistas por defecto, no hace falta "desvestir" un diseño cargado.

---

## 11. Roadmap sugerido (de MVP a plataforma completa)

1. **Fase 0 — Fundaciones**: tablas + RLS + Auth + CRUD de productos/stock, sin offline ni SIFEN. Probar con 1 tenant (vos mismo o un cliente amigo).
2. **Fase 1 — Piloto**: sumar escaneo de código de barras, ventas básicas, 3-5 clientes reales, cobro manual.
3. **Fase 2 — Offline real**: RxDB + sincronización, Realtime entre tablets.
4. **Fase 3 — Multi-tenant a escala**: panel de superadmin, onboarding de nuevos tenants sin intervención tuya, cobro automatizado con Bancard.
5. **Fase 4 — Cumplimiento**: integración SIFEN.
6. **Fase 5 — Producto de descubrimiento** (opcional, largo plazo): catálogo público por tienda y, más adelante, buscador agregado multi-tienda.

No arranques la Fase 2 en paralelo con la Fase 0. El orden importa: primero validar que el negocio resuelve un dolor real con el mínimo posible, después invertir en robustez técnica.

**Prioridad de aplicación de las correcciones del modelo:**
1. `tenant_id` en `venta_items` + revoke/grant de la vista → **antes de tocar código** (aislamiento entre tenants).
2. Índice único en `stock_tienda` + UPDATE atómico de confirmación → **en Fase 0**.
3. Campo `moneda` → **decisión de producto antes del primer tenant real** (ya resuelta: `PYG`/`USD`, default `PYG`).
4. Barcode API, WhatsApp OTP y cámara iOS → **decisiones de alcance documentadas**, no cambian la arquitectura.

---

## 12. Estado del frontend implementado (septiembre 2026)

Se está desarrollando **en modo demo local** (sin Supabase conectado): las páginas cargan datos desde `web/src/lib/mock.ts` cuando no hay `web/.env`. Al conectar Supabase se activan las ramas reales del mismo código (mismo contrato de datos).

Módulos ya implementados:
- **Caja** (`/app/caja`): carrito con buscador + escaneo de código de barras (cámara con ZXing y lector USB/Bluetooth), cobro multi-moneda (PYG/USD/ARS/BRL) con cotizaciones y refresco, y **métodos de pago**: Efectivo, Tarjeta, Transferencia y Crédito/Fiado. Botón "Pagos múltiples" permite combinar varios métodos; las cotizaciones de demo son de referencia (fase real: tabla `cotizaciones` o Edge Function con API de cambio). Venta con fiado → estado `pendiente_sync`.
- **Stock** (`/app/stock`): tabla con estado ok/bajo/agotado y buscador que también escanea cámara/lector.
- **Ventas** (`/app/ventas`): historial.
- **Proveedores** (`/app/proveedores`): CRUD de proveedores (nombre, RUC, contacto) y total pagado por proveedor.
- **Pagos a proveedores** (`/app/pagos-proveedores`): libro de egresos con proveedor, concepto, monto, moneda y método; filtro por proveedor y total en Gs.
- **Reportes** (`/app/reportes`): stock bajo, agotados, ventas del día y pagos a proveedores del día.
- **Mi equipo** (`/app/equipo`): miembros del tenant.

Registro de usuario → crea tenant trial + sucursal + dueño automáticamente (migración `registro_auto`). Escaneo por cámara requiere HTTPS, resuelto en dev con `@vitejs/plugin-basic-ssl` (`https://localhost:5173`, o la IP de la LAN aceptando el certificado).

**Escáner remoto con alta/reposición de stock desde el celular**: la Caja en la compu abre una sala (`K-XXXXXX`) y el celular en `https://IP:5173/escaneo` se une por un relay WebSocket (mismo `npm run dev`, ruta `/relay`). Al escanear un código que **ya está** en el stock se reenvía a la Caja y cae al carrito; si el código **no existe**, se abre en el celular el formulario "Agregar producto" (los mismos campos que Stock, componente compartido `ProductoFormFields.tsx`) y al guardar el producto se sincroniza a la Caja (y queda en el stock del teléfono). También hay "Reponer stock" para sumar unidades a un producto ya cargado, avisando a la Caja en tiempo real (`tipo: producto` / `tipo: reponer` en el relay).

**Persistencia de la demo en localStorage**: el mock (`mock.ts`) guarda su estado en `localStorage` (clave `kahabox_demo_v1`) para que los productos cargados sobrevivan recargas — pero eso es **por dispositivo**. La sincronización en vivo entre el celular y la compu la hace el relay; al conectar Supabase todo pasa a una sola base de datos y este transporte se reemplaza por Supabase Realtime.
