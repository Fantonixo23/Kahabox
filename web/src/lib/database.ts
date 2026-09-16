export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          nombre_comercial: string
          estado: 'activo' | 'suspendido' | 'trial'
          plan: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre_comercial: string
          estado?: 'activo' | 'suspendido' | 'trial'
          plan?: string
          created_at?: string
        }
        Update: {
          id?: string
          nombre_comercial?: string
          estado?: 'activo' | 'suspendido' | 'trial'
          plan?: string
          created_at?: string
        }
        Relationships: []
      }
      usuarios_tenant: {
        Row: {
          id: string
          user_id: string
          tenant_id: string
          rol: 'dueño' | 'vendedor'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id?: string
          rol?: 'dueño' | 'vendedor'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string
          rol?: 'dueño' | 'vendedor'
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'usuarios_tenant_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      pagos_proveedores: {
        Row: {
          id: string
          tenant_id: string
          proveedor_id: string
          fecha: string
          concepto: string | null
          monto: number
          moneda: 'PYG' | 'USD' | 'ARS' | 'BRL'
          metodo: 'efectivo' | 'tarjeta' | 'transferencia'
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          proveedor_id: string
          fecha?: string
          concepto?: string | null
          monto: number
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          metodo?: 'efectivo' | 'tarjeta' | 'transferencia'
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          proveedor_id?: string
          fecha?: string
          concepto?: string | null
          monto?: number
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          metodo?: 'efectivo' | 'tarjeta' | 'transferencia'
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pagos_proveedores_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pagos_proveedores_proveedor_id_fkey'
            columns: ['proveedor_id']
            isOneToOne: false
            referencedRelation: 'proveedores'
            referencedColumns: ['id']
          },
        ]
      }
      productos_maestro: {
        Row: {
          id: string
          codigo_barras: string | null
          nombre: string
          marca: string | null
          categoria: string | null
          foto_url: string | null
          creado_por_tenant_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          codigo_barras?: string | null
          nombre: string
          marca?: string | null
          categoria?: string | null
          foto_url?: string | null
          creado_por_tenant_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          codigo_barras?: string | null
          nombre?: string
          marca?: string | null
          categoria?: string | null
          foto_url?: string | null
          creado_por_tenant_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          id: string
          tenant_id: string
          nombre: string
          ruc: string | null
          telefono: string | null
          email: string | null
          direccion: string | null
          activo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          nombre: string
          ruc?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          nombre?: string
          ruc?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          activo?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'proveedores_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      sucursales: {
        Row: {
          id: string
          tenant_id: string
          nombre: string
          direccion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          nombre: string
          direccion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          nombre?: string
          direccion?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sucursales_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      stock_tienda: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string | null
          producto_id: string
          sku: string | null
          variante: string | null
          precio: number
          costo: number | null
          moneda: 'PYG' | 'USD'
          cantidad: number
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          producto_id: string
          sku?: string | null
          variante?: string | null
          precio: number
          costo?: number | null
          moneda?: 'PYG' | 'USD'
          cantidad?: number
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          producto_id?: string
          sku?: string | null
          variante?: string | null
          precio?: number
          costo?: number | null
          moneda?: 'PYG' | 'USD'
          cantidad?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stock_tienda_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_tienda_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos_maestro'
            referencedColumns: ['id']
          },
        ]
      }
      ventas: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string | null
          vendedor_id: string | null
          total: number
          estado: 'pendiente_sync' | 'confirmada' | 'anulada'
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          vendedor_id?: string | null
          total: number
          estado?: 'pendiente_sync' | 'confirmada' | 'anulada'
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          vendedor_id?: string | null
          total?: number
          estado?: 'pendiente_sync' | 'confirmada' | 'anulada'
          created_at?: string
        }
Relationships: [
          {
            foreignKeyName: 'ventas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      venta_items: {
        Row: {
          id: string
          venta_id: string
          stock_tienda_id: string | null
          tenant_id: string
          cantidad: number
          precio_unitario: number
        }
        Insert: {
          id?: string
          venta_id: string
          stock_tienda_id?: string | null
          tenant_id?: string
          cantidad: number
          precio_unitario: number
        }
        Update: {
          id?: string
          venta_id?: string
          stock_tienda_id?: string | null
          tenant_id?: string
          cantidad?: number
          precio_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: 'venta_items_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_items_venta_id_fkey'
            columns: ['venta_id']
            isOneToOne: false
            referencedRelation: 'ventas'
            referencedColumns: ['id']
          },
        ]
      }
      stock_movimientos: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string | null
          linea_id: string | null
          producto_nombre: string
          codigo_barras: string | null
          sku: string | null
          tipo: 'entrada' | 'salida' | 'transferencia_origen' | 'transferencia_destino'
          cantidad: number
          motivo: string | null
          ref_sucursal_id: string | null
          ref_sucursal_nombre: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          linea_id?: string | null
          producto_nombre: string
          codigo_barras?: string | null
          sku?: string | null
          tipo?: 'entrada' | 'salida' | 'transferencia_origen' | 'transferencia_destino'
          cantidad: number
          motivo?: string | null
          ref_sucursal_id?: string | null
          ref_sucursal_nombre?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          linea_id?: string | null
          producto_nombre?: string
          codigo_barras?: string | null
          sku?: string | null
          tipo?: 'entrada' | 'salida' | 'transferencia_origen' | 'transferencia_destino'
          cantidad?: number
          motivo?: string | null
          ref_sucursal_id?: string | null
          ref_sucursal_nombre?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stock_movimientos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      stock_tienda_vendedor: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string | null
          producto_id: string
          sku: string | null
          variante: string | null
          precio: number
          moneda: 'PYG' | 'USD'
          cantidad: number
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'stock_tienda_vendedor_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos_maestro'
            referencedColumns: ['id']
          },
        ]
      }
      stock_tienda_dueno: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string | null
          producto_id: string
          sku: string | null
          variante: string | null
          precio: number
          costo: number | null
          moneda: 'PYG' | 'USD'
          cantidad: number
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'stock_tienda_dueno_producto_id_fkey'
            columns: ['producto_id']
            isOneToOne: false
            referencedRelation: 'productos_maestro'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}