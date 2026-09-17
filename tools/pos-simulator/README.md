# Simulador POS Bancard

Simulador local del terminal **CajaPOS / SmartPOS** de Bancard (API REST v1.5.0, doc "Integración CAJA POS - Android 2.0") para probar la integración sin tener el equipo físico.

## Cómo correrlo

1. Levantá el simulador (solo Python estándar):

```bash
python pos_simulator.py --port 9000 --interactive
```

2. En la app, andá a **Configuración → POS Bancard**, activá el toggle y poné:

   - IP: `127.0.0.1` (probando en la misma PC) o la IP de la compu en la LAN si probás desde el celular.
   - Puerto: `9000`

3. Pulsá **Probar conexión**: debe responder "El POS Bancard respondió correctamente".

4. En la Caja, agregá productos y tocá **POS Bancard** para cobrar por QR / Débito / Contado.

## Modos

| Comando | Efecto |
| --- | --- |
| `python pos_simulator.py --port 9000` | Aprueba todo automático. |
| `python pos_simulator.py --port 9000 --interactive` | Pide aprobar / rechazar / timeout en cada venta (como el cajero en el terminal real). |
| `python pos_simulator.py --port 9000 --random` | Fallos y rechazos aleatorios. |
| `python pos_simulator.py --port 9000 --delay-cliente 6` | Simula 6 s que tarda el cliente en el terminal. |

## Notas

- El simulador **sí responde cabeceras CORS**, así que funciona desde el navegador de la PC sin extensión. El terminal físico real **no** las manda: en la PC se necesita una extensión "Allow CORS" o el proxy `../pos-proxy.mjs`; en la app Android Kahabox va directo (usa `CapacitorHttp`).
- Endpoints implementados: `/pos/eco`, `/pos/venta-ux`, `/pos/venta/debito`, `/pos/venta/credito`, `/pos/descuento`, `/pos/venta-qr`, `/pos/venta-qr-pix`, `/pos/extraccion-qr`, `/pos/venta-canje`, `/pos/venta-canje-qr`, `/pos/venta-billetera`, `/pos/consulta-anulacion`, `/pos/anulacion`.