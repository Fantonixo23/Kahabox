import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import type { Session, User } from '@supabase/supabase-js'

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { demoSession, demoUser } from '@/lib/mock'

type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  entrarDemo: () => void
  salirDemo: () => void
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  entrarDemo: () => {},
  salirDemo: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: !isSupabaseConfigured ? false : true,
    entrarDemo: () => {},
    salirDemo: () => {},
  })

  useEffect(() => {
    if (!isSupabaseConfigured) return

    supabase.auth
      .getSession()
      .then(({ data }) =>
        setState((prev) => ({
          ...prev,
          session: data.session,
          user: data.session?.user ?? null,
          loading: false,
        })),
      )
      .catch(() =>
        setState((prev) => ({ ...prev, session: null, user: null, loading: false })),
      )

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
          loading: false,
        }))
      },
    )

    return () => subscription.subscription.unsubscribe()
  }, [])

  function entrarDemo() {
    setState((prev) => ({ ...prev, session: demoSession, user: demoUser, loading: false }))
  }

  function salirDemo() {
    setState((prev) => ({ ...prev, session: null, user: null, loading: false }))
  }

  return <AuthContext.Provider value={{ ...state, entrarDemo, salirDemo }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}