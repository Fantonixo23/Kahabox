import { useEffect, useState } from 'react'

import QRCode from 'qrcode'

export default function QrCode({
  value,
  size = 200,
  className,
}: {
  value: string
  size?: number
  className?: string
}) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let activo = true
    if (!value) {
      setSrc('')
      return
    }
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (activo) setSrc(url)
      })
      .catch(() => {
        if (activo) setSrc('')
      })
    return () => {
      activo = false
    }
  }, [value, size])

  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-md border bg-muted/50 text-xs text-muted-foreground ${className ?? ''}`}
      >
        …
      </div>
    )
  }

  return (
    <img
      src={src}
      alt="Código QR de la caja"
      width={size}
      height={size}
      className={`rounded-md border bg-white p-1 ${className ?? ''}`}
    />
  )
}