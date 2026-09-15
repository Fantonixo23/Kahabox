import { useEffect } from 'react'

/**
 * Detecta un lector de código de barras físico (USB/BT) que se comporta como
 * un teclado: dispara las teclas del código en rápida sucesión y cierra con
 * Enter. Ignora el tipeo normal dentro de inputs/formularios.
 */
export function useKeyboardScanner(onScan: (code: string) => void) {
  useEffect(() => {
    let buffer = ''
    let ultimo = 0

    function handle(e: KeyboardEvent) {
      const objetivo = e.target as HTMLElement | null
      if (
        objetivo instanceof HTMLInputElement ||
        objetivo instanceof HTMLTextAreaElement ||
        objetivo instanceof HTMLSelectElement ||
        (objetivo && objetivo.isContentEditable)
      ) {
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const ahora = Date.now()
      if (ahora - ultimo > 60) buffer = ''
      ultimo = ahora

      if (e.key === 'Enter') {
        const code = buffer.trim()
        if (code.length >= 4) {
          buffer = ''
          onScan(code)
        }
        return
      }

      if (e.key.length === 1) {
        buffer += e.key
        if (buffer.length > 40) buffer = buffer.slice(-40)
      }
    }

    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onScan])
}