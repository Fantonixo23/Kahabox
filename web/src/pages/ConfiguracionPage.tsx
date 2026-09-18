import { useEffect, useState } from 'react'

import {
  Coins,
  CreditCard,
  Download,
  EyeOff,
  FileKey2,
  Info,
  Loader2,
  MonitorSmartphone,
  Moon,
  Printer,
  RefreshCw,
  ShieldCheck,
  Store as StoreIcon,
  Sun,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import ImpresoraDialog from '@/components/ImpresoraDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { esNativo } from '@/lib/impresion/nativo'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from 'cn'
import {
  actualizarApp,
  buscarActualizacion,
  fechaLegible,
  versionInstalada,
  type InfoActualizacion,
} from '@/lib/actualizacion'
import { probarConexionPos } from '@/lib/bancard'
import { MONEDAS, type Moneda } from '@/lib/format'
import {
  MODULOS,
  actualizarConfig,
  nombreNegocio,
  useConfig,
  type AnchoTicketPc,
  type CajaNumero,
  type CertificadoSifen,
  type MetodoImpresion,
  type Tema,
} from '@/lib/config'

export default function ConfiguracionPage() {
  const config = useConfig()
  const [nombre, setNombre] = useState(config.nombreNegocio)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [probandoPos, setProbandoPos] = useState(false)
  const [resultadoPos, setResultadoPos] = useState<
    'ok' | 'error' | null
  >(null)
  const [mensajePos, setMensajePos] = useState('')
  const [impresoraAbierta, setImpresoraAbierta] = useState(false)
  const [versionActual, setVersionActual] = useState<string | null>(null)
  const [actualizacion, setActualizacion] = useState<InfoActualizacion | null>(
    null,
  )
  const [estadoActualizacion, setEstadoActualizacion] = useState<
    'inicial' | 'buscando' | 'ok' | 'al-dia' | 'error'
  >('inicial')
  const [mensajeActualizacion, setMensajeActualizacion] = useState('')

  useEffect(() => {
    void versionInstalada().then(setVersionActual)
  }, [])

  async function buscarActualizacionApp() {
    setEstadoActualizacion('buscando')
    setActualizacion(null)
    setMensajeActualizacion('')
    try {
      const info = await buscarActualizacion()
      setActualizacion(info)
      setEstadoActualizacion(info ? 'ok' : 'al-dia')
    } catch {
      setEstadoActualizacion('error')
    }
  }

  async function instalarActualizacionApp() {
    if (!actualizacion) return
    setMensajeActualizacion('')
    try {
      await actualizarApp(actualizacion.url)
      setMensajeActualizacion('Se abrió el instalador de Android. Confirmá la instalación.')
    } catch {
      setMensajeActualizacion('No se pudo descargar el APK. Revisá la conexión.')
    }
  }

  async function probarPos() {
    setProbandoPos(true)
    setResultadoPos(null)
    setMensajePos('')
    try {
      await probarConexionPos(config.bancardIp, config.bancardPuerto)
      setResultadoPos('ok')
      setMensajePos('El POS Bancard respondió correctamente.')
    } catch (e) {
      setResultadoPos('error')
      setMensajePos(e instanceof Error ? e.message : 'No se pudo conectar al POS.')
    } finally {
      setProbandoPos(false)
    }
  }

  function guardarNombre() {
    actualizarConfig({ nombreNegocio: nombre.trim() })
    setMensaje('Nombre del negocio actualizado.')
    window.setTimeout(() => setMensaje(null), 2500)
  }

  function alternarModulo(ruta: string) {
    const ocultos = config.modulosOcultos.includes(ruta)
      ? config.modulosOcultos.filter((r) => r !== ruta)
      : [...config.modulosOcultos, ruta]
    actualizarConfig({ modulosOcultos: ocultos })
  }

  function actualizarCertificado(cert: CertificadoSifen) {
    actualizarConfig({ certificado: cert })
  }

  function alternarMoneda(codigo: Moneda) {
    const activas = config.monedasActivas.includes(codigo)
      ? config.monedasActivas.filter((m) => m !== codigo)
      : [...config.monedasActivas, codigo]
    const principal = activas.includes(config.monedaPrincipal)
      ? config.monedaPrincipal
      : (activas[0] ?? config.monedaPrincipal)
    actualizarConfig({ monedasActivas: activas, monedaPrincipal: principal })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Nombre del negocio, facturación electrónica (SIFEN) y qué módulos querés ver.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="size-4" />
            Apariencia
          </CardTitle>
          <CardDescription>
            Elegí el tema de la interfaz en este dispositivo. Se aplica lo mismo
            en la PC y en la app de Android.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 sm:max-w-xs">
            {(
              [
                { valor: 'claro', etiqueta: 'Claro', Icono: Sun },
                { valor: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
              ] as const
            ).map(({ valor, etiqueta, Icono }) => (
              <button
                key={valor}
                type="button"
                onClick={() => actualizarConfig({ tema: valor as Tema })}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors',
                  config.tema === valor
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                <Icono className="size-4" />
                {etiqueta}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StoreIcon className="size-4" />
            Nombre del negocio
          </CardTitle>
          <CardDescription>
            Aparece en el encabezado del ticket. Hoy se imprime:{' '}
            <span className="font-medium">{nombreNegocio()}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-nombre">Nombre (ej: «Ferretería El Tucán»)</Label>
            <Input
              id="cfg-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="KAHABOX"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={guardarNombre}>
              Guardar nombre
            </Button>
            {mensaje && (
              <span className="text-xs font-medium text-emerald-600">
                {mensaje}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4" />
            Monedas
          </CardTitle>
          <CardDescription>
            Elegí con qué divisas trabajás y cuál se usa por defecto. Las
            desactivadas dejan de aparecer en los selectores de Caja, Stock y
            Pagos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {MONEDAS.map((m) => {
              const activa = config.monedasActivas.includes(m.codigo)
              return (
                <label
                  key={m.codigo}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <span className="text-sm font-medium">{m.etiqueta}</span>
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={activa}
                    onChange={() => alternarMoneda(m.codigo)}
                  />
                </label>
              )
            })}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-moneda-principal">Moneda por defecto</Label>
            <Select
              value={config.monedaPrincipal}
              onValueChange={(v) =>
                actualizarConfig({ monedaPrincipal: v as Moneda })
              }
            >
              <SelectTrigger
                id="cfg-moneda-principal"
                className="w-full sm:max-w-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONEDAS.filter((m) =>
                  config.monedasActivas.includes(m.codigo),
                ).map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.monedasActivas.length === 0 && (
              <p className="text-xs text-amber-600">
                Activá al menos una moneda para elegir una por defecto.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Facturación electrónica (SIFEN)
          </CardTitle>
          <CardDescription>
            De momento guardamos esta configuración. La emisión de facturas
            electrónicas de Paraguay se activa en una próxima etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Habilitar SIFEN</p>
              <p className="text-xs text-muted-foreground">
                Emitir facturas electrónicas al cobrar.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.sifenActivo}
              onClick={() => actualizarConfig({ sifenActivo: !config.sifenActivo })}
              className={cn(
                'flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors',
                config.sifenActivo
                  ? 'justify-end border-primary bg-primary'
                  : 'justify-start border-input bg-muted',
              )}
            >
              <span
                className={cn(
                  'size-5 rounded-full transition-colors',
                  config.sifenActivo ? 'bg-primary-foreground' : 'bg-background',
                )}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-ruc">RUC de la empresa</Label>
            <Input
              id="cfg-ruc"
              value={config.sifenRuc}
              onChange={(e) =>
                actualizarConfig({ sifenRuc: e.target.value.replace(/\D/g, '') })
              }
              placeholder="80000000-0"
              inputMode="numeric"
            />
          </div>

          <CertificadoBlock
            certificado={config.certificado}
            onCambiar={actualizarCertificado}
            onQuitar={() => actualizarConfig({ certificado: null })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" />
            POS Bancard
          </CardTitle>
          <CardDescription>
            Cobrás con el terminal físico Bancard (SmartPOS / CajaPOS Android)
            desde la Caja: QR, débito y contado. El terminal recibe el monto
            automáticamente por la red local.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Habilitar POS Bancard</p>
              <p className="text-xs text-muted-foreground">
                Aparece el botón "POS Bancard" en la Caja.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.bancardActivo}
              onClick={() =>
                actualizarConfig({ bancardActivo: !config.bancardActivo })
              }
              className={cn(
                'flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors',
                config.bancardActivo
                  ? 'justify-end border-primary bg-primary'
                  : 'justify-start border-input bg-muted',
              )}
            >
              <span
                className={cn(
                  'size-5 rounded-full transition-colors',
                  config.bancardActivo
                    ? 'bg-primary-foreground'
                    : 'bg-background',
                )}
              />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-pos-ip">IP del terminal</Label>
              <Input
                id="cfg-pos-ip"
                value={config.bancardIp}
                onChange={(e) =>
                  actualizarConfig({ bancardIp: e.target.value.trim() })
                }
                placeholder="192.168.0.50"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-pos-puerto">Puerto</Label>
              <Input
                id="cfg-pos-puerto"
                value={config.bancardPuerto}
                onChange={(e) =>
                  actualizarConfig({
                    bancardPuerto: e.target.value.replace(/\D/g, ''),
                  })
                }
                placeholder="9000"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={probandoPos || !config.bancardActivo}
              onClick={() => void probarPos()}
            >
              {probandoPos && <Loader2 className="size-4 animate-spin" />}
              Probar conexión
            </Button>
            {resultadoPos && (
              <span
                className={cn(
                  'text-xs font-medium',
                  resultadoPos === 'ok'
                    ? 'text-emerald-600'
                    : 'text-red-600',
                )}
              >
                {mensajePos}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            En la app Android funciona directo. En el navegador de la PC, el
            terminal real exige una extensión CORS (p. ej. «Allow CORS») o el
            proxy local <span className="font-mono">tools/pos-proxy.mjs</span>{' '}
            porque el terminal no envía cabeceras CORS.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="size-4" />
            Módulos visibles
          </CardTitle>
          <CardDescription>
            Ocultá los módulos que no usás: se quedan fuera de la barra de
            navegación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {MODULOS.map((m) => {
            const oculto = config.modulosOcultos.includes(m.ruta)
            return (
              <label
                key={m.ruta}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5"
              >
                <span className="text-sm font-medium">{m.label}</span>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={!oculto}
                  onChange={() => alternarModulo(m.ruta)}
                />
              </label>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-4" />
            Impresión del ticket
          </CardTitle>
          <CardDescription>
            Impresión directa por Bluetooth desde un celular/tablet que hace de
            estación. La PC le manda el ticket por internet, sin instalar nada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-metodo-impresion">Método de impresión</Label>
            <Select
              value={config.metodoImpresion}
              onValueChange={(v) =>
                actualizarConfig({ metodoImpresion: v as MetodoImpresion })
              }
            >
              <SelectTrigger id="cfg-metodo-impresion" className="w-full sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estacion">
                  Estación de impresión (celular/tablet)
                </SelectItem>
                <SelectItem value="navegador">
                  PC / navegador (ventana de impresión)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-ancho-ticket">Ancho del ticket</Label>
            <Select
              value={String(config.anchoTicketPc)}
              onValueChange={(v) =>
                actualizarConfig({ anchoTicketPc: Number(v) as AnchoTicketPc })
              }
            >
              <SelectTrigger id="cfg-ancho-ticket" className="w-full sm:max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="88">88 mm — ancho estándar</SelectItem>
                <SelectItem value="58">58 mm — angosto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5">
            <span className="text-sm">
              {config.estacionImpresion.activa && config.estacionImpresion.impresoraDireccion
                ? `Estación activa · ${config.estacionImpresion.impresoraNombre || config.estacionImpresion.impresoraDireccion}`
                : 'Este dispositivo no está configurado como estación'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setImpresoraAbierta(true)}
            >
              <Printer />
              Configurar impresora
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImpresoraDialog
        open={impresoraAbierta}
        onOpenChange={setImpresoraAbierta}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="size-4" />
            Caja de esta computadora
          </CardTitle>
          <CardDescription>
            Número de caja para el escáner remoto. El QR que muestra la Caja
            lleva a este número de caja en el celular.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-caja">Número de Caja</Label>
            <div className="flex gap-2 sm:max-w-xs">
              {([1, 2, 3] as CajaNumero[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => actualizarConfig({ cajaNumero: n })}
                  className={cn(
                    'flex h-10 flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                    config.cajaNumero === n
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Estas en la Caja {config.cajaNumero} (canal{' '}
              <span className="font-mono">caja-{config.cajaNumero}</span>).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-4" />
            Actualización de la app
          </CardTitle>
          <CardDescription>
            La app lleva la web adentro, así que cuando haya una versión nueva
            la descargás y la instalás acá mismo, en 2 toques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!esNativo() ? (
            <p className="text-sm text-muted-foreground">
              Este ajuste es solo para la app de Android. Desde la web de la PC
              las actualizaciones llegan solas.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Versión instalada</Label>
                <p className="text-sm font-medium">
                  {versionActual
                    ? `Kahabox Caja v${versionActual}`
                    : 'Consultando…'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={estadoActualizacion === 'buscando'}
                  onClick={() => void buscarActualizacionApp()}
                >
                  {estadoActualizacion === 'buscando' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Buscar actualizaciones
                </Button>
                {estadoActualizacion === 'al-dia' && (
                  <span className="text-xs font-medium text-emerald-600">
                    Estás al día.
                  </span>
                )}
                {estadoActualizacion === 'ok' && actualizacion && (
                  <>
                    <span className="text-xs font-medium text-amber-600">
                      Hay v{actualizacion.versionName} disponible (
                      {fechaLegible(actualizacion.fecha)}).
                    </span>
                    <Button
                      type="button"
                      onClick={() => void instalarActualizacionApp()}
                    >
                      <Download />
                      Actualizar ahora
                    </Button>
                  </>
                )}
                {estadoActualizacion === 'error' && (
                  <span className="text-xs font-medium text-red-600">
                    No se pudo consultar. Revisá la conexión.
                  </span>
                )}
              </div>
              {mensajeActualizacion && (
                <p className="text-xs font-medium text-emerald-600">
                  {mensajeActualizacion}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" />
            Datos de la demo
          </CardTitle>
          <CardDescription>
            Trabajás con datos de demostración guardados en este navegador.
            Conectá la base de datos real (Supabase) para producción.
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Los cambios se guardan automáticamente en este dispositivo.
      </p>
    </div>
  )
}

function CertificadoBlock({
  certificado,
  onCambiar,
  onQuitar,
}: {
  certificado: CertificadoSifen | null
  onCambiar: (cert: CertificadoSifen) => void
  onQuitar: () => void
}) {
  async function leerArchivo(archivo?: File | null) {
    if (!archivo) return
    const contenido: string = await new Promise((resolve, reject) => {
      const lector = new FileReader()
      lector.onload = () => resolve(String(lector.result ?? ''))
      lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
      lector.readAsDataURL(archivo)
    })
    onCambiar({
      nombre: archivo.name,
      tamano: archivo.size,
      tipo: archivo.type || 'p12',
      base64: contenido,
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Certificado digital (SIFEN)</Label>
        {certificado && (
          <Button type="button" variant="ghost" size="sm" onClick={onQuitar}>
            <Trash2 />
            Quitar
          </Button>
        )}
      </div>

      {certificado ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <FileKey2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{certificado.nombre}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {(certificado.tamano / 1024).toFixed(1)} KB
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Todavía no cargaste un certificado. Acepta archivos .p12 / .pfx.
        </p>
      )}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
        <FileKey2 className="size-4" />
        {certificado ? 'Reemplazar certificado' : 'Cargar certificado'}
        <input
          type="file"
          accept=".p12,.pfx,.pem,.cer"
          className="sr-only"
          onChange={(e) => void leerArchivo(e.target.files?.[0])}
        />
      </label>
    </div>
  )
}