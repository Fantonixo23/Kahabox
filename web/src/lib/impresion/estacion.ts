/**
 * Estación de impresión: la PC deja el trabajo en Supabase y el celular/tablet
 * (app Android) lo toma y lo imprime.
 *
 * - `enviarTrabajoAEstacion` se usa desde cualquier dispositivo (la caja).
 * - `useEstacionImpresion` se usa en el celular que hace de impresora: mantiene
 *   el servicio en primer plano, escucha los trabajos por Realtime y, como
 *   respaldo, sondea la cola. El "claim" es atómico en el servidor, así que
 *   aunque Realtime y el sondeo coincidan, cada trabajo se imprime una sola vez.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { leerConfig } from '@/lib/config'
import { armarEscPosBase64, type TicketVenta } from './ticket'
import {
  imprimirEscPos,
  impresoraNativaDisponible,
  iniciarServicioImpresion,
  detenerServicioImpresion,
  KahaboxPrinter,
  listarImpresoras,
  esNativo,
  type DispositivoBluetooth,
} from './nativo'

export type ResultadoEnvio = { ok: boolean; error?: string }

const INTERVALO_SONDEO_MS = 15_000

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
  const procesando = useRef(false)

  const procesarPendientes = useCallback(async () => {
    if (procesando.current) return
    procesando.current = true
    try {
      const { estacionImpresion } = leerConfig()
      if (!estacionImpresion.impresoraDireccion) return

      for (let i = 0; i < 20; i += 1) {
        const { data, error } = await supabase.rpc('tomar_trabajo_impresion', {
          p_estacion: estacionImpresion.dispositivoId,
          p_sucursal: estacionImpresion.sucursalId,
        })
        if (error) {
          setEstado((prev) => ({ ...prev, ultimoError: error.message }))
          return
        }
        if (!data) return

        const trabajo = data as {
          id: string
          payload: string
          ancho: number
        }

        try {
          const { connected } = await KahaboxPrinter.estado()
          if (!connected) {
            await KahaboxPrinter.connect({
              address: estacionImpresion.impresoraDireccion,
            })
          }
          await imprimirEscPos(trabajo.payload)
          await supabase.rpc('finalizar_trabajo_impresion', {
            p_id: trabajo.id,
            p_ok: true,
          })
          setEstado((prev) => ({
            ...prev,
            conectada: true,
            ultimoError: null,
            impresos: prev.impresos + 1,
          }))
        } catch (e) {
          const mensaje =
            e instanceof Error ? e.message : 'Error al imprimir el trabajo.'
          await supabase.rpc('finalizar_trabajo_impresion', {
            p_id: trabajo.id,
            p_ok: false,
            p_error: mensaje,
          })
          setEstado((prev) => ({
            ...prev,
            conectada: false,
            ultimoError: mensaje,
          }))
          return
        }
      }
    } finally {
      procesando.current = false
    }
  }, [])

  useEffect(() => {
    if (!esNativo() || !impresoraNativaDisponible()) return
    const { estacionImpresion } = leerConfig()
    const activa = Boolean(
      estacionImpresion.activa && estacionImpresion.impresoraDireccion,
    )
    setEstado((prev) => ({ ...prev, activa }))
    if (!activa) {
      void detenerServicioImpresion()
      setEstado((prev) => ({ ...prev, enServicio: false }))
      return
    }

    let cancelado = false
    const nombre =
      estacionImpresion.impresoraNombre || estacionImpresion.impresoraDireccion

    void iniciarServicioImpresion(
      'Kahabox · Impresora activa',
      `Escuchando trabajos para ${nombre}`,
    ).then(() => {
      if (!cancelado) setEstado((prev) => ({ ...prev, enServicio: true }))
    })

    void procesarPendientes()

    const canal = supabase
      .channel('trabajos-impresion')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trabajos_impresion',
        },
        () => {
          void procesarPendientes()
        },
      )
      .subscribe()

    const intervalo = window.setInterval(() => {
      void procesarPendientes()
    }, INTERVALO_SONDEO_MS)

    return () => {
      cancelado = true
      window.clearInterval(intervalo)
      void supabase.removeChannel(canal)
      void detenerServicioImpresion()
    }
  }, [procesarPendientes])

  return estado
}

export async function listarImpresorasDisponibles(): Promise<
  DispositivoBluetooth[]
> {
  return listarImpresoras()
}
