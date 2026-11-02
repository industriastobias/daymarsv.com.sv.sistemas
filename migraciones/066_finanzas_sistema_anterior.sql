-- Pasa las finanzas del sistema anterior (sistemassv) al sistema nuevo.
-- 1) Guarda una copia de lo que había en movimientos y cuentas.
-- 2) Borra los movimientos y cuentas actuales (las ventas NO se tocan).
-- 3) Carga: 4 ingresos por ventas, 11 gastos operativos, 33 gastos directos (costos) y la deuda por pagar.
-- Idempotente: si ya existe la copia de respaldo, no hace nada.
do $mig$
begin
  if to_regclass('public.respaldo_fin_movimientos_20261102') is not null then
    return;
  end if;

  create table public.respaldo_fin_movimientos_20261102 as select * from public.fin_movimientos;
  create table public.respaldo_fin_cuentas_20261102 as select * from public.fin_cuentas;
  alter table public.respaldo_fin_movimientos_20261102 enable row level security;
  alter table public.respaldo_fin_cuentas_20261102 enable row level security;

  delete from public.fin_movimientos;
  delete from public.fin_cuentas;

  insert into public.fin_movimientos (tipo, categoria, descripcion, monto, metodo, fecha, referencia)
  select v.tipo, v.categoria, v.descripcion, v.monto, v.metodo, v.fecha, 'Sistema anterior'
  from (values
    ('ingreso','Venta (sistema anterior)','Venta: CIERRE DE CAJA - TODOS LOS PRODUCTOS VENDIDOS · Cantidad vendida: 199',2352.39,'Efectivo','2026-08-16'::date),
    ('ingreso','Venta (sistema anterior)','Venta: RELOJ (Cód: PEDIDO317694377275455) · Cantidad vendida: 1',22.0,'Efectivo','2026-08-17'::date),
    ('ingreso','Venta (sistema anterior)','Venta: Collar (Cód: 0191001) · Cantidad vendida: 1',4.75,'Efectivo','2026-09-08'::date),
    ('ingreso','Venta (sistema anterior)','Venta: ARITOS (Cód: FAST_MV4K4VDZ) · Cantidad vendida: 1',2.0,'Efectivo','2026-10-12'::date),
    ('gasto','General','100 BOLSAS PARA CARTERAS',6.5,'Tarjeta','2025-10-16'::date),
    ('gasto','General','COMPRA DEL PRODUCTO · COMPRA DE PRODUCTO 1',277.33,'Tarjeta','2025-10-06'::date),
    ('gasto','Oficina','PERFORADORA PARA ARITOS · SHEIN',9.0,'Tarjeta','2025-10-31'::date),
    ('gasto','200 TARJETAS','TARJETAS',5.0,'Tarjeta','2025-10-31'::date),
    ('gasto','BOLSAS','BOLSAS DE REGALO',25.0,'Tarjeta','2025-11-17'::date),
    ('gasto','General','IMPUESTOS MAS ENVOS · PRIMER PEDIDO',25.29,'Tarjeta','2025-11-25'::date),
    ('gasto','UTILIDAD','COMPRA DE 224 STICKERS · STICKERS',12.0,'Tarjeta','2025-11-06'::date),
    ('gasto','General','COMPRA DE LISTON',4.5,'Tarjeta','2025-10-13'::date),
    ('gasto','COMPRA','COMPRA DEL PRIMER PRODUCTO · COMPRA · CPMPRA',362.77,'Tarjeta','2026-02-03'::date),
    ('gasto','PRESTAMO','PRESTAMO · PRESTAMO DE 500 · PRESTAMO DE 500 DOLARES QUE SOBRARON 53',315.0,'Tarjeta','2026-03-02'::date),
    ('gasto','RELOJES','RELOJES · PEDIDO NUMERO 2 · PEDIDO DE RELOJES',132.0,'Tarjeta','2026-03-03'::date),
    ('costo','IMPUESTOS','IMPUESTOS · ERNESTO',191.4,'Efectivo','2025-12-18'::date),
    ('costo','Salidab','Listón · Tatiana',6.0,'Efectivo','2025-12-18'::date),
    ('costo','COMPRA','COMPRA DE CARTON · COMPRA DE CARTON PARA TARJETAS · PAOLA',2.0,'Efectivo','2025-12-19'::date),
    ('costo','compra','COMPRA DE CAJAS PARA RELOJ · Tatiana',7.12,'Efectivo','2026-01-24'::date),
    ('costo','compra','COMPRA DE RELOJES · ERNESTO',150.65,'Efectivo','2026-01-24'::date),
    ('costo','Compra','COMPRA DE RELOJ · COMPRA · ERNESTO',177.72,'Efectivo','2026-01-25'::date),
    ('costo','compra','COMPRA DE ARTICULOS',9.39,'Efectivo','2026-01-25'::date),
    ('costo','COMPRA','COMPRA DE PULSERAS · ERNESTO',76.83,'Efectivo','2026-01-28'::date),
    ('costo','General','IMPUESTOS MAS ENVIO · Ernesto',37.35,'Efectivo','2026-01-31'::date),
    ('costo','COMPRA','COMPRA · COMPRA · ERNESTO',26.61,'Efectivo','2026-02-02'::date),
    ('costo','IMPUESTOS','IMPUESTOS · ERNESTO',32.25,'Efectivo','2026-02-13'::date),
    ('costo','COMPRA','PEDIDO ULTIMO · Pedido de 3 relojes · ernesto',14.3,'Efectivo','2026-02-16'::date),
    ('costo','compra','CAJAS PARA RELOJES · COMPRA · ERNESTO',55.74,'Efectivo','2026-02-26'::date),
    ('costo','IMPUESTOS','IMPUESTOS · IMPUESTOS · ERNESTO',28.69,'Efectivo','2026-02-26'::date),
    ('costo','compra','COMPRA DE BOLSAS DE REGALO · BOLSAS PARA CARTERA · Tatiana',7.0,'Efectivo','2026-01-24'::date),
    ('costo','COMPRA','COMPRA DE RELOJES · ... · ERNESTO',252.48,'Efectivo','2026-02-25'::date),
    ('costo','General','boxfull',3.15,'Efectivo','2026-03-08'::date),
    ('costo','CAJAS','pedido de temu cajas · CAJAS DE TEMU · ernesto',44.92,'Efectivo','2026-03-09'::date),
    ('costo','General','cajas pequeñas',19.0,'Efectivo','2026-03-19'::date),
    ('costo','IMPUESTOS','IMPUESTOS PRIMER PEDIDO · ernesto',36.79,'Efectivo','2026-03-19'::date),
    ('costo','OWALA','OWALA · OWALA · ernesto',56.25,'Efectivo','2026-03-13'::date),
    ('costo','ENVIO AEROFLAHS','ENVIO',3.39,'Efectivo','2026-03-25'::date),
    ('costo','Tik tok','PUBLICIDAD',12.55,'Efectivo','2026-03-28'::date),
    ('costo','ENVIOS','ENVIOS · PAGO DE ENVIOS A LOS CLIENTES · ernesto',25.2,'Efectivo','2026-03-26'::date),
    ('costo','IMPUESTOS','IMPUESTOS · IMPUESTOS DE ADUANAS · ernesto',25.2,'Efectivo','2026-04-07'::date),
    ('costo','IMPUESTOS','ADUANAS · ernesto',143.61,'Efectivo','2026-04-21'::date),
    ('costo','Stickers','STIKERS · Stickers de precios · ernesto',4.0,'Efectivo','2026-04-24'::date),
    ('costo','Tirro','PROMOCION · PAOLA',4.0,'Efectivo','2026-04-25'::date),
    ('costo','PUBLISHED','PUBLICIDAD · TIKTOK · PAOLA',4.0,'Efectivo','2026-05-01'::date),
    ('costo','PASIVO','PRESTAMO · ernesto',500.0,'Efectivo','2026-05-26'::date),
    ('costo','Compra','jewelry · COMPRA DE ARITOS, PULSERAS  Y RELOJES CON TARJETAS PARA ARITOS · Ernesto',100.0,'Efectivo','2026-09-15'::date),
    ('costo','COMPRA','TARJETA · COMPRA DE TARJETAS DE PRESENTACION · ERNESTO',20.0,'Efectivo','2026-09-08'::date),
    ('costo','PRESTAMO','PRESTAMO · PRESTAMO DE ERNESTO Y PAOLA $25 CADA UNO · PAOLA Y ERNESTO',50.0,'Efectivo','2026-09-01'::date)
  ) as v(tipo, categoria, descripcion, monto, metodo, fecha);

  insert into public.fin_cuentas (tipo, tercero, concepto, monto, abonado, fecha, vence, estado)
  values ('pagar', 'PRESTAMO', 'PRESTAMO PARA PRODUCTOS 2026-OCTUBRE · PRESTAMO', 190, 0, '2026-10-11'::date, '2026-10-11'::date, 'pendiente');
end
$mig$;
