-- Kahabox — Migración: método de pago "Tarjeta"
--
-- Permite registrar "Tarjeta" como método de pago genérico (sin terminal
-- Bancard). Se habilita en el CHECK de venta_pagos (Caja) y cobros (cobros de
-- clientes), que antes solo aceptaban ('efectivo','pos','transferencia','fiado').

alter table public.venta_pagos
  drop constraint if exists venta_pagos_metodo_check;

alter table public.venta_pagos
  add constraint venta_pagos_metodo_check
  check (metodo in ('efectivo', 'pos', 'tarjeta', 'transferencia', 'fiado'));

alter table public.cobros
  drop constraint if exists cobros_metodo_check;

alter table public.cobros
  add constraint cobros_metodo_check
  check (metodo in ('efectivo', 'pos', 'tarjeta', 'transferencia'));