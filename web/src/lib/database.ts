export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          nombre_comercial: string
          estado: 'pendiente' | 'trial' | 'activo' | 'suspendido' | 'rechazado'
          plan: string
          email_contacto: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nombre_comercial: string
          estado?: 'pendiente' | 'trial' | 'activo' | 'suspendido' | 'rechazado'
          plan?: string
          email_contacto?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nombre_comercial?: string
          estado?: 'pendiente' | 'trial' | 'activo' | 'suspendido' | 'rechazado'
          plan?: string
          email_contacto?: string | null
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
      venta_pagos: {
        Row: {
          id: string
          tenant_id: string
          venta_id: string
          metodo: 'efectivo' | 'pos' | 'transferencia' | 'fiado'
          moneda: 'PYG' | 'USD' | 'ARS' | 'BRL'
          monto: number
          detalle: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          venta_id: string
          metodo: 'efectivo' | 'pos' | 'transferencia' | 'fiado'
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          monto: number
          detalle?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          venta_id?: string
          metodo?: 'efectivo' | 'pos' | 'transferencia' | 'fiado'
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          monto?: number
          detalle?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'venta_pagos_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venta_pagos_venta_id_fkey'
            columns: ['venta_id']
            isOneToOne: false
            referencedRelation: 'ventas'
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
      clientes: {
        Row: {
          id: string
          tenant_id: string
          nombre: string
          tipo: 'fisica' | 'juridica'
          ruc: string | null
          cedula: string | null
          telefono: string | null
          email: string | null
          direccion: string | null
          ciudad: string | null
          notas: string | null
          activo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          nombre: string
          tipo?: 'fisica' | 'juridica'
          ruc?: string | null
          cedula?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          ciudad?: string | null
          notas?: string | null
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          nombre?: string
          tipo?: 'fisica' | 'juridica'
          ruc?: string | null
          cedula?: string | null
          telefono?: string | null
          email?: string | null
          direccion?: string | null
          ciudad?: string | null
          notas?: string | null
          activo?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clientes_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      deudas: {
        Row: {
          id: string
          tenant_id: string
          cliente_id: string
          venta_id: string | null
          fecha: string
          vencimiento: string | null
          monto: number
          moneda: 'PYG' | 'USD' | 'ARS' | 'BRL'
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          cliente_id: string
          venta_id?: string | null
          fecha?: string
          vencimiento?: string | null
          monto: number
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          cliente_id?: string
          venta_id?: string | null
          fecha?: string
          vencimiento?: string | null
          monto?: number
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'deudas_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deudas_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'deudas_venta_id_fkey'
            columns: ['venta_id']
            isOneToOne: false
            referencedRelation: 'ventas'
            referencedColumns: ['id']
          },
        ]
      }
      cobros: {
        Row: {
          id: string
          tenant_id: string
          cliente_id: string
          fecha: string
          concepto: string | null
          monto: number
          moneda: 'PYG' | 'USD' | 'ARS' | 'BRL'
          metodo: 'efectivo' | 'pos' | 'transferencia'
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          cliente_id: string
          fecha?: string
          concepto?: string | null
          monto: number
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          metodo?: 'efectivo' | 'pos' | 'transferencia'
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          cliente_id?: string
          fecha?: string
          concepto?: string | null
          monto?: number
          moneda?: 'PYG' | 'USD' | 'ARS' | 'BRL'
          metodo?: 'efectivo' | 'pos' | 'transferencia'
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cobros_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cobros_cliente_id_fkey'
            columns: ['cliente_id']
            isOneToOne: false
            referencedRelation: 'clientes'
            referencedColumns: ['id']
          },
        ]
      }
      auditoria: {
        Row: {
          id: string
          tenant_id: string
          usuario_id: string | null
          usuario_nombre: string | null
          rol: 'dueño' | 'vendedor' | null
          sucursal_id: string | null
          entidad: string
          entidad_id: string | null
          entidad_nombre: string | null
          comando: string
          descripcion: string | null
          antes: Record<string, unknown> | null
          despues: Record<string, unknown> | null
          lote_id: string | null
          ip: string | null
          dispositivo: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
          rol?: 'dueño' | 'vendedor' | null
          sucursal_id?: string | null
          entidad: string
          entidad_id?: string | null
          entidad_nombre?: string | null
          comando: string
          descripcion?: string | null
          antes?: Record<string, unknown> | null
          despues?: Record<string, unknown> | null
          lote_id?: string | null
          ip?: string | null
          dispositivo?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
          rol?: 'dueño' | 'vendedor' | null
          sucursal_id?: string | null
          entidad?: string
          entidad_id?: string | null
          entidad_nombre?: string | null
          comando?: string
          descripcion?: string | null
          antes?: Record<string, unknown> | null
          despues?: Record<string, unknown> | null
          lote_id?: string | null
          ip?: string | null
          dispositivo?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'auditoria_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'auditoria_usuario_id_fkey'
            columns: ['usuario_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'auditoria_sucursal_id_fkey'
            columns: ['sucursal_id']
            isOneToOne: false
            referencedRelation: 'sucursales'
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
      trabajos_impresion: {
        Row: {
          id: string
          tenant_id: string
          sucursal_id: string | null
          estacion_id: string | null
          ancho: number
          payload: string
          estado: 'pendiente' | 'imprimiendo' | 'impreso' | 'error'
          intentos: number
          error: string | null
          creado_por: string | null
          created_at: string
          impreso_en: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          estacion_id?: string | null
          ancho?: number
          payload: string
          estado?: 'pendiente' | 'imprimiendo' | 'impreso' | 'error'
          intentos?: number
          error?: string | null
          creado_por?: string | null
          created_at?: string
          impreso_en?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          sucursal_id?: string | null
          estacion_id?: string | null
          ancho?: number
          payload?: string
          estado?: 'pendiente' | 'imprimiendo' | 'impreso' | 'error'
          intentos?: number
          error?: string | null
          creado_por?: string | null
          created_at?: string
          impreso_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'trabajos_impresion_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'trabajos_impresion_sucursal_id_fkey'
            columns: ['sucursal_id']
            isOneToOne: false
            referencedRelation: 'sucursales'
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
    Functions: {
      registrar_venta: {
        Args: {
          p_venta_id: string
          p_sucursal_id: string | null
          p_total: number
          p_items: Record<string, unknown>[]
          p_pagos?: Record<string, unknown>[]
          p_estado?: 'pendiente_sync' | 'confirmada' | 'anulada'
          p_created_at?: string | null
          p_dispositivo?: string | null
        }
        Returns: Record<string, unknown>
      }
      anular_venta: {
        Args: {
          p_venta_id: string
          p_dispositivo?: string | null
        }
        Returns: Record<string, unknown>
      }
      registrar_producto: {
        Args: {
          p_maestro_id: string
          p_codigo: string | null
          p_nombre: string
          p_marca: string | null
          p_categoria: string | null
          p_linea_id: string
          p_sucursal_id: string | null
          p_sku: string | null
          p_variante: string | null
          p_precio: number
          p_costo: number | null
          p_moneda: 'PYG' | 'USD'
          p_cantidad: number
          p_created_at?: string | null
        }
        Returns: string
      }
      registrar_ajuste: {
        Args: {
          p_movimiento_id: string
          p_linea_id: string
          p_sucursal_id: string | null
          p_tipo: 'entrada' | 'salida'
          p_cantidad: number
          p_motivo: string | null
          p_producto_nombre: string
          p_codigo_barras: string | null
          p_sku: string | null
          p_created_at?: string | null
          p_dispositivo?: string | null
        }
        Returns: Record<string, unknown>
      }
      actualizar_producto: {
        Args: {
          p_linea_id: string
          p_nombre: string
          p_marca: string | null
          p_categoria: string | null
          p_sku: string | null
          p_variante: string | null
          p_precio: number
          p_costo: number | null
          p_moneda: 'PYG' | 'USD'
          p_dispositivo?: string | null
        }
        Returns: Record<string, unknown>
      }
      importar_stock: {
        Args: {
          p_sucursal_id: string | null
          p_filas: Record<string, unknown>[]
          p_lote_id?: string | null
          p_dispositivo?: string | null
        }
        Returns: Record<string, unknown>
      }
      tomar_trabajo_impresion: {
        Args: {
          p_estacion: string
          p_sucursal?: string | null
        }
        Returns: Record<string, unknown> | null
      }
      finalizar_trabajo_impresion: {
        Args: {
          p_id: string
          p_ok: boolean
          p_error?: string | null
        }
        Returns: Record<string, unknown>
      }
    }
    Enums: {}
    CompositeTypes: {}
  }
}