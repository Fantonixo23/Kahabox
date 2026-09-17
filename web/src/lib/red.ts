import { useEffect, useState } from 'react'

const CODIGOS_RED = new Set([
  'ERR_NETWORK',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_CONNECTION_REFUSED',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'FH_ENETUNREACH',
  'ABORT_ERR',
])

export function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.onLine === false) return true
  if (e === null || typeof e !== 'object') return false
  const causa = e as {
    code?: string
    message?: string
    name?: string
    cause?: unknown
  }
  const codigo = causa.code
  if (codigo && CODIGOS_RED.has(codigo)) return true
  const msg = `${causa.message ?? ''} ${causa.name ?? ''}`.toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('network request failed') ||
    msg.includes('network connection') ||
    msg.includes('load failed') ||
    msg.includes('connection refused') ||
    msg.includes('timed out') ||
    msg.includes('timeout exceeded') ||
    msg.includes('socket hang up') ||
    msg.includes('socket disconnected') ||
    msg.includes('unexpected end of json') ||
    msg.includes('the internet connection appears to be offline')
  )
}

export function navegadorEnLinea(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(navegadorEnLinea)

  useEffect(() => {
    function alEnLinea() {
      setEnLinea(true)
    }
    function alFueraDeLinea() {
      setEnLinea(false)
    }
    window.addEventListener('online', alEnLinea)
    window.addEventListener('offline', alFueraDeLinea)
    return () => {
      window.removeEventListener('online', alEnLinea)
      window.removeEventListener('offline', alFueraDeLinea)
    }
  }, [])

  return enLinea
}