import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  HandCoins,
  LogOut,
  Package,
  Receipt,
  Truck,
  Users,
} from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const nav = [
  { to: '/app/caja', label: 'Caja', corto: 'Caja', icon: CircleDollarSign },
  { to: '/app/stock', label: 'Stock', corto: 'Stock', icon: Boxes },
  { to: '/app/ventas', label: 'Ventas', corto: 'Ventas', icon: Receipt },
  { to: '/app/proveedores', label: 'Proveedores', corto: 'Prov.', icon: Truck },
  {
    to: '/app/pagos-proveedores',
    label: 'Pagos a proveedores',
    corto: 'Pagos',
    icon: HandCoins,
  },
  { to: '/app/equipo', label: 'Mi equipo', corto: 'Equipo', icon: Users },
  { to: '/app/reportes', label: 'Reportes', corto: 'Reportes', icon: BarChart3 },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { user, salirDemo } = useAuth()

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
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
        <nav className="shrink-0 overflow-x-auto border-t bg-card md:hidden">
          <div className="flex min-w-max">
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