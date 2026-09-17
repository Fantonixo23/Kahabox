import { useMemo } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  HandCoins,
  LogOut,
  Package,
  Receipt,
  Settings,
  Truck,
  Users,
} from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import SyncBar from '@/components/SyncBar'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { MODULOS, useConfig } from '@/lib/config'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const ICONOS = {
  '/app/caja': CircleDollarSign,
  '/app/stock': Boxes,
  '/app/ventas': Receipt,
  '/app/proveedores': Truck,
  '/app/pagos-proveedores': HandCoins,
  '/app/equipo': Users,
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

  const nav = useMemo(
    () =>
      MODULOS_CON_CONFIGURACION.filter((m) => !modulosOcultos.includes(m.ruta)).map(
        (m) => ({ to: m.ruta, label: m.label, corto: m.corto, icon: ICONOS[m.ruta as keyof typeof ICONOS] ?? Settings }),
      ),
    [modulosOcultos],
  )

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
      <aside className="hidden w-56 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Package className="size-5" />
          <span className="text-sm font-semibold">Kahabox</span>
          {!isSupabaseConfigured && (
            <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              demo
            </span>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted font-medium text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
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
        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
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
                    'flex min-w-14 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[10px] text-muted-foreground transition-colors hover:bg-muted',
                    isActive && 'font-semibold text-foreground',
                  )
                }
              >
                <item.icon className="size-5" />
                {item.corto}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}