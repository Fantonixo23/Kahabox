import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Barcode,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Contact,
  HandCoins,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  TriangleAlert,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import { AvisoActualizacion } from '@/components/AvisoActualizacion'
import SyncBar from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { MODULOS, puedeVerModulo, useConfig } from '@/lib/config'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { usePlan } from '@/lib/plan'
import { useDiasRestantesSucursal } from '@/lib/sucursal'
import { rolUsuario } from '@/lib/vistaStock'

const ICONOS = {
  '/app/caja': CircleDollarSign,
  '/app/stock': Boxes,
  '/app/codigodebarras': Barcode,
  '/app/ventas': Receipt,
  '/app/clientes': Contact,
  '/app/proveedores': Truck,
  '/app/pagos-proveedores': HandCoins,
  '/app/equipo': Users,
  '/app/sucursal': Store,
  '/app/auditoria': ShieldCheck,
  '/app/reportes': BarChart3,
} as const

const MODULOS_CON_CONFIGURACION = (() => {
  const lista = [...MODULOS]
  const idx = lista.findIndex((m) => m.ruta === '/app/equipo')
  lista.splice(idx + 1, 0, {
    ruta: '/app/configuracion',
    label: 'Configuración',
    corto: 'Ajustes',
  })
  return lista
})()

export default function AppLayout() {
  const navigate = useNavigate()
  const { user, salirDemo } = useAuth()
  const { modulosOcultos } = useConfig()
  const plan = usePlan()
  const diasSucursal = useDiasRestantesSucursal(user)

  const [esAdmin, setEsAdmin] = useState(false)

  const nav = useMemo(
    () =>
      MODULOS_CON_CONFIGURACION.filter(
        (m) =>
          !modulosOcultos.includes(m.ruta) &&
          puedeVerModulo(m.ruta, rolUsuario(user), plan),
      ).map(
        (m) => ({ to: m.ruta, label: m.label, corto: m.corto, icon: ICONOS[m.ruta as keyof typeof ICONOS] ?? Settings }),
      ),
    [modulosOcultos, user, plan],
  )

  useEffect(() => {
    if (!isSupabaseConfigured) return
    ;(async () => {
      try {
        const { data } = await supabase.rpc('es_superadmin')
        setEsAdmin(data === true)
      } catch {
        setEsAdmin(false)
      }
    })()
  }, [])

  async function handleLogout() {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Mismo resultado: se limpia la sesión abajo.
      }
    } else {
      salirDemo()
    }
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <AvisoActualizacion />
      <aside className="hidden w-56 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Package className="size-5" />
          <span className="text-sm font-semibold">Kahabox</span>
          <div className="ml-auto flex items-center gap-1">
            {!isSupabaseConfigured && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                demo
              </span>
            )}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted font-medium text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-2">
          {esAdmin && (
            <NavLink
              to="/app/admin"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted font-medium text-foreground',
                )
              }
            >
              <UserCog className="size-4" />
              Admin
            </NavLink>
          )}
          {puedeVerModulo('/app/instalar', rolUsuario(user), plan) && (
            <NavLink
              to="/app/instalar"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted font-medium text-foreground',
                )
              }
            >
              <Smartphone className="size-4" />
              Instalar app
            </NavLink>
          )}
        </div>
        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
              {user?.email?.charAt(0) ?? '?'}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut />
            Salir
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <Package className="size-5" />
          <span className="text-sm font-semibold">Kahabox</span>
          {!isSupabaseConfigured && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              demo
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
              <LogOut />
            </Button>
          </div>
        </header>
        <SyncBar />
        {diasSucursal !== null && diasSucursal <= 3 && (
          <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              Faltan {diasSucursal}{' '}
              {diasSucursal === 1 ? 'dia' : 'dias'} para que el sistema se
              bloquee. Por favor abona a tiempo.
            </span>
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-x-clip p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 overflow-x-auto border-t bg-card md:hidden">
          <div className="flex min-w-max pb-[env(safe-area-inset-bottom)]">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-14 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[10px] text-muted-foreground hover:bg-muted',
                    isActive && 'font-semibold text-foreground',
                  )
                }
              >
                <item.icon className="size-5" />
                {item.corto}
              </NavLink>
            ))}
            {puedeVerModulo('/app/instalar', rolUsuario(user), plan) && (
              <NavLink
                to="/app/instalar"
                className={({ isActive }) =>
                  cn(
                    'flex min-w-14 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[10px] text-muted-foreground hover:bg-muted',
                    isActive && 'font-semibold text-foreground',
                  )
                }
              >
                <Smartphone className="size-5" />
                Instalar
              </NavLink>
            )}
          </div>
        </nav>
      </div>
    </div>
  )
}