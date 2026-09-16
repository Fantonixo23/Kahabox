import type { ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { desformatearMonto, formatearMiles } from '@/lib/format'

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (valor: string) => void
}

// Input de montos: muestra separador de miles mientras se escribe (3000 → 3.000)
// y entrega al onChange el valor crudo ("3000") que espera Number().
export default function MoneyInput({ value, onChange, ...rest }: Props) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={formatearMiles(value)}
      onChange={(e) => onChange(desformatearMonto(e.target.value))}
    />
  )
}