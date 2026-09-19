import type { ReactNode } from 'react'

import { Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import { FullscreenLoader } from '@/components/FullscreenLoader'
import RequiereRol from '@/components/RequiereRol'
import TenantGate from '@/components/TenantGate'
import { useAuth } from '@/components/auth/AuthContext'
import AuditoriaPage from '@/pages/AuditoriaPage'
import CajaPage from '@/pages/CajaPage'
import AprobacionPage from '@/pages/AprobacionPage'
import ClientesPage from '@/pages/ClientesPage'
import ConfiguracionPage from '@/pages/ConfiguracionPage'
import EquipoPage from '@/pages/EquipoPage'
import EscaneadorPage from '@/pages/EscaneadorPage'
import InstalarPage from '@/pages/InstalarPage'
import LoginPage from '@/pages/LoginPage'
import PagosProveedoresPage from '@/pages/PagosProveedoresPage'
import ProveedoresPage from '@/pages/ProveedoresPage'
import RecoveryPage from '@/pages/RecoveryPage'
import RegisterPage from '@/pages/RegisterPage'
import ReportesPage from '@/pages/ReportesPage'
import StockPage from '@/pages/StockPage'
import UnirsePage from '@/pages/UnirsePage'
import VentasPage from '@/pages/VentasPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullscreenLoader />
  if (!session) return <Navigate to="/login" replace />
  return children
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullscreenLoader />
  if (session) return <Navigate to="/app/stock" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />
      <Route path="/recuperar-contrasena" element={<RecoveryPage />} />
      <Route path="/aprobado" element={<AprobacionPage />} />
      <Route path="/unirme" element={<UnirsePage />} />
      <Route path="/escaneo" element={<EscaneadorPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <TenantGate>
              <AppLayout />
            </TenantGate>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="stock" replace />} />
        <Route path="caja" element={<CajaPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="ventas" element={<VentasPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route
          path="proveedores"
          element={
            <RequiereRol ruta="/app/proveedores">
              <ProveedoresPage />
            </RequiereRol>
          }
        />
        <Route
          path="pagos-proveedores"
          element={
            <RequiereRol ruta="/app/pagos-proveedores">
              <PagosProveedoresPage />
            </RequiereRol>
          }
        />
        <Route
          path="equipo"
          element={
            <RequiereRol ruta="/app/equipo">
              <EquipoPage />
            </RequiereRol>
          }
        />
        <Route
          path="configuracion"
          element={
            <RequiereRol ruta="/app/configuracion">
              <ConfiguracionPage />
            </RequiereRol>
          }
        />
        <Route
          path="auditoria"
          element={
            <RequiereRol ruta="/app/auditoria">
              <AuditoriaPage />
            </RequiereRol>
          }
        />
        <Route
          path="reportes"
          element={
            <RequiereRol ruta="/app/reportes">
              <ReportesPage />
            </RequiereRol>
          }
        />
        <Route
          path="instalar"
          element={
            <RequiereRol ruta="/app/instalar">
              <InstalarPage />
            </RequiereRol>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}