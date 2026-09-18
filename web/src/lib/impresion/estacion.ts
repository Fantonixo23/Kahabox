/**
 * Estación de impresión: la PC deja el trabajo en Supabase y el celular/tablet
 * (app Android) lo toma y lo imprime.
 *
 * - `enviarTrabajoAEstacion` se usa desde cualquier dispositivo (la caja).
 * - `useEstacionImpresion` se usa en el celular que hace de impresora: arranca
 *   el servicio nativo en primer plano con los parámetros, y este consulta la
 *   cola por HTTP e imprime por Bluetooth SIN depender del WebView (que Android
 *   pausa con la pantalla apagada). El "claim" es atómico en el servidor, así
 *   que cada trabajo se imprime una sola vez.
 */

import { useEffect, useState } from 'react'

import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase'
import { leerConfig, useConfig } from '@/lib/config'
import { armarEscPosBase64, type TicketVenta } from './ticket'
import {
  detenerServicioImpresion,
  esNativo,
  estadoServicioNativo,
  impresoraNativaDisponible,
  iniciarServicioImpresion,
  listarImpresoras,
  type DispositivoBluetooth,
} from './nativo'

export type ResultadoEnvio = { ok: boolean; error?: string }

const INTERVALO_ESTADO_MS = 5000

export function estacionHabilitada(): boolean {
  const { estacionImpresion } = leerConfig()
  return Boolean(
    estacionImpresion.activa && estacionImpresion.impresoraDireccion,
  )
}

export async function enviarTrabajoAEstacion(
  ticket: TicketVenta,
  ancho: number,
): Promise<ResultadoEnvio> {
  try {
    const payload = armarEscPosBase64(ticket, ancho)
    const { estacionImpresion } = leerConfig()
    const { error } = await supabase.from('trabajos_impresion').insert({
      payload,
      ancho,
      sucursal_id: estacionImpresion.sucursalId,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `No se pudo enviar a la estación: ${e.message}`
          : 'No se pudo enviar el trabajo a la estación.',
    }
  }
}

export type EstadoEstacion = {
  activa: boolean
  conectada: boolean
  ultimoError: string | null
  impresos: number
  enServicio: boolean
}

export function useEstacionImpresion(): EstadoEstacion {
  const [estado, setEstado] = useState<EstadoEstacion>({
    activa: false,
    conectada: false,
    ultimoError: null,
    impresos: 0,
    enServicio: false,
  })
  const { estacionImpresion } = useConfig()
  const activa = Boolean(
    estacionImpresion.activa && estacionImpresion.impresoraDireccion,
  )

  useEffect(() => {
    if (!esNativo() || !impresoraNativaDisponible()) return
    setEstado((prev) => ({ ...prev, activa }))
    if (!activa) {
      void detenerServicioImpresion()
      setEstado((prev) => ({
        ...prev,
        enServicio: false,
        conectada: false,
        ultimoError: null,
      }))
      return
    }

    let cancelado = false
    const nombre =
      estacionImpresion.impresoraNombre || estacionImpresion.impresoraDireccion

    const arrancar = async () => {
      let accessToken = ''
      let refreshToken = ''
      try {
        const { data } = await supabase.auth.getSession()
        accessToken = data.session?.access_token ?? ''
        refreshToken = data.session?.refresh_token ?? ''
      } catch {
        // Sin sesión: el servicio igual comienza y se queda quieto hasta 401.
      }
      await iniciarServicioImpresion({
        titulo: 'Kahabox · Impresora activa',
        texto: `Escuchando trabajos para ${nombre}`,
        supabaseUrl,
        supabaseKey: supabaseAnonKey,
        accessToken,
        refreshToken,
        dispositivoId: estacionImpresion.dispositivoId,
        sucursalId: estacionImpresion.sucursalId ?? '',
        impresoraDireccion: estacionImpresion.impresoraDireccion,
      })
      if (!cancelado) {
        setEstado((prev) => ({ ...prev, enServicio: true }))
      }
    }
    void arrancar()

    const timer = window.setInterval(() => {
      void estadoServicioNativo().then((s) => {
        if (!s || cancelado) return
        setEstado((prev) => ({
          ...prev,
          conectada: s.conectada,
          ultimoError: s.ultimoError,
          impresos: s.impresos,
          enServicio: s.corriendo,
        }))
      })
    }, INTERVALO_ESTADO_MS)

    return () => {
      cancelado = true
      window.clearInterval(timer)
    }
  }, [activa, estacionImpresion])

  return estado
}

export async function listarImpresorasDisponibles(): Promise<
  DispositivoBluetooth[]
> {
  return listarImpresoras()
}
