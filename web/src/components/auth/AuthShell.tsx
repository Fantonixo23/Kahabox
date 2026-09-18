import type { ReactNode } from 'react'

export function BrandMark() {
  return (
    <div className="flex flex-col items-center text-center">
      <img
        src="/logo.png"
        alt="Kahabox"
        className="size-24 object-contain"
      />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        <span className="text-neutral-400">Kaha</span>
        <span className="text-karton">BOX</span>
      </h1>
    </div>
  )
}

export function AuthShell({
  subtitle,
  children,
}: {
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-fondo-login p-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <BrandMark />
        {subtitle && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {subtitle}
          </p>
        )}
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-card dark:ring-white/10">
          {children}
        </div>
      </div>
    </div>
  )
}