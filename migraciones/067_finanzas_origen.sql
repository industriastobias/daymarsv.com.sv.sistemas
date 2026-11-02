-- Finanzas simple: cada salida de dinero dice DE DÓNDE salió.
--   'ventas' = se pagó con el dinero de las ventas
--   'propio' = lo puso el dueño (tarjeta de crédito o su bolsillo)
alter table fin_movimientos add column if not exists origen text default 'ventas';
alter table fin_movimientos drop constraint if exists fin_movimientos_origen_check;
alter table fin_movimientos add constraint fin_movimientos_origen_check check (origen in ('ventas','propio'));
-- Los movimientos traídos del sistema anterior: sus "gastos operativos" se pagaron con tarjeta (propio);
-- sus "gastos desde ingresos" salieron de las ventas.
update fin_movimientos set origen = 'propio' where referencia = 'Sistema anterior' and tipo = 'gasto';
update fin_movimientos set origen = 'ventas' where origen is null;
