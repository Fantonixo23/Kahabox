import { LoaderCircle } from 'lucide-react'

export function FullscreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}