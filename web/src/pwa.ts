// Auto-actualización del service worker: con registerType:'autoUpdate' la app
// instala y activa la versión nueva, pero la página abierta sigue pintando los
// assets viejos hasta un reload. Acá se fuerza ese reload: si el arranque es
// reciente (a los pocos segundos de abrir la app) se recarga en el acto; si la
// actualización llega en pleno uso, se espera a que la app pase a segundo plano
// para recargar y no pisar ninguna operación en curso.

import { registerSW } from 'virtual:pwa-register'

const inicio = performance.now()
const habiaControlador = Boolean(navigator.serviceWorker?.controller)

let aplicacionPendiente = false

function pocosSegundosDeUso(): boolean {
  return performance.now() - inicio < 5000
}

function recargarEnSiguienteSegundoPlano(): void {
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) window.location.reload()
    },
    { once: true },
  )
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || aplicacionPendiente) return
    aplicacionPendiente = true
    if (document.hidden || pocosSegundosDeUso()) {
      window.location.reload()
    } else {
      recargarEnSiguienteSegundoPlano()
    }
  })
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    const comprobar = () => {
      if (navigator.onLine) registration?.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') comprobar()
    })
    window.addEventListener('online', comprobar)
    const intervalo = window.setInterval(comprobar, 5 * 60 * 1000)
    window.addEventListener('beforeunload', () => window.clearInterval(intervalo))
  },
})