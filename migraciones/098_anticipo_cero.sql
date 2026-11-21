-- 098 · Preventa: el anticipo puede ser 0% (sin anticipo: el cliente paga todo al recibir)
alter table productos drop constraint if exists productos_preventa_anticipo_chk;
alter table productos add constraint productos_preventa_anticipo_chk check (preventa_anticipo between 0 and 100);
