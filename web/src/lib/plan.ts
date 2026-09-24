import { useSyncExternalStore } from 'react'

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type PlanApp = 'basico' | 'estandar' | 'pro'

const ORDEN: PlanApp[] = ['basico', 'estandar', 'pro']

// En demo (sin Supabase) todo queda abierto.
export const PLAN_DEMO: PlanApp = 'pro'

const CLAVE = 'kahabox:plan'

export type LimitesPlan = {
  admins: number
  empleados: number
  sucursales: number | null
}

export const PLANES: { plan: PlanApp; nombre: string; precio: string }[] = [
  { plan: 'basico', nombre: 'Básico', precio: '230.000 Gs' },
  { plan: 'estandar', nombre: 'Estándar', precio: '360.000 Gs' },
  { plan: 'pro', nombre: 'Pro', precio: '480.000 Gs' },
]

export function etiquetaPlan(plan: PlanApp): string {
  return (
    PLANES.find((p) => p.plan === plan)?.nombre ??
    plan.charAt(0).toUpperCase() + plan.slice(1)
  )
}

export function esPlanMinimo(plan: PlanApp, minimo: PlanApp): boolean {
  return ORDEN.indexOf(plan) >= ORDEN.indexOf(minimo)
}

function normalizar(valor: unknown): PlanApp {
  return valor === 'basico' || valor === 'estandar' || valor === 'pro'
    ? valor
    : PLAN_DEMO
}

function leerCache(): PlanApp {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? normalizar(JSON.parse(raw)) : PLAN_DEMO
  } catch {
    return PLAN_DEMO
  }
}

// Mientras no se conoce el plan real se usa 'pro' (sin bloquear nada) y al
// cargar se corrige. Evita destellos de módulos ocultos en el arranque.
let plan: PlanApp = leerCache()
let limites: LimitesPlan | null = null
let comenzado = false
const listeners = new Set<() => void>()

function emitir() {
  listeners.forEach((l) => l())
}

function actualizarCache() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(plan))
  } catch {
    // Sin storage: el plan vive en memoria.
  }
}

async function cargarPlan() {
  if (!isSupabaseConfigured) {
    plan = PLAN_DEMO
    limites = {
      admins: 4,
      empleados: 10,
      sucursales: null,
    }
    emitir()
    return
  }
  try {
    const [resPlan, resLimites] = await Promise.all([
      supabase.rpc('mi_plan'),
      supabase.rpc('limites_plan'),
    ])
    if (resPlan.error) throw new Error(resPlan.error.message)
    plan = normalizar(resPlan.data?.[0]?.plan)
    const l = resLimites.data?.[0]
    if (l && !resLimites.error) {
      limites = {
        admins: l.admins,
        empleados: l.empleados,
        sucursales: l.sucursales,
      }
    }
  } catch {
    plan = PLAN_DEMO
    limites = {
      admins: 4,
      empleados: 10,
      sucursales: null,
    }
  }
  actualizarCache()
  emitir()
}

function suscribir(cb: () => void) {
  if (!comenzado) {
    comenzado = true
    void cargarPlan()
  }
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function leerPlan(): PlanApp {
  return plan
}

export function usePlan(): PlanApp {
  return useSyncExternalStore(suscribir, leerPlan, leerPlan)
}

export function useLimitesPlan(): LimitesPlan | null {
  return useSyncExternalStore(suscribir, () => limites, () => limites)
}